/**
 * settings.js
 * 設定面板 UI 互動邏輯
 * 管理所有控制項的狀態讀取與 UI 更新
 */

'use strict';

const Settings = (() => {

    // 日誌安全引用（_log 由 main.js 定義，本檔案先於 main.js 載入）
    const _stNoop = () => {};
    function _getLog() {
        return window._log || { info: _stNoop, warn: _stNoop, error: _stNoop };
    }

    // ── 折疊區段 ─────────────────────────────
    const COLLAPSIBLE_IDS = ['sectionVisual', 'sectionTags', 'sectionFile'];
    const SECTION_STORAGE_KEY = 'TimestampPluginSections';

    // ── 取得當前所有設定值 ──────────────
    function getAll(filePath = null) {
        return {
            timeSource: getTimeSource(),
            date: getDate(filePath),
            format: document.getElementById('dateFormat').value,
            position: document.querySelector('.toggle-btn.active[data-pos]')?.dataset.pos || 'bottom-right',
            fontSize: parseInt(document.getElementById('fontSize').value, 10),
            textColor: document.getElementById('textColor').value,
            bgColor: document.getElementById('bgColor').value,
            bgOpacity: parseInt(document.getElementById('bgOpacity').value, 10),
            paddingX: parseInt(document.getElementById('paddingX').value, 10),
            paddingY: parseInt(document.getElementById('paddingY').value, 10),
            suffix: (document.getElementById('suffixInput')?.value || '').trim(),
            tagOriginalEnabled: !!document.getElementById('tagOriginalEnabled')?.checked,
            originalTag: (document.getElementById('originalTagInput')?.value || '').trim(),
            newPhotoUseOriginalTags: !!document.getElementById('newPhotoUseOriginalTags')?.checked,
            tagGeneratedEnabled: !!document.getElementById('tagGeneratedEnabled')?.checked,
            generatedTag: (document.getElementById('generatedTagInput')?.value || '').trim(),
            namePattern: (document.getElementById('namePatternInput')?.value || '').trim(),
            batchTokenLength: parseInt(document.getElementById('batchTokenLengthInput')?.value, 10) || 6,
            shadow: document.querySelector('.toggle-btn.active[data-shadow]')?.dataset.shadow !== 'off',
            annotationPattern: (document.getElementById('annotationPatternInput')?.value || '').trim()
                || '[時間戳記:{suffix}] 原始檔案：{filename}',
        };
    }

    function getTimeSource() {
        return document.querySelector('.toggle-btn.active[data-source]')?.dataset.source || 'original';
    }

    function getDate(filePath) {
        const source = getTimeSource();
        if (source === 'manual') {
            const val = document.getElementById('manualDatetime').value;
            return val ? new Date(val) : new Date();
        }
        if (source === 'original' && filePath) {
            if (window.TimestampEngine) {
                return window.TimestampEngine.getDateForFile(filePath).date;
            }
            return new Date();
        }
        return new Date();
    }

    // ── 初始化所有控制項事件 ────────────
    function init() {
        _initCollapsibleSections();
        _initTimeSourceToggle();
        _initSliders();
        _initPositionToggle();
        _initShadowToggle();

        // 載入 localStorage 設定
        loadSettings();

        // 任何設定變更時自動儲存並視需要發布事件（供預覽圖更新）
        document.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', () => { saveSettings(); triggerPreview(); });
            el.addEventListener('input', () => { triggerPreview(); });
        });
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => { saveSettings(); triggerPreview(); });
        });
    }

    let _isLoading = false;
    let _savedManualDatetime = null;

    function triggerPreview() {
        if (_isLoading) return;
        const ns = window.TimestampPlugin;
        if (ns && ns.onSettingsChanged) {
            ns.onSettingsChanged();
        }
    }

    // ── 折疊區段初始化與持久化 ────────────
    function _initCollapsibleSections() {
        let saved = {};
        try {
            const raw = localStorage.getItem(SECTION_STORAGE_KEY);
            if (raw) saved = JSON.parse(raw);
        } catch (_) {}

        COLLAPSIBLE_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            // 預設折疊；若 saved 記錄為 true 則展開
            if (saved[id] === true) el.open = true;
            el.addEventListener('toggle', () => { _saveSectionStates(); });
        });
    }

    function _saveSectionStates() {
        const states = {};
        COLLAPSIBLE_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) states[id] = el.open;
        });
        try {
            localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(states));
        } catch (_) {}
    }

    // ── 儲存與讀取設定 (localStorage) ────
    function saveSettings() {
        if (_isLoading) return;
        const opts = getAll();
        const currentInputVal = document.getElementById('manualDatetime').value;
        if (getTimeSource() === 'manual') {
            _savedManualDatetime = currentInputVal;
        }
        const toSave = {
            ...opts,
            manualDatetime: _savedManualDatetime || currentInputVal,
            date: undefined,
        };
        try {
            localStorage.setItem('TimestampPluginSettings', JSON.stringify(toSave));
        } catch (e) {
            _getLog().warn('[TimestampTool] 無法儲存設定:', e);
        }
    }

    function loadSettings() {
        _isLoading = true;
        try {
            const saved = localStorage.getItem('TimestampPluginSettings');
            if (!saved) return;
            const opts = JSON.parse(saved);

            // 舊版 padding → 新版 paddingX/paddingY 遷移
            if (opts.padding !== undefined && opts.paddingX === undefined) {
                opts.paddingX = opts.padding;
                opts.paddingY = opts.padding;
            }

            // 先還原手動日期記憶
            if (opts.manualDatetime) {
                _savedManualDatetime = opts.manualDatetime;
            }

            // 還原時間來源
            if (opts.timeSource) {
                const btn = document.querySelector(`.toggle-btn[data-source="${opts.timeSource}"]`);
                if (btn) btn.click();
            }

            if (opts.manualDatetime && opts.timeSource !== 'now') {
                document.getElementById('manualDatetime').value = opts.manualDatetime;
            }

            if (opts.format) document.getElementById('dateFormat').value = opts.format;

            // 還原位置
            if (opts.position) {
                const btn = document.querySelector(`.toggle-btn[data-pos="${opts.position}"]`);
                if (btn) {
                    btn.click();
                } else {
                    const defaultBtn = document.querySelector('.toggle-btn[data-pos="bottom-right"]');
                    if (defaultBtn) defaultBtn.click();
                }
            }

            // 還原陰影
            if (opts.shadow !== undefined) {
                const shadowVal = opts.shadow === true ? 'on' : 'off';
                const btn = document.querySelector(`.toggle-btn[data-shadow="${shadowVal}"]`);
                if (btn) btn.click();
            }

            // 還原檔名後綴
            if (opts.suffix !== undefined) {
                const suffixEl = document.getElementById('suffixInput');
                if (suffixEl) suffixEl.value = opts.suffix;
            }

            // 還原 TAG 設定
            if (opts.tagOriginalEnabled !== undefined) {
                const el = document.getElementById('tagOriginalEnabled');
                if (el) el.checked = !!opts.tagOriginalEnabled;
            }
            if (opts.originalTag !== undefined) {
                const el = document.getElementById('originalTagInput');
                if (el) el.value = opts.originalTag;
            }
            if (opts.newPhotoUseOriginalTags !== undefined) {
                const el = document.getElementById('newPhotoUseOriginalTags');
                if (el) el.checked = !!opts.newPhotoUseOriginalTags;
            }
            if (opts.tagGeneratedEnabled !== undefined) {
                const el = document.getElementById('tagGeneratedEnabled');
                if (el) el.checked = !!opts.tagGeneratedEnabled;
            }
            if (opts.generatedTag !== undefined) {
                const el = document.getElementById('generatedTagInput');
                if (el) el.value = opts.generatedTag;
            }
            if (opts.namePattern !== undefined) {
                const el = document.getElementById('namePatternInput');
                if (el) el.value = opts.namePattern;
            }
            if (opts.batchTokenLength !== undefined) {
                const el = document.getElementById('batchTokenLengthInput');
                if (el) el.value = Math.min(Math.max(parseInt(opts.batchTokenLength, 10) || 6, 4), 12);
            }

            // 還原備註格式
            if (opts.annotationPattern !== undefined) {
                const el = document.getElementById('annotationPatternInput');
                if (el) el.value = opts.annotationPattern;
            }

            // 還原其它設定
            const elementMap = {
                fontSize: opts.fontSize,
                textColor: opts.textColor,
                bgColor: opts.bgColor,
                bgOpacity: opts.bgOpacity,
                paddingX: opts.paddingX,
                paddingY: opts.paddingY,
            };

            for (const [id, val] of Object.entries(elementMap)) {
                if (val !== undefined && val !== null) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('input'));
                    }
                }
            }
        } catch (e) {
            _getLog().warn('[TimestampTool] 無法讀取設定:', e);
        } finally {
            _isLoading = false;
        }
    }

    // 根據時間來源更新顯示區塊
    function _applyTimeSourceDisplay(source) {
        const input = document.getElementById('manualDatetime');
        const label = document.getElementById('timeDisplayLabel');
        const hint = document.getElementById('timeDisplayHint');
        const badge = document.getElementById('exifSourceBadge');
        if (!input) return;

        if (source === 'manual') {
            input.readOnly = false;
            input.classList.remove('readonly');
            if (_savedManualDatetime) input.value = _savedManualDatetime;
            if (label) label.textContent = '📅 指定日期時間';
            if (hint) hint.textContent = '套用時將使用此日期時間作為時間戳記';
            if (badge) { badge.textContent = ''; badge.className = 'exif-source-badge'; }
        } else if (source === 'now') {
            input.readOnly = true;
            input.classList.add('readonly');
            const now = new Date();
            const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 16);
            input.value = local;
            if (label) label.textContent = '🕐 當前時間';
            if (hint) hint.textContent = '套用時以當下時間為準（每張照片獨立計算）';
            if (badge) { badge.textContent = ''; badge.className = 'exif-source-badge'; }
        } else {
            input.readOnly = true;
            input.classList.add('readonly');
            if (label) label.textContent = '📸 原始照片時間';
            if (hint) hint.textContent = '從 EXIF 或檔案資訊自動讀取，切換照片時會更新';
        }
    }

    function _initTimeSourceToggle() {
        const btns = document.querySelectorAll('.toggle-btn[data-source]');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _applyTimeSourceDisplay(btn.dataset.source);
                const ns = window.TimestampPlugin;
                if (ns && ns.onTimeSourceChanged) {
                    ns.onTimeSourceChanged(btn.dataset.source);
                }
            });
        });

        const defaultActive = document.querySelector('.toggle-btn.active[data-source]');
        if (defaultActive) {
            _applyTimeSourceDisplay(defaultActive.dataset.source);
        }
    }

    function _initSliders() {
        const sliderMap = {
            bgOpacity: { badge: 'bgOpacityValue', suffix: '%' },
            paddingX: { badge: 'paddingXValue', suffix: '%' },
            paddingY: { badge: 'paddingYValue', suffix: '%' },
        };

        Object.entries(sliderMap).forEach(([id, cfg]) => {
            const slider = document.getElementById(id);
            const badge = document.getElementById(cfg.badge);
            const update = () => { if (badge) badge.textContent = slider.value + cfg.suffix; };
            slider.addEventListener('input', update);
            update();
        });

        const fsSlider = document.getElementById('fontSize');
        const fsInput = document.getElementById('fontSizeInput');
        if (fsSlider && fsInput) {
            fsSlider.addEventListener('input', () => { fsInput.value = fsSlider.value; });
            fsInput.addEventListener('input', () => {
                let val = parseInt(fsInput.value, 10);
                if (!isNaN(val)) fsSlider.value = Math.min(Math.max(val, 1), 20);
            });
            fsInput.addEventListener('change', () => {
                let val = parseInt(fsInput.value, 10);
                if (isNaN(val) || val < 1) fsInput.value = 1;
                else if (val > 20) fsInput.value = 20;
                fsSlider.value = fsInput.value;
            });
        }

        const tokenLenInput = document.getElementById('batchTokenLengthInput');
        if (tokenLenInput) {
            tokenLenInput.addEventListener('change', () => {
                let val = parseInt(tokenLenInput.value, 10);
                if (isNaN(val) || val < 4) val = 4;
                if (val > 12) val = 12;
                tokenLenInput.value = String(val);
            });
        }
    }

    function _initPositionToggle() {
        const btns = document.querySelectorAll('.toggle-btn[data-pos]');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    function _initShadowToggle() {
        const btns = document.querySelectorAll('.toggle-btn[data-shadow]');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    return { init, getAll, getDate, getTimeSource, applyTimeSourceDisplay: _applyTimeSourceDisplay };
})();

window.Settings = Settings;
