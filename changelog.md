# Eagle Timestamp Plugin - 變更日誌 (Changelog)

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
