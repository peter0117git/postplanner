# 排版桌 IG Post Planner V8.3（Canva 純預覽版）

這是一個不需要前端建置工具、可直接部署到 GitHub Pages 的貼文規劃器。此版本保留 V8.3 的資料格式、GitHub 同步、發布文案、可搜尋主題／書名、桌面編輯與手機預覽，Canva 部分只負責顯示公開連結。

Canva 工具不包含圖片擷取、ZIP、高清處理、雲端瀏覽器或可操作 iframe。所有長短網址都透過輕量 Cloudflare Worker 讀取公開預覽，左側統一顯示乾淨的靜態輪播。

V8.3.2 內含 Worker V1.2.1，可同時解析 Canva 舊版 `imageSets` 與新版 `images/document-image` 公開頁面資料；第一頁會優先使用公開頁面的較清晰 `og:image`。

## 目錄

```text
.
├── index.html
├── database.example.js
├── assets/
│   ├── css/app.css
│   └── js/
│       ├── app.js
│       └── services/
│           ├── storage.js
│           ├── github.js
│           ├── canva.js
│           └── post-composer.js
├── test/
├── canva-worker/
│   ├── src/index.js
│   ├── test/parser.test.js
│   ├── package.json
│   ├── package-lock.json
│   └── wrangler.jsonc
└── docs/
    ├── ARCHITECTURE.md
    └── TESTING.md
```

## 更新現有 GitHub Pages

1. 先在目前網站的「☁ 同步」視窗匯出資料備份。
2. 保留 repo 現有的 `database.js`。
3. 上傳本專案的 `index.html`、`assets/`、`canva-worker/`、`docs/`、`README.md`、`VERSION.txt` 與 `.gitignore`。
4. 不要用 `database.example.js` 覆蓋現有的 `database.js`。
5. GitHub Pages 若已設定為 `main / root`，上傳後強制重新整理頁面即可。

新 repo 才需要把 `database.example.js` 複製成 `database.js`。

## Canva 預覽服務

前端純 HTML 受到跨網域規則限制，無法自行讀取 Canva 短網址與多頁資料。`canva-worker/` 是只讀取公開 Canva 預覽資料的小型 Cloudflare Worker，不需要 Canva API、OAuth 或 Browser binding。

```bash
cd canva-worker
npm install
npx wrangler login
npm test
npm run deploy
```

若這台電腦先前已完成 `wrangler login`，本次更新只需在新版 `canva-worker` 資料夾執行：

```bash
npm install
npm run deploy
```

部署後開啟 `https://ig-planner-canva-preview.p0118tw.workers.dev/health`，看到 `"version":"1.2.1"` 即代表新版已生效。Worker 名稱未變，因此正式網址不需要重新填入排版桌。

此版已內建目前的公開預覽服務網址，新裝置開啟即可使用。部署自己的 Worker 後，也能在 Canva 預覽工具的「進階設定：公開輪播服務」更換網址。原本已部署的 Worker 仍可供此版使用。

若要限制只有你的 GitHub Pages 可呼叫，請把 `wrangler.jsonc` 的 `ALLOWED_ORIGIN` 改成網站來源，例如：

```json
"ALLOWED_ORIGIN": "https://你的帳號.github.io"
```

## Canva 注意事項

- 分享權限請使用「知道連結的任何人可查看」。
- 公開頁面可能只提供第 1 頁較大的預覽，其餘頁面會使用 Canva 公開縮圖。
- 長網址與 `canva.link` 短網址都使用相同的靜態輪播，不載入 Canva 內建操作介面。
- 輪播支援畫面左右按鈕、鍵盤方向鍵，以及手機左右滑動。
- 右上角「↗ Canva」只負責在新分頁開啟公開原稿。
- 若 Canva 未來調整公開頁面格式，只需更新 `canva-worker/src/index.js`。

## 資料與安全

- GitHub Token、repo 名稱與 Worker 網址只儲存在目前瀏覽器。
- Token 建議使用 Fine-grained Token，僅授權該 repo 的 **Contents: Read and write**。
- 本機資料主要存於 IndexedDB；若不可用才退回 localStorage。
- GitHub 同步會合併本機與遠端資料，並保留刪除紀錄避免舊資料復活。

## 本機預覽

```bash
python3 -m http.server 8080
```

然後開啟 `http://localhost:8080/`。
