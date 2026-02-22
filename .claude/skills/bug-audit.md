# Skill: Bug 稽核清單

當使用者要求全面檢查插件功能、或懷疑有 regression 時使用。逐項檢查以下清單。

---

## 一、時間來源邏輯

### 檢查 `main.js`：`refreshSelection()` 與 prevBtn/nextBtn
```js
// ✅ 正確：只在 original 模式呼叫 autoFillDate
if (Settings.getTimeSource() === 'original') {
    autoFillDate(firstImgPath);
}

// ❌ 錯誤：會覆蓋 now/manual 模式的值
if (Settings.getTimeSource() !== 'manual') {
    autoFillDate(firstImgPath);
}
```
**確認三處**：`refreshSelection()`、`prevBtn` click handler、`nextBtn` click handler。

---

### 檢查 `settings.js`：`_savedManualDatetime` 生命週期

```js
// ✅ loadSettings() 中的正確順序：
// 1. 先設 _savedManualDatetime
if (opts.manualDatetime) {
    _savedManualDatetime = opts.manualDatetime;
}
// 2. 再 btn.click()（會觸發 _applyTimeSourceDisplay，需要 _savedManualDatetime 已設好）
if (opts.timeSource) {
    const btn = ...;
    if (btn) btn.click();
}

// ✅ saveSettings() 中只在 manual 模式更新
if (getTimeSource() === 'manual') {
    _savedManualDatetime = currentInputVal;
}
```

---

## 二、Cache / 狀態清除

### `_startupItems` 使用後必須清除
```js
// ✅
all = window._startupItems;
window._startupItems = null; // 用完就清，否則 refresh 拿到舊快取
```

### `isRefreshing` / `isApplying` 必須在 finally 中重置
```js
// ✅
finally {
    isRefreshing = false;  // or isApplying = false
}
```

---

## 三、Canvas 繪製

### `formatDate()` 必須用 regex `/g` flag
```js
// ✅
.replace(/YYYY/g, ...)
.replace(/MM/g, ...)

// ❌ 只替換第一個出現
.replace('MM', ...)
```

### shadow 重置
```js
// drawTimestampToContext() 繪製完文字後必須重置：
ctx.shadowColor = 'transparent';
ctx.shadowBlur = 0;
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 0;
```

---

## 四、Slider / Input 一致性

### `fontSizeInput` 的 JS max 要跟 HTML 一致
```js
// HTML: max="20"
// JS:
if (val > 20) fsInput.value = 20; // ✅（不是 100）
fsSlider.value = Math.min(Math.max(val, 1), 20); // ✅
```

---

## 五、HTML 語義

### `<main>` 不可巢狀於 `<aside>`
```html
<!-- ✅ -->
<aside class="settings-panel">
  <div class="settings"> ... </div>
</aside>

<!-- ❌ -->
<aside class="settings-panel">
  <main class="settings"> ... </main>
</aside>
```

---

## 六、EXIF Badge 狀態

- **original 模式**：badge 由 `autoFillDate()` 更新（`📸 EXIF` 或 `📁 建立時間`）
- **now / manual 模式**：badge 應清空（`badge.textContent = ''`）
- 切換模式時在 `_applyTimeSourceDisplay()` 中處理

---

## 七、格式支援

```js
const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
// TIFF 不在列表中（Canvas 不支援）
```

---

## 八、互斥旗標

| 旗標 | 用途 | 需在哪裡重置 |
|------|------|------------|
| `isApplying` | 燒入中 | `applyTimestamps()` finally |
| `isRefreshing` | 正在 getSelected | `refreshSelection()` finally |
| `applyCancelled` | 使用者取消 | `applyTimestamps()` 開始時設 false |
| `_isLoading` | 載入設定中 | `loadSettings()` finally |
