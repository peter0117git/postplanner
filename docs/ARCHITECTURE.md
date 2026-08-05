# V8.2 架構說明

## 設計目標

1. 保留原有 `database.js`，避免資料搬移。
2. GitHub Pages 直接部署，不需要前端打包或框架。
3. 把外部服務與 UI 狀態分離，單一功能失敗時不拖垮整個頁面。
4. 手機維持「日視圖 + 預覽」，不顯示編輯器。
5. Canva 多頁解析在伺服器端完成，前端只接收已驗證的公開圖片網址。
6. 發布文案組合器只輸出純文字副本，不回寫貼文，避免使用者為了跨平台貼文而改動原始資料。
7. Canva 圖片工具以獨立工作視窗呈現，不占用常駐編輯側欄。

## 元件責任

### `index.html`

只包含頁面語意、表單與控制項。載入順序固定為：

1. `database.js`
2. `storage.js`
3. `github.js`
4. `canva.js`
5. `post-composer.js`
6. `zip.js`
7. `app.js`

所有服務使用 `defer`，因此不會阻塞 HTML 解析，且會依順序執行。

### `assets/js/app.js`

管理目前日期、選取貼文、日視圖、快速新增、文字編輯器、IG 預覽與簡報模式。它不直接實作 GitHub HTTP 細節，也不直接解析 Canva 頁面。

### `assets/js/services/storage.js`

封裝 IndexedDB 的開啟、讀取與寫入。`app.js` 保留 localStorage 後備策略，因此無痕模式或少數不支援 IndexedDB 的環境仍可使用。

### `assets/js/services/github.js`

封裝 GitHub Contents API：驗證 repo 格式、UTF-8 Base64 轉換、讀取大型 blob 與帶 SHA 的安全更新。資料格式解析與合併留在 `app.js`，便於維持舊版相容。

### `assets/js/services/canva.js`

封裝公開連結驗證、嵌入網址、Worker 呼叫、圖片 Blob 與檔名處理。它不保存貼文狀態。

### `assets/js/services/post-composer.js`

將結構化的【主題】、《書名》與編輯器純文字組成完整發布文案，避免重複首行，並統計頁碼、Hashtag、字數和行數。服務沒有畫面相依性，可直接用 Node 測試。

### `assets/js/services/zip.js`

以瀏覽器原生 API 建立不壓縮 ZIP。PNG 本身已壓縮，採用 ZIP Store 可避免外部套件與額外 CPU，並把多頁下載改成單一檔案。

### `canva-worker/src/index.js`

只接受 Canva HTTPS 網址，逐次驗證重新導向，限制 HTML 大小，並合併公開頁面的 `imageSets.preview.images` 與 `imageSets.thumbnail.images`。第 1 頁有高畫質預覽、其他頁只有縮圖時仍能完整辨識頁數。回應只包含 Canva 網域的圖片網址，避免成為任意網址代理。

## 資料流程

```text
使用者編輯
  → app.js 更新記憶體資料
  → storage.js 寫入 IndexedDB
  → GitHub 同步時讀取遠端 database.js
  → app.js 依 updatedAt 與 tombstones 合併
  → github.js 寫回 database.js
```

```text
Canva 公開連結
  → canva.js 呼叫 Cloudflare Worker
  → Worker 驗證並讀取 Canva 公開頁
  → 回傳每頁預覽圖片網址
  → canva.js 下載圖片
```

## 故障隔離

- IndexedDB 失敗：改用 localStorage。
- GitHub 連線失敗：保留本機資料，不覆蓋。
- GitHub 版本衝突：重新讀取一次、合併後重試。
- Worker 未設定：第 1 頁長網址仍可嘗試下載，多頁按鈕引導設定。
- Worker 或 Canva 解析失敗：顯示卡片內狀態與 Toast，不影響編輯和同步。
- 圖片自動下載被瀏覽器擋下：開啟圖片分頁，讓使用者手動儲存。
