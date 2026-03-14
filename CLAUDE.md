# Eagle Timestamp Plugin

Eagle 4 Window Plugin，為照片燒入視覺化時間戳記。Chromium 107 + Node 16，零外部依賴。

## File Structure
```
├── manifest.json       Plugin manifest
├── index.html          UI entry (settings left, preview right)
├── js/
│   ├── main.js         Eagle lifecycle, UI state, apply flow
│   ├── settings.js     Settings IIFE, localStorage persistence
│   └── timestamp.js    Canvas burn engine, EXIF reader, formatDate
├── css/style.css       Dark theme
├── changelog.md        Version history
└── prompt_for_next_session.md  AI handoff + v1.9.0 patterns
```

## Critical Rules

### Eagle API Constraints
- `item.filePath`, `item.name` 等是 READ-ONLY — 永遠不要賦值
- `addFromPath(path, options)` 2-arg format；目標資料夾由 UI 選擇器 `State.activeFolders` 控制
- TAG 更新：先寫 `metadata.json`（零 API 依賴），再用 HTTP API 通知刷新（可選）
- Plugin API `eagle.item.update` 會 hang — 永遠不要用
- `getSelected()` startup timeout — 用 Promise.race + retry
- TIFF 不支援；支援格式：.jpg .jpeg .png .webp .gif .bmp

### Version Bump Protocol
每次版本變更必須同步 4 檔：`manifest.json` / `changelog.md` / `README.md` / `prompt_for_next_session.md`

### Bug Prevention
- `autoFillDate()`: 只在 `getTimeSource() === 'original'` 時呼叫
- `_savedManualDatetime`: 在 `btn.click()` 前設定
- `formatDate()`: 總是用 `/g` regex flag
- `timeoutId`: 宣告在 try-catch 外
- Canvas shadow: 在 `finally` block 重置
- `buildStampedBaseName`: 先算 fixedPart 長度再截斷 origBase
- `appendTagToOriginalItemIfNeeded`: 必須在獨立 try-catch 中，不影響 success 計數
- `cleanupTemp`: 用 setTimeout 延遲 3 秒，避免 Eagle 尚在讀取
- 資料夾選擇：由 footer UI 選擇器控制，`State.activeFolders`（Set），預設全選
- 設定面板滾動：JS `fixHeight` 動態計算 + `window.addEventListener('resize')`
- 圖庫路徑：從 `item.filePath` 推算（`/images/` 之前的部分），快取在 `_libraryPath`
- 資料夾名稱：讀 `{library}/metadata.json`，不依賴 HTTP API

> v1.9.0 Key Patterns（可折疊 UI、備註模板、資料夾偵測）：見 `prompt_for_next_session.md`

### Skills (in .claude/skills/)
| Skill | When to Use |
|-------|-------------|
| `eagle-api.md` | Eagle API queries, addFromPath |
| `version-bump.md` | Version updates, changelog |
| `bug-audit.md` | Full feature audit, regression check |
| `settings-patterns.md` | Adding new settings items |
