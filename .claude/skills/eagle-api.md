---
name: eagle-api
description: This skill should be used when the user asks about "Eagle API", "addFromPath usage", "getSelected behavior", "Eagle item properties", "Eagle event hooks", "plugin lifecycle", or needs guidance on Eagle 4 Plugin API constraints, read-only getters, and Node.js module usage within the Electron environment.
---

# Eagle 4 Plugin API 參考

Eagle Timestamp 插件開發中查詢 Eagle API 限制與行為時使用。

---

## Eagle Item 屬性（全部唯讀）

```js
item.filePath   // 字串，本機絕對路徑
item.name       // 字串，不含副檔名的檔名
item.ext        // 字串，副檔名（含 .）
item.tags       // 字串陣列
item.folders    // 字串陣列（資料夾 ID）
item.fileURL    // 備用路徑（有時 filePath 為空時使用）
```

**重要**：以上全部為唯讀 getter，**不可寫入**。任何試圖賦值的行為都會靜默失敗或 throw。

---

## 主要 API 方法

```js
// 取得目前在 Eagle 中選取的項目（非同步，可能 timeout）
eagle.item.getSelected() → Promise<Item[]>

// 將本機暫存檔加入 Eagle 圖庫（建立副本，非修改原始檔）
eagle.item.addFromPath(filePath: string, options: {
  name?: string,
  annotation?: string,
  tags?: string[],
  folders?: string[]
}) → Promise<void>
```

---

## getSelected 防護模式

`getSelected()` 在插件剛開啟時有機率 timeout 或 throw。防護寫法：

```js
for (let retry = 0; retry < 10; retry++) {
  const timeoutProm = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('EAGLE_API_TIMEOUT')), 2000)
  );
  all = await Promise.race([eagle.item.getSelected(), timeoutProm]);
  break;
  // 捕捉 'plugin-create' 錯誤時 → 等 50ms 繼續重試
}
```

**注意**：`fetchPromise` 須立刻附加 `.catch(() => {})`，避免 race 結束後 reject 成為 Unhandled Promise Rejection。

---

## Eagle 事件掛鉤

```js
eagle.onPluginCreate(plugin => { /* 初始化 UI，只執行一次 */ });
eagle.onPluginShow(() => { /* 每次插件顯示時觸發 */ });
eagle.onPluginRun(() => { /* 使用者從右鍵選單觸發時 */ });
eagle.onPluginHide(() => { /* 插件隱藏時 */ });
eagle.onItemSelectionChanged(items => { /* Eagle 選取變更時 */ });
```

---

## Canvas / 圖片格式支援

Chromium Canvas 可載入：`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`
**不支援**：`.tiff`, `.tif`（Chromium 限制，即使是 Electron 環境）

---

## Node.js Modules（Electron 環境可用）

```js
require('fs')    // 讀寫檔案、statSync、unlinkSync 等
require('path')  // basename, extname, join 等
require('os')    // tmpdir()
```

---

## addFromPath 副本模式

插件**無法直接覆蓋原始檔**。工作流程：
1. Canvas 燒入 → 輸出到 `os.tmpdir()` 暫存檔
2. `eagle.item.addFromPath(tmp, { name, annotation, tags, folders })` → 加入圖庫為新項目
3. `setTimeout(cleanupTemp, 3000)` → 延遲 3 秒刪除暫存檔（避免競態）

## TAG 更新（v1.9.0）

**不可使用 Plugin API** — `eagle.item.update()` 在 Eagle 4 中會 hang（Promise 永不 resolve）。

正確方式：Eagle HTTP API
```js
// Node.js http 模組（無 CORS 限制）
POST http://127.0.0.1:41595/api/item/update
Content-Type: application/json
Body: { "id": "item-id", "tags": ["tag1", "tag2"] }
```

注意：**必須用 POST**，PUT 回傳 405 Method Not Allowed。

---

## 常見陷阱

| 問題 | 正確做法 |
|------|---------|
| 嘗試寫入 `item.name = '...'` | 用 addFromPath 的 name option |
| TIFF 加入 SUPPORTED_EXT | 移除，Canvas 無法載入 |
| 未 await addFromPath | 必須 await，否則 tmp 檔案提早被刪除 |
| getSelected 不設 timeout | 加 Promise.race + 2000ms timeout |
| addFromPath 未傳 folders | 必須傳 `folders: item.folders`，否則副本不在原始資料夾 |
