# 排版桌 IG Post Planner V8.3.3（Canva 官方嵌入版）

這是一個不需要前端建置工具、可直接部署到 GitHub Pages 的貼文規劃器。此版本保留 V8.3 的資料格式、GitHub 同步、發布文案、可搜尋主題／書名、桌面編輯與手機預覽。

Canva 預覽改用官方 `?embed` 檢視器。專案不包含圖片擷取、下載、Cloudflare Worker、Canva API、OAuth、Puppeteer 或 Browser binding。

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
└── docs/
    ├── ARCHITECTURE.md
    └── TESTING.md
```

## 更新現有 GitHub Pages

1. 先在目前網站的「☁ 同步」視窗匯出資料備份。
2. 保留 repo 現有的 `database.js`。
3. 上傳本專案的 `index.html`、`assets/`、`docs/`、`test/`、`README.md`、`VERSION.txt` 與 `.gitignore`。
4. 不要用 `database.example.js` 覆蓋現有的 `database.js`。
5. GitHub Pages 若已設定為 `main / root`，上傳後強制重新整理頁面即可。

新 repo 才需要把 `database.example.js` 複製成 `database.js`。

## Canva 使用方式

1. 在 Canva 將分享權限設為「知道連結的任何人可查看」。
2. 複製完整分享網址，例如 `https://www.canva.com/design/.../.../view?...`。
3. 貼到排版桌的 Canva 欄位。
4. 左側會載入 Canva 官方內嵌檢視器；翻頁、縮放與全螢幕由 Canva 提供。

`https://canva.link/...` 短網址無法由純前端安全地展開，因此不直接嵌入。遇到短網址時，請改貼 Canva 的完整 `/design/.../view` 分享網址。

## 資料與安全

- GitHub Token 與 repo 名稱只儲存在目前瀏覽器。
- Token 建議使用 Fine-grained Token，僅授權該 repo 的 **Contents: Read and write**。
- 本機資料主要存於 IndexedDB；若不可用才退回 localStorage。
- GitHub 同步會合併本機與遠端資料，並保留刪除紀錄避免舊資料復活。
- Canva iframe 只接受 `canva.com` 的有效設計分享網址。

## 本機預覽與測試

```bash
python3 -m http.server 8080
```

開啟 `http://localhost:8080/`。自動測試可執行：

```bash
node --test test/*.test.js
```
