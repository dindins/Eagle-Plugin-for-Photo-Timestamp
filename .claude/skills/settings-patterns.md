---
name: settings-patterns
description: This skill should be used when the user asks to "add a new setting", "create a new slider", "add text input", "modify settings logic", "add toggle button", or needs guidance on settings.js patterns, localStorage persistence, or UI control wiring in the Eagle Timestamp Plugin.
---

# 設定面板開發模式

在 `settings.js` 新增設定項目或修改設定邏輯時使用。

---

## Settings 模組結構（IIFE）

```js
const Settings = (() => {
    let _isLoading = false;
    let _savedManualDatetime = null;

    function init() { ... }
    function getAll(filePath?) { ... }
    function getDate(filePath?) { ... }
    function getTimeSource() { ... }

    return { init, getAll, getDate, getTimeSource, applyTimeSourceDisplay: _applyTimeSourceDisplay };
})();
window.Settings = Settings;
```

---

## 新增設定項目的完整步驟

### 1. `index.html`：加入 UI 元件

```html
<!-- toggle-btn 型態 -->
<div class="setting-group">
  <label class="setting-label">🆕 新設定</label>
  <div class="toggle-group" id="newToggle">
    <button class="toggle-btn active" data-xxx="a">選項A</button>
    <button class="toggle-btn" data-xxx="b">選項B</button>
  </div>
</div>

<!-- slider 型態 -->
<div class="setting-group">
  <label class="setting-label">🆕 新滑竿</label>
  <div class="slider-row">
    <input type="range" id="newSlider" class="slider" min="0" max="10" value="5">
    <span class="value-badge" id="newSliderValue">5</span>
  </div>
</div>

<!-- text-input 型態（v1.7.0 新增） -->
<div class="setting-group">
  <label class="setting-label">📝 新文字欄</label>
  <input type="text" id="newText" class="text-input"
         placeholder="提示文字" maxlength="50" />
  <p class="hint">說明文字</p>
</div>
```

### 2. `settings.js`：`getAll()` 加入讀取

```js
function getAll(filePath = null) {
    return {
        // toggle-btn:
        newSetting: document.querySelector('.toggle-btn.active[data-xxx]')?.dataset.xxx || 'a',
        // slider:
        newSlider: parseInt(document.getElementById('newSlider').value, 10),
        // text-input:
        newText: (document.getElementById('newText')?.value || '').trim(),
    };
}
```

### 3. `settings.js`：初始化（toggle 需 init 函式，slider 加入 sliderMap）

```js
// toggle 型態：新增 _initNewToggle() 並在 init() 中呼叫
function _initNewToggle() {
    const btns = document.querySelectorAll('.toggle-btn[data-xxx]');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

// slider 型態：加入 _initSliders() 的 sliderMap
const sliderMap = {
    newSlider: { badge: 'newSliderValue', suffix: '' },
};

// text-input 型態：無需額外 init，已被 init() 的 querySelectorAll('input') 涵蓋
```

### 4. `settings.js`：`loadSettings()` 還原邏輯

```js
// toggle-btn
if (opts.newSetting) {
    const btn = document.querySelector(`.toggle-btn[data-xxx="${opts.newSetting}"]`);
    if (btn) btn.click();
}

// slider（elementMap 中加入）
const elementMap = {
    newSlider: opts.newSlider,
};

// text-input（直接還原 value）
if (opts.newText !== undefined) {
    const el = document.getElementById('newText');
    if (el) el.value = opts.newText;
}
```

### 5. `timestamp.js`（若影響繪製）：`drawTimestampToContext()` 解構

```js
const { newSetting = 'a', ... } = opts;
```

---

## localStorage 遷移模式（v1.7.0 範例）

重命名或拆分設定 key 時，在 `loadSettings()` 的 `JSON.parse` 之後立即處理：

```js
// 舊版 padding → 新版 paddingX/paddingY
if (opts.padding !== undefined && opts.paddingX === undefined) {
    opts.paddingX = opts.padding;
    opts.paddingY = opts.padding;
}
```

用 `!== undefined` 確保 `0` 也能正確遷移。

---

## `_isLoading` 旗標

`loadSettings()` 期間 `btn.click()` 會觸發監聯器。`_isLoading = true` 阻止 `triggerPreview()` 執行。

```js
function loadSettings() {
    _isLoading = true;
    try { /* ... */ }
    finally { _isLoading = false; }
}

function triggerPreview() {
    if (_isLoading) return;
    // ...
}
```

---

## 跨模組通信

```js
// settings.js → main.js 預覽更新
window.TimestampPlugin.onSettingsChanged = updatePreview;

// settings.js → main.js 模式切換
window.TimestampPlugin.onTimeSourceChanged = (source) => { ... };
```

---

## 現有控制項對照

| 設定項目 | 型態 | ID / data-* | 讀取方式 |
|---------|------|------------|---------|
| 時間來源 | toggle-btn | `data-source` | `.toggle-btn.active[data-source]` |
| 位置 | toggle-btn | `data-pos` | `.toggle-btn.active[data-pos]` |
| 陰影 | toggle-btn | `data-shadow` | `.toggle-btn.active[data-shadow]` |
| 字型大小 | slider + number | `fontSize` / `fontSizeInput` | `parseInt(el.value, 10)` |
| 背景透明度 | slider | `bgOpacity` | `parseInt(el.value, 10)` |
| 水平邊距 | slider | `paddingX` | `parseInt(el.value, 10)` |
| 垂直邊距 | slider | `paddingY` | `parseInt(el.value, 10)` |
| 檔名後綴 | text-input | `suffixInput` | `(el.value \|\| '').trim()` |
| 文字顏色 | color | `textColor` | `el.value` |
| 背景顏色 | color | `bgColor` | `el.value` |
