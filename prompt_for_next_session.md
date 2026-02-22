# Eagle Timestamp Plugin — 下次 Session 接手指南

> 最後更新：2026-02-22 ｜ 版本：1.6.2

---

## 專案位置
`C:\Cluade Tools\EAGLE Plugin\`

---

## 目前版本：1.6.2

完整功能列表：
- 多圖預覽，`←` / `→` 鍵或按鈕切換
- 時間來源三模式：原始照片時間 / 當前時間 / 統一自訂時間
- 所有模式皆顯示時間欄位（readonly 或可編輯）
- 底部位置三選（左 / 中 / 右）
- 文字陰影開關
- 批次套用 + 取消按鈕 + 進度顯示檔名
- EXIF 來源徽章（原始照片模式）
- 空預覽佔位提示

---

## 核心架構

### 檔案結構
```
EAGLE Plugin/
├── .claude/
│   ├── settings.local.json
│   └── skills/
│       ├── eagle-api.md         ← Eagle API 限制參考
│       ├── version-bump.md      ← 版本更新流程
│       ├── bug-audit.md         ← Bug 稽核清單
│       └── settings-patterns.md ← 設定面板開發模式
├── js/
│   ├── main.js       ← Eagle 事件、UI 控制、多圖預覽邏輯
│   ├── settings.js   ← Settings IIFE 模組，localStorage 讀寫
│   └── timestamp.js  ← Canvas 燒入引擎 + EXIF 讀取
├── index.html
├── css/style.css
├── manifest.json
├── changelog.md
└── README.md
```

---

## Eagle 4 API 關鍵限制

- `item.filePath`, `item.name` 等全部**唯讀**，不可寫入
- `eagle.item.addFromPath(tmp, options)` 建立副本（非覆蓋原始）
- `getSelected()` 可能 timeout → 已加 retry + 2秒 timeout 保護
- **不支援 TIFF**（Chromium Canvas 限制）
- 支援：`.jpg .jpeg .png .webp .gif .bmp`

---

## 關鍵狀態變數

### main.js
| 變數 | 說明 |
|------|------|
| `currentSelectedImages[]` | 過濾後圖片路徑陣列 |
| `globalEagleItems[]` | Eagle Item 物件陣列 |
| `currentPreviewIndex` | 目前預覽索引 |
| `isApplying` | 燒入中旗標 |
| `isRefreshing` | getSelected 旗標 |
| `applyCancelled` | 使用者取消旗標 |

### settings.js
| 變數 | 說明 |
|------|------|
| `_isLoading` | loadSettings() 期間阻止 triggerPreview() |
| `_savedManualDatetime` | 手動模式日期記憶（跨模式切換不遺失）|

---

## 跨模組通信

```js
window.onSettingsChanged = updatePreview;        // settings → main：設定變更時重繪
window.onTimeSourceChanged = (source) => { ... }; // settings → main：模式切換時通知
```

---

## 已知 Bug 模式（勿重犯）

1. **`autoFillDate()` 被非 original 模式呼叫** → 條件必須是 `=== 'original'`
2. **`_startupItems` 用後未清** → 需設 `null`
3. **`_savedManualDatetime` 未在 `btn.click()` 前設好** → manual 模式切換後欄位空白
4. **`formatDate()` 不用 `/g` flag** → 重複字元只替換一次
5. **`fontSizeInput` JS max 與 HTML max 不一致** → 均應為 20
6. **`<main>` 巢狀於 `<aside>`** → 改為 `<div>`

---

## 版本更新三件套

每次升版必須同步：
1. `manifest.json` → `"version"`
2. `changelog.md` → 頂部新增 `## [x.x.x] - 日期`
3. `README.md` → 第 3 行 `> 版本：x.x.x ｜ 日期`

---

## Skills 使用方式

遇到對應任務時，可讀取 `.claude/skills/` 中的技能檔案：

| 技能檔案 | 使用時機 |
|---------|---------|
| `eagle-api.md` | Eagle API 查詢、addFromPath 用法 |
| `version-bump.md` | 要升版或更新 changelog |
| `bug-audit.md` | 要做全面功能稽核 |
| `settings-patterns.md` | 要新增設定項目 |

---

## Canvas 燒入流程

```
burnTimestamp(filePath, opts)
  → loadImage()                    # Buffer → base64 → HTMLImageElement
  → drawTimestampToContext()       # 計算大小 → 繪製背景 → 繪製文字（含陰影）
  → canvas.toBlob() → writeFile() # 輸出暫存
  → eagle.item.addFromPath()      # 加入圖庫
  → cleanupTemp()                 # 刪除暫存
```

---

## UI 元件 ID 對照（常用）

| ID | 說明 |
|----|------|
| `manualDatetime` | 時間顯示輸入框（readonly 在非 manual 模式）|
| `timeDisplayLabel` | 動態標籤（隨模式變化）|
| `timeDisplayHint` | 動態說明（隨模式變化）|
| `exifSourceBadge` | EXIF / 建立時間 來源徽章 |
| `positionToggle` | 底部位置三個 toggle-btn |
| `shadowToggle` | 文字陰影開關 |
| `previewCanvas` | 即時預覽 |
| `workCanvas` | 燒入工作畫布（不可見）|
| `cancelApplyBtn` | 取消燒入 |
