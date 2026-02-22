# Skill: 設定面板開發模式

當需要在 `settings.js` 新增設定項目、或修改設定邏輯時使用。

---

## Settings 模組結構（IIFE）

```js
const Settings = (() => {
    // 私有狀態
    let _isLoading = false;
    let _savedManualDatetime = null;

    // 公開 API
    function init() { ... }
    function getAll(filePath?) { ... }
    function getDate(filePath?) { ... }
    function getTimeSource() { ... }

    return { init, getAll, getDate, getTimeSource, applyTimeSourceDisplay: _applyTimeSourceDisplay };
})();
window.Settings = Settings;
```

---

## 新增一個設定項目的完整步驟

### 1. `index.html`：加入 UI 元件
```html
<!-- 使用 toggle-btn 型態 -->
<div class="setting-group">
  <label class="setting-label">🆕 新設定</label>
  <div class="toggle-group" id="newToggle">
    <button class="toggle-btn active" data-xxx="a">選項A</button>
    <button class="toggle-btn" data-xxx="b">選項B</button>
  </div>
</div>

<!-- 或使用 slider 型態 -->
<div class="setting-group">
  <label class="setting-label">🆕 新滑竿</label>
  <div class="slider-row">
    <input type="range" id="newSlider" class="slider" min="0" max="10" value="5">
    <span class="value-badge" id="newSliderValue">5</span>
  </div>
</div>
```

### 2. `settings.js`：`getAll()` 加入讀取
```js
function getAll(filePath = null) {
    return {
        // ... 現有項目
        newSetting: document.querySelector('.toggle-btn.active[data-xxx]')?.dataset.xxx || 'a',
        // 或 slider:
        newSlider: parseInt(document.getElementById('newSlider').value, 10),
    };
}
```

### 3. `settings.js`：加入 `_initNewToggle()` 函式
```js
function _initNewToggle() {
    const btns = document.querySelectorAll('.toggle-btn[data-xxx]');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}
```

### 4. `settings.js`：在 `init()` 中呼叫
```js
function init() {
    _initTimeSourceToggle();
    _initSliders();
    _initPositionToggle();
    _initShadowToggle();
    _initNewToggle(); // ← 新增
    loadSettings();
    // ... 事件監聽（.toggle-btn 已涵蓋新按鈕）
}
```

### 5. `settings.js`：`loadSettings()` 加入還原邏輯
```js
// toggle-btn 型態
if (opts.newSetting) {
    const btn = document.querySelector(`.toggle-btn[data-xxx="${opts.newSetting}"]`);
    if (btn) btn.click();
}

// slider 型態（elementMap 中加入）
const elementMap = {
    // ...
    newSlider: opts.newSlider,
};
```

### 6. `timestamp.js`（若影響繪製）：`drawTimestampToContext()` 加入解構
```js
const {
    // ... 現有
    newSetting = 'a', // 加預設值
} = opts;
```

---

## `_isLoading` 旗標的用途

在 `loadSettings()` 執行期間，`btn.click()` 會觸發所有 click 監聽器。
`_isLoading = true` 確保 `triggerPreview()` 在這段期間不執行（避免無圖可預覽時就觸發繪製）。

```js
function loadSettings() {
    _isLoading = true;
    try {
        // ... 還原設定
    } finally {
        _isLoading = false; // 必須在 finally 中解除
    }
}

function triggerPreview() {
    if (_isLoading) return; // 核心防護
    if (window.onSettingsChanged) window.onSettingsChanged();
}
```

---

## 跨模組通信模式

```js
// settings.js 觸發 main.js 的預覽更新
window.onSettingsChanged = updatePreview; // main.js 中設定

// settings.js 通知 main.js 模式切換
window.onTimeSourceChanged = (source) => { ... }; // main.js 中設定

// 在 settings.js 中呼叫
if (window.onTimeSourceChanged) {
    window.onTimeSourceChanged(btn.dataset.source);
}
```

---

## 現有 toggle 選取器對照

| 設定項目 | data-* 屬性 | 讀取選取器 |
|---------|------------|----------|
| 時間來源 | `data-source` | `.toggle-btn.active[data-source]` |
| 位置 | `data-pos` | `.toggle-btn.active[data-pos]` |
| 陰影 | `data-shadow` | `.toggle-btn.active[data-shadow]` |

---

## `saveSettings()` 的特殊處理

手動日期有獨立的記憶機制，不走一般流程：
```js
// ✅ 只在 manual 模式時更新記憶
if (getTimeSource() === 'manual') {
    _savedManualDatetime = currentInputVal;
}
// ✅ 儲存時優先用記憶值，避免存入 EXIF / now 的顯示值
manualDatetime: _savedManualDatetime || currentInputVal,
```
