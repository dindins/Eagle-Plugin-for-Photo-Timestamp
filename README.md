# Eagle 時間戳記工具（Timestamp Tool）

> 版本：1.6.9 ｜ 2026-02-23

為 Eagle 4 設計的輕量插件，批量為照片燒入視覺化時間戳記。**完全本地運作**，零外部 npm 套件依賴。
支援從相片 EXIF 或檔案建立時間動態讀取日期，並提供左右並排的即時多圖預覽介面。

---

## 專案結構

```
EAGLE Plugin/
├── manifest.json       插件宣告
├── index.html          設定面板 UI（左右分割版型）
├── README.md           本說明文件
├── changelog.md        版本更新記錄
├── prompt_for_next_session.md  AI 接手指南
├── css/
│   └── style.css       深色主題樣式
├── js/
│   ├── timestamp.js    Canvas 燒入引擎 + EXIF 讀取
│   ├── settings.js     UI 控制邏輯與 localStorage
│   └── main.js         Eagle API 整合入口
└── icons/
    └── icon.png        插件圖示
```

---

## 安裝方式

1. 開啟 Eagle
2. 頂部選單 → **外掛** → 確認已開啟**開發者模式**
3. 點擊「**載入插件**」→ 選取本資料夾
4. 「時間戳記工具」出現在外掛列表即完成

---

## 使用說明

1. 在 Eagle 中選取一張或多張照片
2. 點擊插件開啟視窗（左側設定 / 右側預覽）
3. 調整設定後點擊「**套用至 N 張照片**」
4. 副本會建立在**與原始照片相同的資料夾**中

| 設定 | 說明 |
|------|------|
| **時間來源** | 原始照片 EXIF 時間 / 當前時間 / 統一自訂時間 |
| **顯示格式** | 多種格式，預設 `YYYY/MM/DD` |
| **位置** | 底部三選（↙ 左 / ↓ 中 / ↘ 右，預設右下角） |
| **字型大小** | 相對短邊對角值的百分比（1% ~ 20%） |
| **文字 / 背景顏色** | 色彩選擇器 |
| **背景透明度** | 0%（無背景）~ 100% |
| **照片邊距** | 相對百分比邊距（0% ~ 10%） |

**輸出格式：**
- 檔名：`原始檔名(時間戳記).jpg`
- 備註欄：`[時間戳記] 原始檔案：原始檔名.jpg`

**支援格式：** JPG、PNG、WebP、GIF、BMP（TIFF 因 Chromium 限制不支援）

---

## Eagle API 重要筆記

| 項目 | 說明 |
|------|------|
| `Item` 物件 | Class 實例，`filePath`、`fileURL` 等為**唯讀 getter**，不可直接寫入 |
| `addFromPath(path, options)` | 第一個參數為字串路徑，第二個為選項物件 |
| `options.folders` | 必須傳入 `item.folders`，否則副本不會加入原始資料夾 |
| 事件觸發順序 | `onPluginCreate` → `onPluginRun`（主要觸發點）|
| `onItemSelectionChanged` | Eagle 4 支援，是被動監聽使用者重新選取的最佳機制 |

---

## 技術說明

| 項目 | 作法 |
|------|------|
| 圖片讀取 | `require('fs').readFileSync` → base64 → `HTMLImageElement` |
| 文字燒入 | Canvas API 繪製圓角背景框 + 指定位置文字 |
| 輸出副本 | `canvas.toBlob` → `fs.writeFileSync` 暫存 → `eagle.item.addFromPath` |
| EXIF 讀取 | 直接掃描 JPEG binary header，無外部依賴 |
| 暫存清理 | 處理完畢後自動刪除 `os.tmpdir()` 暫存檔 |
| 設定記憶 | `localStorage.setItem('TimestampPluginSettings', ...)` |

---

## 開發備忘

- Eagle 插件為 Electron 環境，可直接使用 Node.js `fs`/`path`/`os`
- `manifest.json` 的 `main` 必須是**物件**格式，並需 `platform`/`arch` 欄位
- `ctx.roundRect()` 已加入降級處理，相容舊版 Electron
- 所有 async 操作必須有完整的 `try...catch`，未捕捉的錯誤會觸發 DevTools 彈出
- `Promise.race` 中的 `fetchPromise` 需立刻附加 `.catch(() => {})` — 若 timeout 先觸發，fetchPromise 在 race 結束後若仍 reject 將成為 Unhandled Promise Rejection
- `timeoutId` 必須宣告於 `try-catch` **外層**，確保 `catch` 可執行 `clearTimeout`，否則 retry 迴圈中每輪都會洩漏一個 timer
