# 排版桌 IG Post Planner V8.3（Canva 純預覽版）

這是一個不需要前端建置工具、可直接部署到 GitHub Pages 的貼文規劃器。此版本保留 V8.3 的資料格式、GitHub 同步、發布文案、可搜尋主題／書名、桌面編輯與手機預覽，Canva 部分只負責顯示公開連結。

Canva 工具不包含圖片擷取、ZIP、高清處理或雲端瀏覽器。長網址可直接嵌入；短網址與多頁公開預覽可透過附帶的輕量 Cloudflare Worker 解析。

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

部署後，把 `*.workers.dev` 網址貼進 Canva 預覽工具的「進階設定：短網址預覽服務」。原本已部署的 Worker 仍可供此版使用；若希望雲端端也完全精簡，可用這個資料夾重新部署同名 Worker，網址通常不變。

若要限制只有你的 GitHub Pages 可呼叫，請把 `wrangler.jsonc` 的 `ALLOWED_ORIGIN` 改成網站來源，例如：

```json
"ALLOWED_ORIGIN": "https://你的帳號.github.io"
```

## Canva 注意事項

- 分享權限請使用「知道連結的任何人可查看」。
- 公開頁面可能只提供第 1 頁較大的預覽，其餘頁面會使用 Canva 公開縮圖。
- 短網址解析完成後，左側使用圖片輪播；長網址在可嵌入時使用 Canva iframe。
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
