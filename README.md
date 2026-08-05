# 排版桌 IG Post Planner V8.1

這是一個不需要建置工具、可直接部署到 GitHub Pages 的貼文規劃器。V8.1 保留原本的 `database.js` 資料格式，並將前端拆成畫面層、瀏覽器儲存、GitHub 同步與 Canva 圖片服務，方便後續維護。

## 目錄

```text
.
├── index.html                       # 頁面骨架
├── database.js                     # 你的貼文資料（現有 repo 已有，不要用範例覆蓋）
├── database.example.js             # 新專案才使用的空白範例
├── assets/
│   ├── css/app.css                 # 完整 UI 與響應式樣式
│   └── js/
│       ├── app.js                  # 畫面、貼文與編輯器控制
│       └── services/
│           ├── storage.js          # IndexedDB 與本機儲存
│           ├── github.js           # GitHub Contents API
│           ├── canva.js            # Canva 前端解析與下載
│           └── zip.js              # 將全部頁面打包成單一 ZIP
├── canva-worker/
│   ├── src/index.js                # Canva 多頁預覽解析器
│   ├── test/parser.test.js         # 解析器測試
│   ├── package.json
│   └── wrangler.jsonc
└── docs/
    ├── ARCHITECTURE.md
    └── TESTING.md
```

## 更新現有 GitHub Pages

1. 先在目前網站的「☁ 同步」視窗按「匯出備份」。
2. 保留 repo 裡現有的 `database.js`。
3. 將本專案的 `index.html`、`assets/`、`canva-worker/`、`docs/`、`README.md`、`.gitignore` 上傳到 repo 根目錄。
4. 不要用 `database.example.js` 覆蓋現有的 `database.js`。
5. GitHub Pages 若已設定為 `main / root`，通常不需改設定；部署完成後強制重新整理一次。

新 repo 才需要把 `database.example.js` 複製成 `database.js`。

## 啟用 Canva 多頁下載

前端純 HTML 受到瀏覽器跨網域規則限制，無法直接讀取 Canva 頁面中第 2 頁以後的圖片網址。`canva-worker/` 是一個只讀取公開 Canva 預覽資料的小型 Cloudflare Worker，不需要 Canva API 或 OAuth。

### 最簡單：Cloudflare 網頁介面

1. 登入 Cloudflare，進入 **Workers & Pages**。
2. 建立一個 Worker。
3. 將 `canva-worker/src/index.js` 的內容貼到 Worker 編輯器並部署。
4. 複製產生的 `https://...workers.dev` 網址。
5. 回到排版桌，展開「多頁下載服務設定」，貼上網址並儲存。
6. 點「解析全部頁面」，即可逐頁下載或下載全部頁面。

### 使用命令列

```bash
cd canva-worker
npm install
npm test
npm run deploy
```

Cloudflare 官方目前建議使用[專案內安裝的 Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)，`npm run deploy` 會部署到 `*.workers.dev`。若要限制只有你的 GitHub Pages 可呼叫，請將 `wrangler.jsonc` 中的 `ALLOWED_ORIGIN` 從 `*` 改成網站完整來源，例如：

```json
"ALLOWED_ORIGIN": "https://你的帳號.github.io"
```

## Canva 注意事項

- 分享權限請使用「知道連結的任何人可查看」，不要使用「可編輯」。
- 多頁功能下載的是 Canva 公開預覽圖，通常最長邊約 1024px。
- Canva 部分分享頁只提供第 1 頁高畫質公開預覽；這時其他頁面會使用 Canva 公開的 447px 縮圖補齊，介面會明確標示。
- 短網址與被 Canva 禁止 iframe 的分享頁，左側會改用 Worker 解析出的圖片輪播，不再直接嵌入 Canva 編輯頁。
- 要取得印刷或原始解析度，仍需按「Canva 原圖」到 Canva 官方下載。
- 多頁解析依賴 Canva 公開頁面的資料結構；若 Canva 未來調整頁面格式，只需更新 `canva-worker/src/index.js`，不用重寫整個前端。
- 「下載全部頁面」會在瀏覽器內打包成單一 ZIP，只觸發一次下載。

## 資料與安全

- GitHub Token、repo 名稱與 Worker 網址只儲存在目前瀏覽器。
- Token 建議使用 Fine-grained Token，僅授權該 repo 的 **Contents: Read and write**。
- 本機資料主要存於 IndexedDB；若不可用才退回 localStorage。
- GitHub 同步會先合併本機與遠端資料，再寫回 `database.js`，並保留刪除紀錄避免舊資料復活。
- 上線前及大量修改前，請先匯出 JSON 備份。

## 本機預覽

請用本機 HTTP 伺服器開啟，避免 `file://` 對外部資源的限制：

```bash
python3 -m http.server 8080
```

然後開啟 `http://localhost:8080/`。

部署指令依據 [Cloudflare Workers 官方快速入門](https://developers.cloudflare.com/workers/get-started/guide/)：`npx wrangler dev` 可本機預覽，`npx wrangler deploy` 可部署。GitHub Pages 可在 Settings → Pages 選擇 branch 與 `/(root)`，詳見 [GitHub 官方發布來源說明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
