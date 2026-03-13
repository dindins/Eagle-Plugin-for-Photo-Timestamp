# Eagle Timestamp Plugin — 下次 Session 接手指南

> 最後更新：2026-03-13 ｜ 版本：1.8.0

---

## 專案位置
`C:\Cluade Tools\EAGLE Plugin\`

---

## 目前版本：1.8.0

完整功能列表：
- 多圖預覽，`←` / `→` 鍵或按鈕切換
- 時間來源三模式：原始照片時間 / 當前時間 / 統一自訂時間
- 所有模式皆顯示時間欄位（readonly 或可編輯）
- 底部位置三選（左 / 中 / 右）
- 文字陰影開關
- 批次套用 + 取消按鈕 + 進度顯示檔名
- EXIF 來源徽章（原始照片模式）
- 空預覽佔位提示
- **自訂檔名後綴**（留空自動產生日期）
- **分離 X/Y 邊距**（paddingX / paddingY）
- **TAG 管理**：原始照片 TAG、新生成照片繼承/附加 TAG
- **自訂命名模式**：`{name}_{suffix}_{token}`，Token 長度 4~12
- **檔名衝突重試**（最多 20 次）
- **檔名長度上限**（基底名稱 200 字元）

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
- TAG 更新：優先嘗試 `eagle.item.update` → `modify` → `set`，三層 fallback

---

## 關鍵狀態變數

### main.js — State 物件
| 屬性 | 說明 |
|------|------|
| `State.images[]` | 過濾後圖片路徑陣列 |
| `State.items[]` | Eagle Item 物件陣列 |
| `State.previewIndex` | 目前預覽索引 |
| `State.applying` | 燒入中旗標 |
| `State.refreshing` | getSelected 旗標 |
| `State.cancelled` | 使用者取消旗標 |
| `State.hadExif` | 第一張圖是否有 EXIF |
| `State.firstShowDone` | 首次 show 後不再延遲 |
| `State.startupItems` | onItemSelectionChanged 快取 |

### settings.js
| 變數 | 說明 |
|------|------|
| `_isLoading` | loadSettings() 期間阻止 triggerPreview() |
| `_savedManualDatetime` | 手動模式日期記憶（跨模式切換不遺失）|

---

## 主要函式（v1.8.0 新增）

| 函式 | 說明 |
|------|------|
| `getPrimaryFolder(item)` | 取第一個資料夾，回傳 `[folders[0]]` |
| `mergeTags(originalTags, extraTag)` | Set 合併，去重 |
| `buildGeneratedTags(item, opts)` | 組裝新生成照片的 TAG 陣列 |
| `appendTagToOriginalItemIfNeeded(item, opts)` | 有變更才呼叫 Eagle API 更新 TAG |
| `createBatchToken(len)` | 隨機 Token，clamp 4~12 字元 |
| `buildStampedBaseName(origBase, fileSuffix, opts)` | 依命名模式組裝檔名，限 200 字元 |
| `addStampedItemWithUniqueName(tmpPath, payload)` | 最多重試 20 次，衝突自動加 `_2`... |

---

## 跨模組通信

```js
window.TimestampPlugin.onSettingsChanged = updatePreview;     // settings → main：設定變更重繪
window.TimestampPlugin.onTimeSourceChanged = (source) => {}; // settings → main：模式切換通知
```

---

## 已知 Bug 模式（勿重犯）

1. **`Promise.race` 中 `fetchPromise` 未加 `.catch()`** → Unhandled Promise Rejection
2. **`timeoutId` 宣告於 `try {}` 內部** → `catch` 無法 clearTimeout，timer 洩漏
3. **`autoFillDate()` 被非 original 模式呼叫** → 條件必須是 `=== 'original'`
4. **`State.startupItems` 用後未清** → 需設 `null`
5. **`_savedManualDatetime` 未在 `btn.click()` 前設好** → manual 模式切換後欄位空白
6. **`formatDate()` 不用 `/g` flag** → 重複字元只替換一次
7. **`buildStampedBaseName` 截斷邏輯順序錯誤** → 應先計算固定部分長度，再截 `{name}`
8. **TAG 比較用 `JSON.stringify`** → 順序敏感，`mergeTags` 保插入順序，原始在前故可行

---

## 版本更新四件套

每次升版必須同步：
1. `manifest.json` → `"version"`
2. `changelog.md` → 頂部新增 `## [x.x.x] - 日期`
3. `README.md` → 第 3 行 `> 版本：x.x.x ｜ 日期`
4. `prompt_for_next_session.md` → 標題版本與功能列表

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
  → buildStampedBaseName()        # 組裝檔名（含長度保護）
  → addStampedItemWithUniqueName() # 加入圖庫（含衝突重試）
  → appendTagToOriginalItemIfNeeded() # 更新原始照片 TAG
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
| `tagOriginalEnabled` | 原始照片 TAG 啟用勾選框 |
| `originalTagInput` | 原始照片 TAG 輸入框 |
| `newPhotoUseOriginalTags` | 新照片繼承原始 TAG 勾選框 |
| `tagGeneratedEnabled` | 新照片額外 TAG 啟用勾選框 |
| `generatedTagInput` | 新照片額外 TAG 輸入框 |
| `namePatternInput` | 命名模式輸入框 |
| `batchTokenLengthInput` | Token 長度數字輸入框 |
