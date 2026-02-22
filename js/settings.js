/**
 * settings.js
 * 設定面板 UI 互動邏輯
 * 管理所有控制項的狀態讀取與 UI 更新
 */

'use strict';

const Settings = (() => {

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
            padding: parseInt(document.getElementById('padding').value, 10),
            shadow: document.querySelector('.toggle-btn.active[data-shadow]')?.dataset.shadow !== 'off',
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
        } else if (source === 'original' && filePath) {
            let targetDate = window.TimestampEngine ? window.TimestampEngine.readExifDate(filePath) : null;
            if (!targetDate) {
                try {
                    const fs = require('fs');
                    targetDate = fs.statSync(filePath).birthtime;
                } catch (e) {
                    targetDate = new Date();
                }
            }
            return targetDate;
        }
        return new Date();
    }

    // ── 初始化所有控制項事件 ────────────
    function init() {
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

    let _isLoading = false; // 載入 localStorage 期間禁止重繪，避免觸發多餘預覽
    let _savedManualDatetime = null; // 使用者最後一次在「手動」模式輸入的日期，跨模式切換時不遺失

    function triggerPreview() {
        if (_isLoading) return;
        if (window.onSettingsChanged) {
            window.onSettingsChanged();
        }
    }

    // ── 儲存與讀取設定 (localStorage) ────
    function saveSettings() {
        const opts = getAll();
        const currentInputVal = document.getElementById('manualDatetime').value;
        // 只在手動模式下更新「使用者設定的日期」記憶
        if (getTimeSource() === 'manual') {
            _savedManualDatetime = currentInputVal;
        }
        // 儲存手動日期記憶（而非 input 目前顯示的 EXIF / now 時間）
        const toSave = {
            ...opts,
            manualDatetime: _savedManualDatetime || currentInputVal,
            date: undefined,
        };
        try {
            localStorage.setItem('TimestampPluginSettings', JSON.stringify(toSave));
        } catch (e) {
            void('[TimestampTool] 無法儲存設定:', e);
        }
    }

    function loadSettings() {
        _isLoading = true;
        try {
            const saved = localStorage.getItem('TimestampPluginSettings');
            if (!saved) return;
            const opts = JSON.parse(saved);

            // 先還原手動日期記憶，_applyTimeSourceDisplay('manual') 會用到它
            if (opts.manualDatetime) {
                _savedManualDatetime = opts.manualDatetime;
            }

            // 還原時間來源（觸發 _applyTimeSourceDisplay，所以必須在 _savedManualDatetime 設好之後）
            if (opts.timeSource) {
                const btn = document.querySelector(`.toggle-btn[data-source="${opts.timeSource}"]`);
                if (btn) btn.click();
            }

            // 'now' 模式由 _applyTimeSourceDisplay 顯示當前時間，不覆蓋
            // 其餘模式還原上次的顯示值（EXIF 日期 / 使用者手動值）
            if (opts.manualDatetime && opts.timeSource !== 'now') {
                document.getElementById('manualDatetime').value = opts.manualDatetime;
            }

            // 還原格式
            if (opts.format) document.getElementById('dateFormat').value = opts.format;

            // 還原位置（舊版非底部位置 → 預設右下）
            if (opts.position) {
                const btn = document.querySelector(`.toggle-btn[data-pos="${opts.position}"]`);
                if (btn) {
                    btn.click();
                } else {
                    const defaultBtn = document.querySelector('.toggle-btn[data-pos="bottom-right"]');
                    if (defaultBtn) defaultBtn.click();
                }
            }

            // 還原陰影設定
            if (opts.shadow !== undefined) {
                const shadowVal = opts.shadow === true ? 'on' : 'off';
                const btn = document.querySelector(`.toggle-btn[data-shadow="${shadowVal}"]`);
                if (btn) btn.click();
            }

            // 還原其它設定
            const elementMap = {
                fontSize: opts.fontSize,
                textColor: opts.textColor,
                bgColor: opts.bgColor,
                bgOpacity: opts.bgOpacity,
                padding: opts.padding
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
            void('[TimestampTool] 無法讀取設定:', e);
        } finally {
            _isLoading = false;
        }
    }

    // 根據時間來源更新顯示區塊的標籤、提示與唯讀狀態
    function _applyTimeSourceDisplay(source) {
        const input = document.getElementById('manualDatetime');
        const label = document.getElementById('timeDisplayLabel');
        const hint = document.getElementById('timeDisplayHint');
        const badge = document.getElementById('exifSourceBadge');
        if (!input) return;

        if (source === 'manual') {
            input.readOnly = false;
            input.classList.remove('readonly');
            // 還原使用者上次在手動模式中設定的日期
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
        } else { // 'original'
            input.readOnly = true;
            input.classList.add('readonly');
            if (label) label.textContent = '📸 原始照片時間';
            if (hint) hint.textContent = '從 EXIF 或檔案資訊自動讀取，切換照片時會更新';
            // badge 由 autoFillDate() 在 main.js 中更新
        }
    }

    // 時間來源切換
    function _initTimeSourceToggle() {
        const btns = document.querySelectorAll('.toggle-btn[data-source]');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _applyTimeSourceDisplay(btn.dataset.source);
                // 通知 main.js 模式已切換（例如切回 original 時重新填入 EXIF 日期）
                if (window.onTimeSourceChanged) {
                    window.onTimeSourceChanged(btn.dataset.source);
                }
            });
        });

        // 根據預設 active 按鈕初始化顯示狀態
        const defaultActive = document.querySelector('.toggle-btn.active[data-source]');
        if (defaultActive) {
            _applyTimeSourceDisplay(defaultActive.dataset.source);
        }
    }

    // 滑桿數值顯示與字型手動輸入
    function _initSliders() {
        // bgOpacity 和 padding 依然用 span label
        const sliderMap = {
            bgOpacity: { badge: 'bgOpacityValue', suffix: '%' },
            padding: { badge: 'paddingValue', suffix: '%' },
        };

        Object.entries(sliderMap).forEach(([id, cfg]) => {
            const slider = document.getElementById(id);
            const badge = document.getElementById(cfg.badge);
            const update = () => { if (badge) badge.textContent = slider.value + cfg.suffix; };
            slider.addEventListener('input', update);
            update(); // 初始化顯示
        });

        // 獨立處理 fontSize (slider <-> number input 同步)
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
    }

    // 底部位置切換
    function _initPositionToggle() {
        const btns = document.querySelectorAll('.toggle-btn[data-pos]');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // 文字陰影切換
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
