/**
 * main.js - Eagle 4 插件主入口
 * 對照官方 Window 範例結構：
 * - eagle.onPluginCreate → 初始化 UI（一次）
 * - eagle.onPluginShow   → 刷新選取狀態
 * - eagle.onPluginRun    → 使用者點擊時觸發
 */

'use strict';

const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

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
    el.className = ok === true ? 'status-success' : ok === false ? 'status-error' : '';
}
function setApplyBtn(enabled, label) {
    const btn = document.getElementById('applyBtn');
    if (!btn) return;
    btn.disabled = !enabled;
    document.getElementById('applyBtnText').textContent = label || '套用時間戳記';
}

// 在 UI 上顯示錯誤（比只有 console 更好診斷）
function showError(msg) {
    console.error('[TimestampTool]', msg);
    setStatus('❌ ' + msg, false);
    hideLoading();
    setApplyBtn(false, '套用時間戳記');
}

// ── 篩選圖片 ──────────────────────────────
function filterImages(items) {
    if (!Array.isArray(items)) {
        console.warn('[TimestampTool] items 不是陣列:', items);
        return [];
    }
    return items.filter(item => {
        if (!item) return false;

        // filePath 是唯讀 getter，只能讀取不能寫入
        const fp = item.filePath || item.fileURL || '';
        if (!fp) return false;

        const lastDot = fp.lastIndexOf('.');
        if (lastDot === -1) return false; // 無副檔名，跳過
        const ext = fp.toLowerCase().slice(lastDot);
        return SUPPORTED_EXT.has(ext);
    });
}

// ── 儲存當前第一張圖的 EXIF 狀態給套用時備註用 ──
let currentSelectionHadExif = false;

// ── 多圖預覽狀態 ──
let currentSelectedImages = [];
let globalEagleItems = [];
let currentPreviewIndex = 0;
window._pluginRunArgs = null;
window._startupItems = null;

let isPluginCreated = false;
let isRefreshing = false;
let isApplying = false;
let applyCancelled = false;

// ── 刷新選取資訊 ──────────────────────────
async function refreshSelection(passedItems = null) {
    if (isApplying) return; // 套用中禁止重刷 UI
    if (isRefreshing) return;
    isRefreshing = true;
    try {
        let all;
        if (passedItems && Array.isArray(passedItems)) {
            all = passedItems;
        } else if (window._startupItems && window._startupItems.length > 0) {
            all = window._startupItems;
            window._startupItems = null; // 使用後清除，確保下次重整時重新向 Eagle 取得最新選取
            console.log('[TimestampTool] 成功從 onItemSelectionChanged 快取中取得照片清單！');
        } else {
            setStatus('向 Eagle 請求選取清單...', true);

            for (let initRetry = 0; initRetry < 10; initRetry++) {
                // timeoutId 宣告在 try-catch 之外，確保 catch 區塊可以清除 timer
                let timeoutId = null;
                try {
                    // 加入終極防死鎖機制 (Timeout 2秒)
                    // 關鍵修正：立刻附上空 .catch()，防止 race 超時後 fetchPromise
                    // 稍後才 reject 時，因無人監聽而產生 Uncaught (in promise)
                    const fetchPromise = eagle.item.getSelected();
                    fetchPromise.catch(() => {});

                    // 記錄 timeoutId，確保成功或失敗時都能清除，避免 timer 洩漏
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error('EAGLE_API_TIMEOUT')), 2000);
                    });

                    all = await Promise.race([fetchPromise, timeoutPromise]);
                    clearTimeout(timeoutId); // 成功時清除逾時 timer
                    break; // 成功就跳出迴圈
                } catch (apiErr) {
                    clearTimeout(timeoutId); // 失敗時（含 retry）也清除，避免 timer 洩漏
                    if (apiErr && apiErr.message && apiErr.message.includes('plugin-create')) {
                        console.warn(`[TimestampTool] Eagle API 尚未初始化，等待中... (${initRetry + 1}/10)`);
                        setStatus(`API 暖機中... (${initRetry + 1}/10)`, true);
                        await new Promise(r => setTimeout(r, 50));
                    } else if (apiErr && apiErr.message === 'EAGLE_API_TIMEOUT') {
                        setStatus(`請重新點選 Eagle 主視窗裡的照片，外掛會自動捕捉！`, false);
                        console.warn('[TimestampTool] getSelected 逾時未回應，強制打斷以保護 UI。');
                        isRefreshing = false;
                        return;
                    } else {
                        setStatus(`API 崩潰: ${String(apiErr)}`, false);
                        console.warn(apiErr);
                        isRefreshing = false;
                        return; // 遇到未知的 API 錯誤直接停止重試並顯示
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
            currentSelectedImages = [];
            globalEagleItems = [];
            currentPreviewIndex = 0;
            updatePreviewControls();
            clearPreview();
        } else if (imgs.length === 0) {
            let sample = '';
            try {
                sample = JSON.stringify(all[0]).substring(0, 150);
            } catch (e) { }
            setStatus(`總共抓了 ${all.length} 張，過濾後變 0 張。第一張長相: ${sample}`, false);
            setApplyBtn(false);
            currentSelectedImages = [];
            globalEagleItems = [];
            currentPreviewIndex = 0;
            updatePreviewControls();
            clearPreview();
        } else {
            const skip = all.length - imgs.length;
            setStatus(skip > 0
                ? `已選 ${imgs.length} 張（略過 ${skip} 個）`
                : `已選 ${imgs.length} 張，可套用`);
            setApplyBtn(true, `套用至 ${imgs.length} 張照片`);

            currentSelectedImages = imgs.map(img => img.filePath || img.fileURL);
            globalEagleItems = imgs;
            currentPreviewIndex = 0;
            updatePreviewControls();

            const firstImgPath = currentSelectedImages[0];
            if (firstImgPath) {
                // 自動帶入時間：僅「原始照片時間」模式才讀取 EXIF
                // 「手動」模式保留使用者輸入，「當前時間」模式保留 now 顯示值
                try {
                    if (Settings.getTimeSource() === 'original') {
                        autoFillDate(firstImgPath);
                    }
                } catch (err) {
                    console.error('[TimestampTool] autoFillDate 失敗:', err);
                }
                // 更新預覽
                try {
                    updatePreview();
                } catch (err) {
                    console.error('[TimestampTool] trigger updatePreview 失敗:', err);
                }
            }
        }
    } catch (e) {
        console.error('[TimestampTool] refreshSelection 遭攔截錯誤:', e);
        setStatus('初始化載入失敗: ' + e.message, false);
        setApplyBtn(false);
        currentSelectedImages = [];
        currentPreviewIndex = 0;
        updatePreviewControls();
        clearPreview();
    } finally {
        isRefreshing = false;
    }
}

function autoFillDate(filePath) {
    try {

        let targetDate = TimestampEngine.readExifDate(filePath);
        currentSelectionHadExif = !!targetDate;

        if (!targetDate) {
            try {
                const fs = require('fs');
                targetDate = fs.statSync(filePath).birthtime;
            } catch (e) {
                targetDate = new Date();
            }
        }

        // 轉換為 YYYY-MM-DDTHH:mm 格式放入 datetime-local
        const localStr = new Date(targetDate.getTime() - targetDate.getTimezoneOffset() * 60000)
            .toISOString().slice(0, 16);

        document.getElementById('manualDatetime').value = localStr;

        // 更新 EXIF 來源標籤，讓使用者知道日期從哪裡來
        const badge = document.getElementById('exifSourceBadge');
        if (badge) {
            badge.textContent = currentSelectionHadExif ? '📸 EXIF' : '📁 建立時間';
            badge.className = 'exif-source-badge ' + (currentSelectionHadExif ? 'exif-badge-exif' : 'exif-badge-file');
        }
    } catch (e) {
        console.error('[TimestampTool] autoFillDate error:', e);
    }
}

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

function updatePreviewControls() {
    const total = currentSelectedImages.length;
    const pageInd = document.getElementById('previewPage');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (total === 0) {
        if (pageInd) pageInd.textContent = '0 / 0';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
    } else {
        if (pageInd) pageInd.textContent = `${currentPreviewIndex + 1} / ${total}`;
        if (prevBtn) prevBtn.disabled = currentPreviewIndex <= 0;
        if (nextBtn) nextBtn.disabled = currentPreviewIndex >= total - 1;
    }
}

let previewTimeout = null;
function updatePreview() {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(async () => {
        if (currentSelectedImages.length === 0) return;
        const currentPreviewPath = currentSelectedImages[currentPreviewIndex];
        if (!currentPreviewPath) return;

        const canvas = document.getElementById('previewCanvas');
        if (!canvas) {
            console.warn('[TimestampTool] 找不到 previewCanvas');
            return;
        }

        try {
            const opts = Settings.getAll(currentPreviewPath);
            await TimestampEngine.renderPreview(currentPreviewPath, opts, canvas);
        } catch (e) {
            console.error('[TimestampTool] 預覽繪製失敗:', e);
            showError(`預覽載入失敗: ${e.message}`);
        }
    }, 150);
}

// 暴露給 settings.js 的觸發介面
window.onSettingsChanged = updatePreview;

// 時間來源模式切換時觸發（供切換回 original 模式時重新填入 EXIF 日期）
window.onTimeSourceChanged = (source) => {
    if (source === 'original' && currentSelectedImages.length > 0) {
        autoFillDate(currentSelectedImages[currentPreviewIndex]);
    }
};

// ── 套用流程 ──────────────────────────────
async function applyTimestamps() {
    if (!isPluginCreated) return;
    if (isApplying) return;
    isApplying = true;

    const items = [...globalEagleItems];
    if (items.length === 0) {
        setStatus('沒有選取的圖片', false);
        isApplying = false;
        return;
    }

    applyCancelled = false;
    showLoading('正在套用時間戳記...', '');

    // 綁定取消按鈕
    const cancelBtn = document.getElementById('cancelApplyBtn');
    if (cancelBtn) {
        cancelBtn.onclick = () => { applyCancelled = true; };
    }

    let success = 0;
    let fail = 0;

    try {
        for (let i = 0; i < items.length; i++) {
            if (applyCancelled) break; // 使用者取消

            const item = items[i];
            const filePath = item.filePath;
            updateProgress(i + 1, items.length);

            let tmpPath = null;
            try {
                const opts = Settings.getAll(filePath);

                // Step 1: 燒入 Canvas 並寫入暫存檔
                const shortName = (item.name || '').length > 20
                    ? (item.name || '').slice(0, 20) + '…'
                    : (item.name || '（未知）');
                setStatus(`燒入中 ${i + 1}/${items.length}：${shortName}`);
                tmpPath = await TimestampEngine.burnTimestamp(filePath, opts);

                // Step 2: 加入 Eagle 圖庫
                const nodePath = require('path');
                const origBase = nodePath.basename(filePath, nodePath.extname(filePath));
                const newName = `${origBase}(時間戳記)`;

                await eagle.item.addFromPath(tmpPath, {
                    name: newName,
                    annotation: `[時間戳記] 原始檔案：${nodePath.basename(filePath)}`,
                    tags: item.tags || [],
                    folders: item.folders || [],
                });

                success++;
            } catch (e) {
                console.error('[TimestampTool] 處理失敗:', filePath, e);
                setStatus(`第 ${i + 1} 張失敗：${e.message}`, false);
                fail++;
                await new Promise(r => setTimeout(r, 1500)); // 讓使用者看到錯誤
            } finally {
                if (tmpPath) TimestampEngine.cleanupTemp(tmpPath);
            }
        }
    } finally {
        hideLoading();
        isApplying = false;
        if (applyCancelled) {
            setStatus(`已取消：成功 ${success} 張，剩餘未處理`, false);
        } else if (fail > 0) {
            setStatus(`完成：${success} 張成功，${fail} 張失敗`, false);
        } else {
            setStatus(`成功套用 ${success} 張！已建立 ${success} 個帶時間戳記的副本`, true);
        }
        // 套用後保留原選取狀態顯示，不重新 getSelected（Eagle 的 selection 在 addFromPath 後可能已改變）
        setApplyBtn(globalEagleItems.length > 0, `套用至 ${globalEagleItems.length} 張照片`);
    }
}

// ══════════════════════════════════════════
//  Eagle 4 事件掛鉤與右鍵選單
// ══════════════════════════════════════════

eagle.onPluginCreate((plugin) => {
    console.log('[TimestampTool] onPluginCreate', plugin);

    // 初始化設定面板 UI
    try {
        Settings.init();
    } catch (e) {
        console.warn('[TimestampTool] Settings.init 失敗:', e);
    }

    // 將事件監聽器加回來，這或許是唯一不會遭遇焦點遺失死鎖的官方解法！
    if (window.eagle && typeof eagle.onItemSelectionChanged === 'function') {
        try {
            eagle.onItemSelectionChanged((items) => {
                console.log('[TimestampTool] 收到 onItemSelectionChanged，數量:', items ? items.length : 0);
                if (items && Array.isArray(items)) {
                    // 更新快取（若為空選取則清除快取）
                    window._startupItems = items.length > 0 ? items : null;
                    // 無論選取或清空，都重刷 UI（讓使用者取消全選時能看到空狀態）
                    refreshSelection(items).catch(e => console.warn(e));
                }
            });
            console.log('[TimestampTool] 成功註冊 onItemSelectionChanged (Passive Listener)');
        } catch (e) {
            console.warn('註冊選取監聽失敗:', e);
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
            refreshSelection().catch(e => console.warn(e));
        });
    }

    // 綁定預覽切換按鈕
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPreviewIndex > 0) {
                currentPreviewIndex--;
                updatePreviewControls();
                // 僅「原始照片時間」模式才讀取 EXIF，不干擾手動或當前時間模式
                if (Settings.getTimeSource() === 'original') {
                    autoFillDate(currentSelectedImages[currentPreviewIndex]);
                }
                updatePreview();
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentPreviewIndex < currentSelectedImages.length - 1) {
                currentPreviewIndex++;
                updatePreviewControls();
                // 僅「原始照片時間」模式才讀取 EXIF，不干擾手動或當前時間模式
                if (Settings.getTimeSource() === 'original') {
                    autoFillDate(currentSelectedImages[currentPreviewIndex]);
                }
                updatePreview();
            }
        });
    }

    // 鍵盤左右方向鍵切換預覽（輸入框內不觸發）
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (isApplying || currentSelectedImages.length === 0) return;

        if (e.key === 'ArrowLeft' && currentPreviewIndex > 0) {
            e.preventDefault();
            currentPreviewIndex--;
            updatePreviewControls();
            if (Settings.getTimeSource() === 'original') {
                autoFillDate(currentSelectedImages[currentPreviewIndex]);
            }
            updatePreview();
        } else if (e.key === 'ArrowRight' && currentPreviewIndex < currentSelectedImages.length - 1) {
            e.preventDefault();
            currentPreviewIndex++;
            updatePreviewControls();
            if (Settings.getTimeSource() === 'original') {
                autoFillDate(currentSelectedImages[currentPreviewIndex]);
            }
            updatePreview();
        }
    });

    // UI 初始化與事件註冊完畢後，預設顯示空狀態等待點擊載入
    setStatus('【請直接在 Eagle 點選您要的照片！】', false);
    setApplyBtn(false);
    isPluginCreated = true;

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
                                if (p && typeof p.catch === 'function') p.catch(e => { console.warn('showWindow catch:', e); });
                            }
                        } catch (err) {
                            console.warn('[TimestampTool] showWindow fallback:', err);
                        }
                        refreshSelection().catch(e => console.warn('refreshSelection fallback:', e));
                    }
                });
            }
        } else {
            console.log('[TimestampTool] 當前 Eagle 版本不支援右鍵選單 API (eagle.contextMenu.add)');
        }
    } catch (e) {
        console.warn('[TimestampTool] 無法註冊右鍵選單:', e);
    }
});

eagle.onPluginShow(() => {
    // 每次插件顯示時自動抓取當前選取
    if (isPluginCreated) {
        refreshSelection().catch(e => console.warn('[TimestampTool] onPluginShow refreshSelection:', e));
    }
});

eagle.onPluginRun(() => {
    // onPluginRun 是插件被使用者觸發的主要時機，在此抓取選取照片
    if (isPluginCreated) {
        refreshSelection().catch(e => console.warn('[TimestampTool] onPluginRun refreshSelection:', e));
    }
});

eagle.onPluginHide(() => {
    console.log('[TimestampTool] onPluginHide');
});
