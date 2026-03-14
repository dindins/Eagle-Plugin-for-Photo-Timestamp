/**
 * main.js - Eagle 4 插件主入口
 * 對照官方 Window 範例結構：
 * - eagle.onPluginCreate → 初始化 UI（一次）
 * - eagle.onPluginShow   → 刷新選取狀態
 * - eagle.onPluginRun    → 使用者點擊時觸發
 */

'use strict';

// ══════════════════════════════════════════
//  DevTools 防護層（必須最早載入）
//  Eagle 某些版本會在偵測到 console 輸出或未捕獲錯誤時強制開啟 DevTools，
//  即使 manifest.json 設定 devTools: false 也無效。
//  策略：(1) 靜默 console + 可控日誌 (2) 攔截未捕獲錯誤 (3) 持續關閉 DevTools
// ══════════════════════════════════════════

// [防護 1] 備份原始 console + 建立可控日誌系統
const _noop = () => {};
const _origConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

// 生產環境 false，偵錯時改 true 即可恢復日誌輸出
const _LOG_ENABLED = false;
const _log = {
    info: _LOG_ENABLED ? _origConsole.log : _noop,
    warn: _LOG_ENABLED ? _origConsole.warn : _noop,
    error: _LOG_ENABLED ? _origConsole.error : _noop,
};
window._log = _log;

// 靜默 console，防止 Eagle 偵測到輸出
console.log = _noop;
console.warn = _noop;
console.error = _noop;
console.info = _noop;
console.debug = _noop;

// [防護 2] 攔截所有未捕獲的 rejection
window.addEventListener('unhandledrejection', (event) => { event.preventDefault(); });
try {
    if (typeof process !== 'undefined' && typeof process.on === 'function') {
        process.on('unhandledRejection', () => {});
    }
} catch (_) { }

// [防護 3] 攔截全域錯誤
window.onerror = () => true;

// [防護 4] 封鎖 F12 / Ctrl+Shift+I 等快捷鍵
document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j'))) {
        e.preventDefault();
        e.stopPropagation();
    }
}, true);

// [防護 5] 持續關閉 DevTools（每 5 秒檢查，共 3 次）
const DEVTOOLS_GUARD_INTERVAL_MS = 5000;
const DEVTOOLS_GUARD_MAX_CHECKS = 3;
let _devToolsGuardCount = 0;

function _forceCloseDevTools() {
    try {
        if (eagle && eagle.plugin && typeof eagle.plugin.closeDevTools === 'function') {
            eagle.plugin.closeDevTools();
        }
    } catch (_) { }
}

const _devToolsGuardTimer = setInterval(() => {
    _forceCloseDevTools();
    _devToolsGuardCount++;
    if (_devToolsGuardCount >= DEVTOOLS_GUARD_MAX_CHECKS) clearInterval(_devToolsGuardTimer);
}, DEVTOOLS_GUARD_INTERVAL_MS);

// ── 常數定義 ─────────────────────────────
const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const EAGLE_API_TIMEOUT_MS = 2000;
const EAGLE_API_MAX_RETRIES = 10;
const EAGLE_API_RETRY_DELAY_MS = 50;
const AUTO_RETRY_DELAY_MS = 3000;
const PREVIEW_DEBOUNCE_MS = 150;
const FIRST_SHOW_DELAY_MS = 1000;
const FILE_NAME_MAX_LENGTH = 20;
const FILE_NAME_BASE_MAX_LENGTH = 200; // 燒印後檔名基底最大字元數（留空間給副檔名）

// ── 自動重試計時器（供 refreshSelection 取消用） ──
let _autoRetryTimer = null;

// ── 全域狀態封裝 ─────────────────────────
const State = {
    images: [],           // 當前選取的圖片路徑列表
    items: [],            // 當前選取的 Eagle item 物件列表
    previewIndex: 0,      // 預覽中的圖片索引
    pluginCreated: false,
    refreshing: false,
    applying: false,
    cancelled: false,
    hadExif: false,       // 當前選取的第一張圖是否有 EXIF
    autoRetryScheduled: false,
    firstShowDone: false,
    startupItems: null,   // onItemSelectionChanged 快取
    pluginRunArgs: null,
    activeFolders: null,  // 用戶選定的目標資料夾 ID 集合（Set 或 null=全部）
};

// ── 模組通訊命名空間 ─────────────────────
window.TimestampPlugin = window.TimestampPlugin || {};

// ── UI 工具 ────────────────────────────────
function showLoading(txt, prog) {
    document.getElementById('loadingOverlay').classList.add('visible');
    document.getElementById('loadingText').textContent = txt || '處理中...';
    document.getElementById('loadingProgress').textContent = prog || '';
}

function updateProgress(i, n) {
    document.getElementById('loadingProgress').textContent = `${i} / ${n}`;
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('visible');
}

function setStatus(txt, ok) {
    const el = document.getElementById('infoText');
    if (!el) return;
    el.textContent = txt;
    if (ok === true) {
        el.className = 'status-success';
    } else if (ok === false) {
        el.className = 'status-error';
    } else {
        el.className = '';
    }
}

function setApplyBtn(enabled, label) {
    const btn = document.getElementById('applyBtn');
    if (!btn) return;
    btn.disabled = !enabled;
    document.getElementById('applyBtnText').textContent = label || '套用時間戳記';
}

function showError(msg) {
    _log.error('[TimestampTool]', msg);
    setStatus('❌ ' + msg, false);
    hideLoading();
    setApplyBtn(false, '套用時間戳記');
}

// ── 篩選圖片 ──────────────────────────────
function filterImages(items) {
    if (!Array.isArray(items)) {
        _log.warn('[TimestampTool] items 不是陣列:', items);
        return [];
    }
    return items.filter(item => {
        if (!item) return false;
        const fp = item.filePath || item.fileURL || '';
        if (!fp) return false;
        const lastDot = fp.lastIndexOf('.');
        if (lastDot === -1) return false;
        const ext = fp.toLowerCase().slice(lastDot);
        return SUPPORTED_EXT.has(ext);
    });
}

// ── 自動填入日期（使用統一入口） ─────────
function autoFillDate(filePath) {
    try {
        const { date, hadExif } = TimestampEngine.getDateForFile(filePath);
        State.hadExif = hadExif;

        // 轉換為 YYYY-MM-DDTHH:mm 格式放入 datetime-local
        const localStr = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
            .toISOString().slice(0, 16);

        document.getElementById('manualDatetime').value = localStr;

        // 更新 EXIF 來源標籤
        const badge = document.getElementById('exifSourceBadge');
        if (badge) {
            badge.textContent = hadExif ? '📸 EXIF' : '📁 建立時間';
            badge.className = 'exif-source-badge ' + (hadExif ? 'exif-badge-exif' : 'exif-badge-file');
        }
    } catch (e) {
        _log.warn('[TimestampTool] autoFillDate error:', e);
    }
}

// ── 預覽導航（消除重複邏輯） ─────────────
function navigateToPreview(newIndex) {
    State.previewIndex = newIndex;
    updatePreviewControls();
    // 僅「原始照片時間」模式才讀取 EXIF，不干擾手動或當前時間模式
    if (Settings.getTimeSource() === 'original') {
        autoFillDate(State.images[State.previewIndex]);
    }
    updatePreview();
}

// ── 清除預覽 ──────────────────────────────
function clearPreview() {
    const canvas = document.getElementById('previewCanvas');
    if (!canvas) return;
    canvas.width = 400;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 顯示佔位提示
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = 'bold 15px "Microsoft JhengHei", Arial, sans-serif';
    ctx.fillText('請在 Eagle 中選取照片', canvas.width / 2, canvas.height / 2 - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.font = '12px "Microsoft JhengHei", Arial, sans-serif';
    ctx.fillText('選取後將自動顯示預覽', canvas.width / 2, canvas.height / 2 + 16);
}

// ── 更新預覽控制列 ────────────────────────
function updatePreviewControls() {
    const total = State.images.length;
    const pageInd = document.getElementById('previewPage');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (total === 0) {
        if (pageInd) pageInd.textContent = '0 / 0';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
    } else {
        if (pageInd) pageInd.textContent = `${State.previewIndex + 1} / ${total}`;
        if (prevBtn) prevBtn.disabled = State.previewIndex <= 0;
        if (nextBtn) nextBtn.disabled = State.previewIndex >= total - 1;
    }
}

// ── 更新預覽畫面（防抖） ─────────────────
let previewTimeout = null;

function updatePreview() {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(async () => {
        if (State.images.length === 0) return;
        const currentPreviewPath = State.images[State.previewIndex];
        if (!currentPreviewPath) return;

        const canvas = document.getElementById('previewCanvas');
        if (!canvas) {
            _log.warn('[TimestampTool] 找不到 previewCanvas');
            return;
        }

        try {
            const opts = Settings.getAll(currentPreviewPath);
            await TimestampEngine.renderPreview(currentPreviewPath, opts, canvas);
        } catch (e) {
            _log.warn('[TimestampTool] 預覽繪製失敗:', e);
            showError(`預覽載入失敗: ${e.message}`);
        }
    }, PREVIEW_DEBOUNCE_MS);
}

// 暴露給 settings.js 的觸發介面（透過命名空間）
window.TimestampPlugin.onSettingsChanged = updatePreview;

// 時間來源模式切換時觸發（供切換回 original 模式時重新填入 EXIF 日期）
window.TimestampPlugin.onTimeSourceChanged = (source) => {
    if (source === 'original' && State.images.length > 0) {
        autoFillDate(State.images[State.previewIndex]);
    }
};

// ── 重設選取狀態為空 ─────────────────────
function resetSelection() {
    State.images = [];
    State.items = [];
    State.previewIndex = 0;
    updatePreviewControls();
    clearPreview();
}

// ── 刷新選取資訊 ──────────────────────────
async function refreshSelection(passedItems = null) {
    if (State.applying) return;
    if (State.refreshing) return;
    // 取消任何 pending 的自動重試，避免 race condition
    if (_autoRetryTimer) {
        clearTimeout(_autoRetryTimer);
        _autoRetryTimer = null;
        State.autoRetryScheduled = false;
    }
    State.refreshing = true;
    try {
        let all;
        if (passedItems && Array.isArray(passedItems)) {
            all = passedItems;
        } else if (State.startupItems && State.startupItems.length > 0) {
            all = State.startupItems;
            State.startupItems = null;
            _log.info('[TimestampTool] 成功從 onItemSelectionChanged 快取中取得照片清單！');
        } else {
            setStatus('向 Eagle 請求選取清單...', true);

            for (let initRetry = 0; initRetry < EAGLE_API_MAX_RETRIES; initRetry++) {
                let timeoutId = null;
                try {
                    const fetchPromise = eagle.item.getSelected();
                    fetchPromise.catch(() => {});

                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error('EAGLE_API_TIMEOUT')), EAGLE_API_TIMEOUT_MS);
                    });

                    all = await Promise.race([fetchPromise, timeoutPromise]);
                    clearTimeout(timeoutId);
                    break;
                } catch (apiErr) {
                    clearTimeout(timeoutId);
                    if (apiErr && apiErr.message && apiErr.message.includes('plugin-create')) {
                        _log.info(`[TimestampTool] Eagle API 尚未初始化，等待中... (${initRetry + 1}/${EAGLE_API_MAX_RETRIES})`);
                        setStatus(`API 暖機中... (${initRetry + 1}/${EAGLE_API_MAX_RETRIES})`, true);
                        await new Promise(r => setTimeout(r, EAGLE_API_RETRY_DELAY_MS));
                    } else if (apiErr && apiErr.message === 'EAGLE_API_TIMEOUT') {
                        _log.warn('[TimestampTool] getSelected 逾時未回應，強制打斷以保護 UI。');
                        State.refreshing = false;
                        if (!State.autoRetryScheduled) {
                            State.autoRetryScheduled = true;
                            setStatus('Eagle API 初始化中，稍後自動重試...', false);
                            _autoRetryTimer = setTimeout(() => {
                                _autoRetryTimer = null;
                                State.autoRetryScheduled = false;
                                if (!State.applying && !State.refreshing) {
                                    refreshSelection().catch(e => _log.warn('[TimestampTool] 自動重試失敗:', e));
                                }
                            }, AUTO_RETRY_DELAY_MS);
                        } else {
                            setStatus('請重新點選 Eagle 主視窗裡的照片，外掛會自動捕捉！', false);
                        }
                        return;
                    } else {
                        setStatus(`API 崩潰: ${String(apiErr)}`, false);
                        _log.error(apiErr);
                        State.refreshing = false;
                        return;
                    }
                }
            }
        }

        if (!all) {
            all = [];
        }

        const imgs = filterImages(all);

        if (!all || all.length === 0) {
            setStatus('等待載入照片... (請點擊右邊按鈕)', false);
            setApplyBtn(false);
            resetSelection();
        } else if (imgs.length === 0) {
            let sample = '';
            try {
                sample = JSON.stringify(all[0]).substring(0, 150);
            } catch (_) { }
            setStatus(`總共抓了 ${all.length} 張，過濾後變 0 張。第一張長相: ${sample}`, false);
            setApplyBtn(false);
            resetSelection();
        } else {
            const skip = all.length - imgs.length;
            setStatus(skip > 0
                ? `已選 ${imgs.length} 張（略過 ${skip} 個）`
                : `已選 ${imgs.length} 張，可套用`);
            setApplyBtn(true, `套用至 ${imgs.length} 張照片`);

            State.images = imgs.map(img => img.filePath || img.fileURL);
            State.items = imgs;
            State.previewIndex = 0;
            updateActiveFolder(imgs).catch(() => {});
            updatePreviewControls();

            const firstImgPath = State.images[0];
            if (firstImgPath) {
                try {
                    if (Settings.getTimeSource() === 'original') {
                        autoFillDate(firstImgPath);
                    }
                } catch (err) {
                    _log.warn('[TimestampTool] autoFillDate 失敗:', err);
                }
                try {
                    updatePreview();
                } catch (err) {
                    _log.warn('[TimestampTool] trigger updatePreview 失敗:', err);
                }
            }
        }
    } catch (e) {
        _log.error('[TimestampTool] refreshSelection 遭攔截錯誤:', e);
        setStatus('初始化載入失敗: ' + e.message, false);
        setApplyBtn(false);
        resetSelection();
    } finally {
        State.refreshing = false;
    }
}

function getItemFolders(item) {
    if (!item || !Array.isArray(item.folders) || item.folders.length === 0) return [];
    if (State.activeFolders && State.activeFolders.size > 0) {
        const filtered = item.folders.filter(f => State.activeFolders.has(f));
        if (filtered.length > 0) return filtered;
    }
    return [...item.folders];
}

// ── 圖庫路徑與 metadata 工具（零 API 依賴） ──
const _folderNameCache = {};
let _libraryPath = null;

/** 從 item.filePath 推算 Eagle 圖庫根目錄 */
function _getLibraryPath(filePath) {
    if (_libraryPath) return _libraryPath;
    if (!filePath) return null;
    const normalized = filePath.replace(/\\/g, '/');
    const idx = normalized.indexOf('/images/');
    if (idx > 0) {
        _libraryPath = normalized.slice(0, idx);
    }
    return _libraryPath;
}

/** 取得 item 的 metadata.json 路徑 */
function _getItemMetaPath(item) {
    const fp = item && (item.filePath || item.fileURL);
    if (!fp) return null;
    const nodePath = require('path');
    return nodePath.join(nodePath.dirname(fp), 'metadata.json');
}

/** 從圖庫 metadata.json 讀取資料夾名稱（直接讀檔，不需 API） */
function _loadFolderNamesFromDisk(libraryPath) {
    if (!libraryPath) return;
    try {
        const fs = require('fs');
        const nodePath = require('path');
        const metaFile = nodePath.join(libraryPath, 'metadata.json');
        if (!fs.existsSync(metaFile)) return;
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        const walk = (folders) => {
            if (!Array.isArray(folders)) return;
            for (const f of folders) {
                if (f.id && f.name) _folderNameCache[f.id] = f.name;
                if (Array.isArray(f.children)) walk(f.children);
            }
        };
        walk(meta.folders);
    } catch (_) { }
}

/** 載入資料夾名稱（優先讀檔，降級到 HTTP API） */
async function _ensureFolderNames(items) {
    // 嘗試從 item.filePath 推算圖庫路徑
    if (!_libraryPath && items && items.length > 0) {
        for (const item of items) {
            _getLibraryPath(item.filePath || item.fileURL);
            if (_libraryPath) break;
        }
    }
    // 策略 1: 直接讀圖庫 metadata.json
    if (_libraryPath && Object.keys(_folderNameCache).length === 0) {
        _loadFolderNamesFromDisk(_libraryPath);
    }
    // 策略 2: HTTP API fallback（API 啟用時速度更快）
    if (Object.keys(_folderNameCache).length === 0) {
        await new Promise((resolve) => {
            try {
                const http = require('http');
                const req = http.get('http://127.0.0.1:41595/api/folder/list', { timeout: 1500 }, (res) => {
                    let data = '';
                    res.on('data', c => { data += c; });
                    res.on('end', () => {
                        try {
                            const all = JSON.parse(data).data || [];
                            const walk = (folders) => {
                                for (const f of folders) {
                                    _folderNameCache[f.id] = f.name;
                                    if (Array.isArray(f.children)) walk(f.children);
                                }
                            };
                            walk(all);
                        } catch (_) { }
                        resolve();
                    });
                });
                req.on('error', () => resolve());
                req.on('timeout', () => { req.destroy(); resolve(); });
            } catch (_) { resolve(); }
        });
    }
}

/**
 * 分析選取照片的資料夾，更新 UI 選擇器
 * - 唯一資料夾 → 自動設定，不顯示選擇器
 * - 多資料夾 → 顯示選擇器讓用戶點選
 */
async function updateActiveFolder(items) {
    const picker = document.getElementById('folderPicker');
    const btnsEl = document.getElementById('folderPickerBtns');
    if (!picker || !btnsEl) return;

    if (!items || items.length === 0) {
        picker.style.display = 'none';
        return;
    }

    // 收集所有照片的資料夾聯集
    const allFolderIds = new Set();
    for (const item of items) {
        if (Array.isArray(item.folders)) {
            item.folders.forEach(f => allFolderIds.add(f));
        }
    }

    // 計算交集
    let common = null;
    for (const item of items) {
        const fset = new Set(Array.isArray(item.folders) ? item.folders : []);
        if (fset.size === 0) continue;
        if (common === null) {
            common = new Set(fset);
        } else {
            for (const f of common) {
                if (!fset.has(f)) common.delete(f);
            }
        }
    }

    // 候選資料夾 = 交集（如果有）或聯集
    const candidates = (common && common.size > 0) ? [...common] : [...allFolderIds];

    if (candidates.length <= 1) {
        State.activeFolders = candidates.length === 1 ? new Set(candidates) : null;
        picker.style.display = 'none';
        return;
    }

    // 多資料夾 → 取得名稱，顯示選擇器（預設全選）
    await _ensureFolderNames(items);
    State.activeFolders = new Set(candidates);

    btnsEl.innerHTML = '';
    candidates.forEach(fid => {
        const btn = document.createElement('button');
        btn.className = 'folder-pick-btn active'; // 預設全選
        btn.textContent = _folderNameCache[fid] || fid.slice(0, 8);
        btn.title = _folderNameCache[fid] || fid;
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) {
                // 取消選取（但至少保留一個）
                if (State.activeFolders.size > 1) {
                    State.activeFolders.delete(fid);
                    btn.classList.remove('active');
                }
            } else {
                State.activeFolders.add(fid);
                btn.classList.add('active');
            }
        });
        btnsEl.appendChild(btn);
    });
    picker.style.display = 'flex';
}

function mergeTags(originalTags, extraTag) {
    const merged = new Set(Array.isArray(originalTags) ? originalTags : []);
    if (extraTag) merged.add(extraTag);
    return Array.from(merged);
}

function buildGeneratedTags(item, opts) {
    let result = opts.newPhotoUseOriginalTags ? (item.tags || []) : [];
    if (opts.tagGeneratedEnabled && opts.generatedTag) {
        result = mergeTags(result, opts.generatedTag);
    } else {
        result = Array.from(new Set(Array.isArray(result) ? result : []));
    }
    return result;
}

/**
 * 更新原始照片 TAG
 * 策略 1: 直接修改 metadata.json（零 API 依賴，100% 可靠）
 * 策略 2: HTTP API POST /api/item/update（觸發 Eagle UI 刷新）
 */
async function appendTagToOriginalItemIfNeeded(item, opts) {
    if (!opts.tagOriginalEnabled || !opts.originalTag) return;
    if (!item || !item.id) return;

    const tagToAdd = opts.originalTag.trim();
    if (!tagToAdd) return;

    const existing = Array.isArray(item.tags) ? item.tags : [];
    if (existing.includes(tagToAdd)) return;

    const newTags = [...existing, tagToAdd];

    // 策略 1: 直接寫 metadata.json（不需要 HTTP API）
    let diskOk = false;
    try {
        const metaPath = _getItemMetaPath(item);
        if (metaPath) {
            const fs = require('fs');
            if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                if (!Array.isArray(meta.tags)) meta.tags = [];
                if (!meta.tags.includes(tagToAdd)) {
                    meta.tags.push(tagToAdd);
                    meta.lastModified = Date.now();
                    fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
                    diskOk = true;
                } else {
                    diskOk = true; // 已存在，不需寫入
                }
            }
        }
    } catch (_) { }

    // 策略 2: HTTP API 通知 Eagle 刷新（可選，API 未啟用時靜默跳過）
    try {
        const http = require('http');
        const body = JSON.stringify({ id: item.id, tags: newTags });
        const req = http.request({
            hostname: '127.0.0.1', port: 41595,
            path: '/api/item/update', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            timeout: 1500,
        }, () => {});
        req.on('error', () => {});
        req.on('timeout', () => req.destroy());
        req.write(body);
        req.end();
    } catch (_) { }

    if (!diskOk) {
        _log.warn('[TimestampTool] TAG 更新失敗：item.id=' + item.id);
    }
}

function buildAnnotation(pattern, vars) {
    if (!pattern) pattern = '[時間戳記:{suffix}] 原始檔案：{filename}';
    return pattern
        .replace(/\{suffix\}/g, vars.suffix || '')
        .replace(/\{filename\}/g, vars.filename || '')
        .replace(/\{name\}/g, vars.name || '')
        .replace(/\{date\}/g, vars.date || '')
        .replace(/\{format\}/g, vars.format || '');
}

function createBatchToken(len = 6) {
    const safeLen = Math.min(Math.max(parseInt(len, 10) || 6, 4), 12);
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return token.slice(0, safeLen);
}

function buildStampedBaseName(origBase, fileSuffix, opts, batchToken) {
    const pattern = (opts.namePattern || '{name}_{suffix}_{token}').trim() || '{name}_{suffix}_{token}';
    if (!batchToken) batchToken = createBatchToken(opts.batchTokenLength);

    // 計算排除 {name} 後的固定長度，確保最終基底名稱不超過 FILE_NAME_BASE_MAX_LENGTH
    const fixedPart = pattern
        .replace(/\{name\}/g, '')
        .replace(/\{suffix\}/g, fileSuffix)
        .replace(/\{token\}/g, batchToken)
        .replace(/[\/\\:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    const maxNameLen = Math.max(FILE_NAME_BASE_MAX_LENGTH - fixedPart.length, 10);
    const safeOrigBase = origBase.length > maxNameLen ? origBase.slice(0, maxNameLen) : origBase;

    return pattern
        .replace(/\{name\}/g, safeOrigBase)
        .replace(/\{suffix\}/g, fileSuffix)
        .replace(/\{token\}/g, batchToken)
        .replace(/[\/\\:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim() || `${safeOrigBase}_${fileSuffix}_${batchToken}`;
}

async function addStampedItemWithUniqueName(tmpPath, payload) {
    const { baseName, annotation, tags, folders } = payload;
    const MAX_TRIES = 20;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        const suffix = attempt === 0 ? '' : `_${attempt + 1}`;
        const name = `${baseName}${suffix}`;
        try {
            await eagle.item.addFromPath(tmpPath, { name, annotation, tags, folders });
            return;
        } catch (e) {
            const msg = String(e && e.message ? e.message : e);
            const isNameConflict = /exist|duplicate|重複|已存在|same name/i.test(msg);
            if (!isNameConflict || attempt === MAX_TRIES - 1) throw e;
        }
    }
}

// ── 套用流程 ──────────────────────────────
async function applyTimestamps() {
    if (!State.pluginCreated) return;
    if (State.applying) return;
    State.applying = true;

    const items = [...State.items];
    if (items.length === 0) {
        setStatus('沒有選取的圖片', false);
        State.applying = false;
        return;
    }

    State.cancelled = false;
    showLoading('正在套用時間戳記...', '');

    const cancelBtn = document.getElementById('cancelApplyBtn');
    if (cancelBtn) {
        cancelBtn.onclick = () => { State.cancelled = true; };
    }

    let success = 0;
    let fail = 0;

    try {
        // 同一批次共用 token，避免每張照片產生不同 token
        const batchToken = createBatchToken(
            parseInt(document.getElementById('batchTokenLengthInput')?.value, 10) || 6
        );

        for (let i = 0; i < items.length; i++) {
            if (State.cancelled) break;

            const item = items[i];
            const filePath = item.filePath || item.fileURL;
            updateProgress(i + 1, items.length);

            let tmpPath = null;
            try {
                const opts = Settings.getAll(filePath);

                const shortName = (item.name || '').length > FILE_NAME_MAX_LENGTH
                    ? (item.name || '').slice(0, FILE_NAME_MAX_LENGTH) + '...'
                    : (item.name || '（未知）');
                setStatus(`燒入中 ${i + 1}/${items.length}：${shortName}`);
                tmpPath = await TimestampEngine.burnTimestamp(filePath, opts);

                const nodePath = require('path');
                const origBase = nodePath.basename(filePath, nodePath.extname(filePath));

                // 取得後綴：優先使用者自訂，否則自動產生日期
                const fileSuffix = (opts.suffix || TimestampEngine.formatDate(new Date(), 'YYYY-MM-DD'))
                    .replace(/[\/\\:*?"<>|]/g, '_');
                const newBaseName = buildStampedBaseName(origBase, fileSuffix, opts, batchToken);

                await addStampedItemWithUniqueName(tmpPath, {
                    baseName: newBaseName,
                    annotation: buildAnnotation(opts.annotationPattern, {
                        suffix: fileSuffix,
                        filename: nodePath.basename(filePath),
                        name: origBase,
                        date: TimestampEngine.formatDate(opts.date, opts.format),
                        format: opts.format,
                    }),
                    tags: buildGeneratedTags(item, opts),
                    folders: getItemFolders(item),
                });

                success++;

                // TAG 更新獨立 try-catch：失敗不影響照片創建的成功計數
                try {
                    await appendTagToOriginalItemIfNeeded(item, opts);
                } catch (tagErr) {
                    _log.warn('[TimestampTool] TAG 更新失敗（照片已建立）:', tagErr);
                }
            } catch (e) {
                _log.error('[TimestampTool] 處理失敗:', filePath, e);
                setStatus(`第 ${i + 1} 張失敗：${e.message}`, false);
                fail++;
                await new Promise(r => setTimeout(r, 1500));
            } finally {
                // 延遲刪除暫存檔，確保 Eagle 完成檔案讀取
                if (tmpPath) {
                    const _tmp = tmpPath;
                    setTimeout(() => TimestampEngine.cleanupTemp(_tmp), 3000);
                }
            }
        }
    } finally {
        hideLoading();
        State.applying = false;
        if (State.cancelled) {
            setStatus(`已取消：成功 ${success} 張，剩餘未處理`, false);
        } else if (fail > 0) {
            setStatus(`完成：${success} 張成功，${fail} 張失敗`, false);
        } else {
            setStatus(`成功套用 ${success} 張！已建立 ${success} 個帶時間戳記的副本`, true);
        }
        setApplyBtn(State.items.length > 0, `套用至 ${State.items.length} 張照片`);
    }
}

// ══════════════════════════════════════════
//  Eagle 4 事件掛鉤與右鍵選單
// ══════════════════════════════════════════

eagle.onPluginCreate((plugin) => {

    // 初始化設定面板 UI
    try {
        Settings.init();
    } catch (e) {
        _log.error('[TimestampTool] Settings.init 失敗:', e);
    }

    // 註冊 Eagle 選取變更監聽
    if (window.eagle && typeof eagle.onItemSelectionChanged === 'function') {
        try {
            eagle.onItemSelectionChanged((items) => {
                _log.info('[TimestampTool] 收到 onItemSelectionChanged，數量:', items ? items.length : 0);
                if (items && Array.isArray(items)) {
                    State.startupItems = items.length > 0 ? items : null;
                    refreshSelection(items).catch(e => _log.warn(e));
                }
            });
            _log.info('[TimestampTool] 成功註冊 onItemSelectionChanged (Passive Listener)');
        } catch (e) {
            _log.warn('註冊選取監聽失敗:', e);
        }
    }

    // 綁定套用按鈕
    document.getElementById('applyBtn').addEventListener('click', () => {
        applyTimestamps().catch(e => showError('套用過程發生未預期錯誤: ' + String(e)));
    });

    // 綁定手動重整按鈕
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshSelection().catch(e => _log.warn(e));
        });
    }

    // 綁定預覽切換按鈕
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (State.previewIndex > 0) {
                navigateToPreview(State.previewIndex - 1);
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (State.previewIndex < State.images.length - 1) {
                navigateToPreview(State.previewIndex + 1);
            }
        });
    }

    // 鍵盤左右方向鍵切換預覽（輸入框內不觸發）
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (State.applying || State.images.length === 0) return;

        if (e.key === 'ArrowLeft' && State.previewIndex > 0) {
            e.preventDefault();
            navigateToPreview(State.previewIndex - 1);
        } else if (e.key === 'ArrowRight' && State.previewIndex < State.images.length - 1) {
            e.preventDefault();
            navigateToPreview(State.previewIndex + 1);
        }
    });

    // 設定面板滾動修復（不依賴 flexbox，直接用 JS 計算高度）
    try {
        const _panel = document.querySelector('.settings-panel');
        const _footer = document.querySelector('.footer');
        const _settings = document.querySelector('.settings');
        if (_panel && _footer && _settings) {
            const fixHeight = () => {
                const avail = _panel.clientHeight - _footer.offsetHeight;
                if (avail > 0) {
                    _settings.style.height = avail + 'px';
                    _settings.style.maxHeight = avail + 'px';
                }
            };

            // 初始 + 延遲再算一次（確保 Eagle 視窗初始化完成）
            fixHeight();
            setTimeout(fixHeight, 300);
            setTimeout(fixHeight, 1000);

            // 視窗大小變化時重新計算
            window.addEventListener('resize', fixHeight);

            // 折疊區段：展開時自動滾動到該區段
            document.querySelectorAll('details.collapsible').forEach(d => {
                d.addEventListener('toggle', () => {
                    setTimeout(() => {
                        fixHeight();
                        if (d.open) {
                            d.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 50);
                });
            });
        }
    } catch (_) { }

    // UI 初始化完畢，顯示空狀態
    setStatus('【請直接在 Eagle 點選您要的照片！】', false);
    setApplyBtn(false);
    State.pluginCreated = true;

    // 強制關閉 DevTools（初始化完成後立即執行 + 延遲再執行一次）
    _forceCloseDevTools();
    setTimeout(_forceCloseDevTools, 500);
    setTimeout(_forceCloseDevTools, 1500);

    // 註冊右鍵選單
    try {
        if (eagle.contextMenu && typeof eagle.contextMenu.add === 'function') {
            eagle.contextMenu.add({
                id: 'insert-timestamp',
                label: '插入時間戳記...'
            });

            if (typeof eagle.onContextMenuClicked === 'function') {
                eagle.onContextMenuClicked((id) => {
                    if (id === 'insert-timestamp') {
                        try {
                            if (window.eagle && eagle.plugin) {
                                const p = eagle.plugin.showWindow();
                                if (p && typeof p.catch === 'function') p.catch(e => { _log.warn('showWindow catch:', e); });
                            }
                        } catch (err) {
                            _log.warn('[TimestampTool] showWindow fallback:', err);
                        }
                        refreshSelection().catch(e => _log.warn('refreshSelection fallback:', e));
                    }
                });
            }
        }
    } catch (e) {
        _log.warn('[TimestampTool] 無法註冊右鍵選單:', e);
    }
});

eagle.onPluginShow(() => {
    if (!State.pluginCreated) return;
    const delay = State.firstShowDone ? 0 : FIRST_SHOW_DELAY_MS;
    State.firstShowDone = true;
    setTimeout(() => {
        refreshSelection().catch(e => _log.warn('[TimestampTool] onPluginShow refreshSelection:', e));
    }, delay);
});

eagle.onPluginRun(() => {
    if (!State.pluginCreated) return;
    const delay = State.firstShowDone ? 0 : FIRST_SHOW_DELAY_MS;
    State.firstShowDone = true;
    setTimeout(() => {
        refreshSelection().catch(e => _log.warn('[TimestampTool] onPluginRun refreshSelection:', e));
    }, delay);
});

eagle.onPluginHide(() => {
    clearTimeout(previewTimeout);
});
