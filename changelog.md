# Eagle Timestamp Plugin - 變更日誌 (Changelog)

## [1.9.0] - 2026-03-14

### 新增 (Added)
- **可折疊設定面板**：使用原生 `<details>/<summary>` 將設定分為四區：主要設定（時間來源、時間顯示、顯示格式）永遠展開；「視覺微調」、「TAG 設定」、「新檔案設定」三區可折疊，展開狀態自動記憶（獨立 localStorage 鍵 `TimestampPluginSections`）
- **自訂備註格式**：新增 `annotationPatternInput`，支援 `{suffix}`、`{filename}`、`{name}`、`{date}`、`{format}` 五個變數，預設 `[時間戳記:{suffix}] 原始檔案：{filename}`（向後相容）
- **資料夾選擇器**：footer 顯示 `📂 存入：` 按鈕組，從選取照片的資料夾交集/聯集動態生成，預設全選，點擊切換開/關（至少保留一個）；資料夾名稱透過 Eagle HTTP API 取得並快取；唯一資料夾時自動設定不顯示選擇器

### 修復 (Fixed)
- **副本放錯資料夾**：v1.8.0 的 `getPrimaryFolder` 永遠取 `item.folders[0]`，與用戶瀏覽的資料夾無關。改為由資料夾選擇器 UI 控制目標（`State.activeFolders`），預設全選
- **原始照片 TAG 不生效**：Plugin API `eagle.item.update` 在 Eagle 4 中可能 hang（Promise 永不 resolve）；HTTP API 用了 PUT 但 Eagle 只接受 POST（回傳 405）。修正為跳過 Plugin API，直接用 Eagle HTTP API `POST /api/item/update`（Node.js http 模組，1.5 秒 timeout）
- **TAG 更新錯誤遮蔽照片創建成功**：`appendTagToOriginalItemIfNeeded` 改為獨立 try-catch，不影響 success 計數
- **多檔處理卡住**：`eagle.item.update` hang 導致每張等待超時。移除 Plugin API 嘗試，HTTP API timeout 從 3 秒降到 1.5 秒
- **暫存檔競態刪除**：`cleanupTemp` 改為 `setTimeout` 延遲 3 秒
- **MIME/副檔名不匹配**：改用已有的 `MIME_MAP`，暫存檔副檔名統一為對應 MIME 的正確副檔名
- **設定面板展開後無法滾動**：`.settings-panel` 加 `overflow: hidden`；`.settings` 高度由 JS 動態計算（`fixHeight`），監聽 `resize` 事件即時調整
- **Batch Token per-item 而非 per-batch**：迴圈外生成一次，同批次共用
- **展開折疊區段後看不到內容**：`<details>` toggle 事件呼叫 `scrollIntoView({ behavior: 'smooth', block: 'start' })`

### 變更 (Changed)
- 設定面板 UI 重構為「主要設定 + 三個可折疊區段」
- 備註欄從寫死改為可自訂模板（`buildAnnotation` 函式）
- TAG 更新統一走 Eagle HTTP API（`POST /api/item/update`），不再嘗試 Plugin API

---

## [1.8.0] - 2026-03-13

### 新增 (Added)
- **原始照片 TAG 設定**：套用後可自動為原始照片新增指定 TAG（勾選啟用 + 輸入 TAG 名稱）
- **新生成照片 TAG 設定**：可選擇繼承原始照片所有 TAG，並額外附加自訂 TAG
- **自訂檔名命名模式**：支援 `{name}`、`{suffix}`、`{token}` 三個變數，預設格式 `{name}_{suffix}_{token}`；留空自動回退預設值
- **批次 Token 長度可調**：Token 長度設定範圍 4~12 字元（預設 6），各批次唯一，用於防止批次衝突

### 修復 (Fixed)
- **檔名長度上限防護**：`buildStampedBaseName` 加入 `FILE_NAME_BASE_MAX_LENGTH = 200` 上限；先計算 `{suffix}` + `{token}` + 分隔符的固定長度，再截斷 `{name}` 以確保整體不超過 200 字元，`{suffix}` 與 `{token}` 永遠不被截斷
- **檔名衝突自動重試**：`addStampedItemWithUniqueName` 最多重試 20 次，自動在尾端附加 `_2`、`_3`...

### 變更 (Changed)
- 副本僅放入原始照片的**第一個資料夾**（`getPrimaryFolder`），避免在多資料夾情境下產生非預期的重複副本

---

## [1.7.0] - 2026-02-23

### 新增 (Added)
- **自訂檔名後綴**：新增文字輸入框讓使用者自訂輸出檔名後綴；留空時自動套用執行當天日期（`原始檔名_2026-02-23`），有值時使用自訂後綴（`原始檔名_後綴`）。支援 localStorage 持久化，特殊字元自動消毒。
- **分離水平/垂直邊距**：單一 padding 滑桿拆分為 paddingX（水平）與 paddingY（垂直），預設值皆為 3%。所有方位皆向圖片中心偏移，支援從舊版 `padding` 自動遷移至新版 `paddingX`/`paddingY`。

### 變更 (Changed)
- 輸出檔名格式從 `原始檔名(時間戳記)` 改為 `原始檔名_後綴`
- 備註欄格式更新為 `[時間戳記:後綴] 原始檔案：原始檔名.jpg`
- 邊距預設值從 2% 調整為 3%

---

## [1.6.9] - 2026-02-23

### 修復 (Fixed)
- **DevTools 自動開啟問題（5 層防護體系）**：實施全面性 DevTools 防護，徹底解決各種 Eagle 版本下 DevTools 被強制開啟的問題：
  1. **Console 靜默 + 可控日誌系統**：覆蓋所有 `console.*` 方法；建立 `_log` 系統，`_LOG_ENABLED` 開關一鍵切換偵錯輸出
  2. **Unhandled Rejection 全面攔截**：所有未捕獲的 Promise rejection 一律靜默（window + process 雙層）
  3. **全域錯誤攔截**：`window.onerror` 回傳 `true`，阻止錯誤冒泡至 Eagle 的保護機制
  4. **快捷鍵封鎖**：封鎖 F12 / Ctrl+Shift+I / Ctrl+Shift+J
  5. **持續性 closeDevTools**：每 5 秒巡邏（共 3 次 = 15 秒）+ `onPluginCreate` 後三連擊（0/500/1500ms）
- **`refreshSelection` 自動重試 race condition**：新 refresh 進入時取消 pending 的 auto-retry timer，避免多重 refresh 同時執行
- **`loadSettings` 載入期間意外覆蓋設定**：`saveSettings()` 增加 `_isLoading` 防護，載入期間不寫入 localStorage
- **`applyTimestamps` 路徑 fallback 不一致**：`filePath` 加入 `item.fileURL` 作為 fallback，與 `filterImages()` 邏輯一致
- **插件隱藏時 preview debounce timer 未清除**：`onPluginHide` 中清除 pending 的預覽更新

### 重構 (Refactored) — 可維護性提升
- **日誌系統重建**：`void()` → `_log.info/warn/error`，生產環境靜默、偵錯時一鍵恢復；跨檔案透過 `_getLog()` 延遲引用
- **預覽導航抽取**：4 處重複的導航邏輯（prev/next 按鈕 + 左右方向鍵）統一為 `navigateToPreview()` 函式
- **魔術數字命名化**：所有硬編碼數值提取為頂層常數（`EAGLE_API_TIMEOUT_MS`、`JPEG_QUALITY`、`EXIF_SCAN_BYTES` 等 12 個）
- **統一 EXIF 日期入口**：新增 `TimestampEngine.getDateForFile(filePath)` 回傳 `{ date, hadExif }`，消除 main.js 與 settings.js 的重複 fallback 邏輯
- **全域狀態封裝**：10+ 個散落的全域變數統一為 `State` 物件 + `resetSelection()` 清除函式
- **loadImage 效能改善**：改為 `file://` 協議優先、base64 fallback 策略，大圖不再產生 ~33% 記憶體膨脹；MIME 對照表提取為頂層常數
- **模組通訊命名空間化**：`window.onSettingsChanged` → `window.TimestampPlugin.onSettingsChanged`，避免全域污染
- **DevTools 防護精簡**：巡邏改為 5 秒 × 3 次（原 3 秒 × 10 次），備份 console 只保留必要的 3 個方法
- **`setStatus` 可讀性**：巢狀三元運算子改為明確的 if/else if/else 結構

### 變更 (Changed)
- Manifest 雙層宣告 `devTools: false`（root + main 物件）
- 字體改用系統內建字體堆疊，確保完全離線可用
- 移除 Google Fonts `@import`，清理 `index.html` 中的舊版全域攔截器

---

## [1.6.7] - 2026-02-22

### 修復 (Fixed)
- **DevTools 仍自動開啟（主動強制關閉）**：移除 `onPluginCreate`、`onPluginHide` 的 debug `console.log` 輸出，以及右鍵選單不支援時的提示 log；部分 Eagle 版本會因偵測到 console 輸出而強制開啟 DevTools。同時在 `onPluginCreate` 初始化完成後立即呼叫 `eagle.plugin.closeDevTools()`，搭配 `manifest.json` 的 `devTools: false`，從兩個層面確保 DevTools 不被自動開啟。

---

## [1.6.6] - 2026-02-22

### 修復 (Fixed)
- **DevTools 強制開啟問題（根本修復）**：`onPluginCreate` 完成後，`onPluginShow` 幾乎立刻觸發並呼叫 `eagle.item.getSelected()`，此時 Eagle `item` API 尚未完成內部初始化，導致 Eagle 在 `item.js` 內部產生一個我們無法從外部攔截的 unhandled rejection，進而觸發 Eagle 強制開啟 DevTools 的保護機制（即使 `devTools: false` 也無效）。修正方式為：首次 `onPluginShow`/`onPluginRun` 觸發時延遲 1 秒後才呼叫 `refreshSelection()`，給 Eagle API 充分的初始化時間；後續每次顯示不需延遲，不影響正常使用流暢度。

---

## [1.6.5] - 2026-02-22

### 修復 (Fixed)
- **插件啟動後需手動重整才能讀取已選取照片**：`EAGLE_API_TIMEOUT` 發生後改為自動在 3 秒後重試一次，讓 Eagle API 有充分時間完成初始化，用戶無需手動點擊「重整」按鈕；僅在第二次逾時後才顯示手動操作提示。
- **`Uncaught (in promise)` 控制台噪音（第二層攔截）**：加入 `process.on('unhandledRejection')` 於 Node.js / Electron process 層攔截，補足 `window.addEventListener('unhandledrejection')` 無法觸及的部分；Eagle 的 `getSelected()` 在暖機期間於 process context 創建的未捕獲 Promise 現可被靜默。

### 變更 (Changed)
- `manifest.json` 關閉 DevTools（`devTools: false`），正式版不再自動開啟開發者工具。

---

## [1.6.4] - 2026-02-22

### 修復 (Fixed)
- **`Uncaught (in promise)` 控制台噪音（第一層攔截）**：加入 `window.addEventListener('unhandledrejection')` 全局攔截，靜默 Eagle API 暖機期間在 web context 創建的未捕獲 Promise rejection。
- **跨 PC 日期重疊 BUG**：`drawTimestampToContext()` 開頭新增 `ctx.setTransform(1,0,0,1,0,0)` 重置 transform，防止高 DPI / Windows 縮放設定不同的 PC 上 transform 累積導致渲染偏移。
- **陰影殘留導致下次繪製異常**：將陰影重置（`shadowColor`、`shadowBlur`、`shadowOffsetX`、`shadowOffsetY`）從 `try` 區塊內部移至 `finally` 區塊，確保無論 `fillText` 是否拋出例外，陰影狀態都一定被清除，防止狀態污染下一次繪製。

---

## [1.6.3] - 2026-02-22

### 修復 (Fixed)
- **偶發性 `Uncaught (in promise)` 錯誤**：`Promise.race` 逾時（2 秒）退出後，`eagle.item.getSelected()` 返回的 `fetchPromise` 仍在 pending 中，若 Eagle API 稍後才 reject 該 Promise，因已無任何 `.catch()` 監聽而觸發 Unhandled Promise Rejection。修正方式為在 `fetchPromise` 創建後立刻附加 `fetchPromise.catch(() => {})` 以靜默吸收後續 rejection。
- **retry 迴圈 timer 洩漏**：`timeoutId` 原先宣告於 `try {}` 區塊內，`catch` 無法存取，導致每次 `plugin-create` retry 時舊的 `setTimeout` 不會被清除。修正為將 `let timeoutId = null` 移至 `try-catch` 之外，並在 `catch` 入口處統一執行 `clearTimeout(timeoutId)`。

---

## [1.6.2] - 2026-02-22

### 新增 (Added)
- **鍵盤方向鍵切換預覽**：選取多張照片時，可直接按 `←` / `→` 切換預覽，不需點擊按鈕。在輸入框中輸入時不觸發，套用中亦停用。

---

## [1.6.1] - 2026-02-22

### 修復 (Fixed)
- **切換到「當前時間」後切回「原始照片時間」不更新**：新增 `window.onTimeSourceChanged` 回呼，切換回 original 模式且有照片選取時，自動重新呼叫 `autoFillDate()` 填入 EXIF 日期。
- **「統一自訂時間」跨模式切換後遺失**：引入 `_savedManualDatetime` 變數專門儲存使用者在手動模式輸入的日期；切換至其他模式時不會被 EXIF 或當前時間覆蓋，切換回手動模式時自動還原。
- **重新開啟插件後手動日期消失**：`loadSettings()` 改為先還原 `_savedManualDatetime` 再觸發模式初始化，確保切換回手動模式時欄位值正確。
- **非 original 模式殘留 EXIF 徽章**：切換至「當前時間」或「手動」模式時，`exifSourceBadge` 自動清除。

---

## [1.6.0] - 2026-02-22

### 新增 (Added)
- **所有模式皆顯示時間欄位**：「原始照片時間」與「當前時間」模式下，時間欄位改為唯讀顯示（不隱藏），使用者可清楚看到目前參考的時間值。
- **動態時間欄位標籤**：根據所選模式，標籤自動更新為「📸 原始照片時間」、「🕐 當前時間」或「📅 指定日期時間」，配合對應說明文字。
- **底部三選位置**：將九宮格位置選取簡化為底部三個按鈕（↙ 左、↓ 中、↘ 右），減少非必要的選項，操作更直覺。
- **文字陰影開關**：新增陰影切換（✨ 開啟 / 關閉），可依照片背景決定是否使用陰影提升可讀性。
- **預覽佔位提示**：無照片選取時，預覽區顯示「請在 Eagle 中選取照片」引導文字，取代空白畫布。

### 修復 (Fixed)
- **「當前時間」模式切換照片時誤讀 EXIF**：prev/next 按鈕與 `refreshSelection()` 中，修正條件判斷從 `!== 'manual'` 改為 `=== 'original'`，「當前時間」模式不再覆寫顯示值。
- **載入設定時錯誤還原手動日期**：`loadSettings()` 現在僅在 `manual` 模式下還原 `manualDatetime` 值，避免「當前時間」模式載入後顯示舊的 EXIF 日期。

### 變更 (Changed)
- 移除九宮格 `.position-grid` / `.pos-btn` CSS 規則（已無對應 HTML 元素）。
- `loadSettings()` 中若還原位置為舊版非底部位置，自動回退至「右下」。

---

## [1.5.0] - 2026-02-22

### 新增 (Added)
- **EXIF 日期來源標籤**：在「指定日期時間」欄位標題旁顯示 `📸 EXIF` 或 `📁 建立時間` 徽章，讓使用者清楚知道預填日期的來源。
- **批次套用「取消」按鈕**：套用中可隨時中止，loading 覆蓋層新增取消按鈕，中止後顯示已完成數量。
- **套用進度顯示檔名**：載入中的狀態列新增目前正在處理的照片名稱（自動截短超過 20 字元）。
- **成功狀態綠色提示**：套用全部成功後，狀態列文字顯示綠色（使用既有的 `--success` CSS 變數）。
- **`:focus-visible` 鍵盤導航樣式**：為所有按鈕、滑竿、輸入框補充鍵盤 focus 外框，提升無障礙操作體驗。

### 修復 (Fixed)
- **`formatDate()` 使用正則表達式**：將所有 `.replace('字串', ...)` 改為 `.replace(/正則/g, ...)`，避免格式字串中有相同字元時發生意外的替換行為。
- **字型大小數字輸入框最大值不一致**：`fontSizeInput` 的 JS 驗證邏輯原本寫死為 `100`，與 HTML `max="20"` 不符，修正為 `20`，確保 slider 與數字框不會顯示不同步的值。
- **`filterImages()` 無副檔名邊界**：當 `filePath` 不含 `.` 時，`lastIndexOf` 回傳 `-1`，`slice(-1)` 會取最後一個字元而非副檔名，修正為提早返回 `false`。
- **`<aside>` 內的 `<main>` 語義錯誤**：將 `<main class="settings">` 改為 `<div class="settings">`，符合 HTML 規範（`main` 不可巢狀於 `aside`）。
- **`loadSettings()` 初始化觸發多餘重繪**：新增 `_isLoading` 旗標，在 `loadSettings()` 執行期間（`btn.click()` 和 `dispatchEvent` 會觸發事件監聽器）阻止 `triggerPreview()`，避免插件初始化時就預覽圖渲染 2-3 次。

### 變更 (Changed)
- `setStatus()` 改用 CSS class (`status-success` / `status-error`) 取代 inline `style.color` 設定，便於維護。

---

## [1.4.1] - 2026-02-22

### 修復 (Fixed)
- **`_startupItems` 快取未清除**：`refreshSelection()` 在使用 `onItemSelectionChanged` 快取後，未清除 `_startupItems`，導致後續手動點擊「重整」按鈕仍用舊快取而非重新呼叫 `eagle.item.getSelected()`。
- **取消全選時 UI 不更新**：`onItemSelectionChanged` 僅處理 `items.length > 0` 的情況，當使用者在 Eagle 中取消全選（空陣列）時，UI 不會更新為「無選取」狀態。
- **手動時間模式下切換預覽張數會覆蓋自訂日期**：按下「上一張 / 下一張」時，`autoFillDate()` 無條件執行，會覆蓋使用者在「統一自訂時間」模式中已輸入的日期。修正為在 `manual` 模式下跳過自動填入。
- **選取新照片時覆蓋手動日期**：`refreshSelection()` 觸發時，也會在 `manual` 模式下呼叫 `autoFillDate()` 覆蓋日期。同上加入模式判斷。
- **TIFF 格式誤列為支援格式**：Electron/Chromium 的 Canvas API 無法載入 TIFF 檔案，選取後會出現無法預覽與套用的錯誤。從 `SUPPORTED_EXT` 移除 `.tiff` / `.tif`，改為「略過 N 個」提示。

### 變更 (Changed)
- `manifest.json` 版本號從 `1.0.0` 同步更新為 `1.4.1`。

---

## [1.4.0] - 2026-02-22

### 修復 (Fixed)
- **關鍵修復**：`index.html` 中 `timestamp.js` 與 `settings.js` 的 `<script>` 標籤被意外全數註解掉，導致插件啟動後所有核心功能（Canvas 燒入、EXIF 讀取、設定面板）完全失效。
- **關鍵修復**：`filterImages()` 函式嘗試對 Eagle 4 `Item` Class 的唯讀 getter 屬性 `filePath` 進行寫入（`item.filePath = fp`），導致 `refreshSelection()` 整個崩潰並出現 `Cannot set property filePath of #<Item> which has only a getter` 錯誤，造成選取照片後 UI 一直顯示空白。
- **關鍵修復**：`eagle.item.addFromPath()` API 的呼叫方式錯誤（傳入物件 `{path, ...}`），修正為正確的雙參數格式 `addFromPath(path, options)`。
- **關鍵修復**：`addFromPath()` 的選項未傳入 `folders`，導致副本被加到 Eagle 圖庫根目錄而非原始照片所在資料夾。修正為傳入 `item.folders`。
- `onPluginCreate` 中未設定 `isPluginCreated = true`，導致「套用」按鈕按下後永遠無效。
- `Settings.init()` 從未在插件生命週期中呼叫，導致設定面板所有 UI 控制項（滑桿、按鈕、九宮格）無法互動。
- 套用完成後呼叫 `refreshSelection()` 會因 Eagle 在 `addFromPath` 後改變內部 selection 狀態，導致 UI 顯示的照片數量從 N 張錯誤縮減至 1 張。修正為套用完成後保留原選取狀態。
- `settings.js` 的 `_initTimeSourceToggle()` 未在初始化時根據預設 active 按鈕設定 `manualDateGroup` 的顯示狀態，導致「統一自訂時間」輸入框在預設選取「原始照片時間」時仍然可見。
- `index.html` 中 `header-text` 的 `<div>` 標籤未正確閉合。
- 還原 Gemini AI 代理引入的三處錯誤修改：`onPluginRun` 中干擾 UI 狀態欄的 `setStatus` 呼叫、不確定是否存在的 `eagle.item.get({ isSelected: true })` workaround、以及無意義的狀態訊息文字變更。
- 還原 EXIF 讀取功能（曾被暫時停用），現已正確透過 `TimestampEngine.readExifDate()` 自動讀取 JPEG 拍攝時間。

### 變更 (Changed)
- `onPluginRun` 與 `onPluginShow` 現在會自動觸發 `refreshSelection()`，插件開啟後無需手動點擊重整即可自動載入當前選取的照片。
- 移除 `filterImages()` 中的 debug `console.log`，Console 輸出更加乾淨。
- 套用成功後的狀態訊息更新為顯示實際建立的副本數量。

## [1.3.0] - 2026-02-21
### 新增 (Added)
- 實作無外部依賴的輕量化 EXIF 讀取器，現在能直接分析相片的 EXIF 原始拍攝時間並自動帶入為時間戳預設值。
- 介面全新升級為「左側設定面板 / 右側預覽畫布」的左右分割並排佈局。
- 預覽區塊底下新增「上一張 / 下一張」的多圖預覽切換控制列，能即時反映您在 Eagle 中選取的所有圖片以及套用效果。
- 導入 `localStorage` 機制，重新開啟外掛時會自動記憶您上次使用的文字大小、位置、顏色等參數設定。

### 修復 (Fixed)
- 修正了前版重構繪圖邏輯時，最終「套用」階段遺漏 Canvas 變數，導致套用失敗並觸發跳出開發者工具崩潰的問題。
- 修復了部分 CSS 排版衝突導致的版面異常問題。
- 強化了底層 `eagle.item.getSelected()` 等 API 操作的 `try-catch` 防護網，並加入了 `window.resizeTo` 強制聲明。藉此解決 Eagle 因快取視窗尺寸或未捕捉之底層 Promise 錯誤而強行打開 DevTools 的頑固問題。
- 加入 `eagle.contextMenu` 的存在檢查，防止某些版本的 Eagle 因缺少右鍵 API 而拋出 `TypeError: eagle.contextMenu.add is not a function` 導致 DevTools 彈出。
- 將日期格式的下拉選單介面文字，去除了特定日期範例，統一改用如 `YYYY/MM/DD` 之代碼以維持專業與視覺統一。

## [1.2.0] - 2026-02-21
### 新增 (Added)
- 導入了 **「相對比例動態縮放 (Relative Scaling)」** 機制，將 UI 的「字型大小」與「留白」完全轉換為相對於「照片短邊對角值」的百分比 (%)。這解決了固定像素大小 (px) 在網路低解析度素材與 4K 實地拍攝高解析照片上，因解析度差異而導致視覺比例劇烈失真的問題。
- 增加了 `YYYY/M/D` (例如 2026/1/16，單字元無補零) 與 `YYYY/MM/DD` (補零，無時分秒) 等貼近實證相片需求的格式選項，並將 `YYYY/M/D` 設為預設。
- 預設版型調整為「橘黃色字體 (#FF9900)」與「無背景 (透明度 0%)」，此預設值符合工程與實勘照片的主流印記風格。

### 變更 (Changed)
- 核心寫入機制從「直接取代原始檔案 (`item.replaceFile`)」修改為「**建立包含時間戳記的全新副本照片 (`eagle.item.addFromPath`)**」。
- 產生的新副本，除了檔名會附加 `(時間戳記)` 之外，更會在 Eagle 的「註解/筆記」欄位自動寫入：「**原始檔案：舊檔名**」，以利日後查核與比對。

### 修復 (Fixed)
- 解決了透過 Eagle 頂部快捷圖示點擊「載入插件」時，因 `plugin-create` 生命週期過早觸發 `eagle.onPluginRun` 拉取選取項目，從而導致出現 `This method can only be used after the plugin-create event is triggered` 崩潰問題。透過在全域事件包裹 `setTimeout` 完美防護。
- 加回右鍵「插入時間戳記...」的選單機制，提供雙向操作。
