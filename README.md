# 排版桌 IG Post Planner V8.4.3（真實雙平台預覽版）

這是一個不需要前端建置工具、可直接部署到 GitHub Pages 的貼文規劃器。此版本保留 V8.3 的資料格式、GitHub 同步、發布文案、可搜尋主題／書名、桌面編輯與手機預覽。

Canva 預覽改用官方 `?embed` 檢視器。專案不包含圖片擷取、下載、Cloudflare Worker、Canva API、OAuth、Puppeteer 或 Browser binding。

V8.4 保留原本的畫面與操作方式，重整資料啟動、合併、儲存與畫面更新流程。網站仍會在一般瀏覽器模式確認最新公開 `database.js`；內容沒有更新時，不再重新解析、合併或寫入整份資料庫。僅查看資料的同事不需要 GitHub Token，也不需要使用無痕模式。

## V8.4.1 老闆預覽

一般操作頁右上角新增「👁 老闆預覽」。點擊後會以新分頁開啟目前日期與貼文的唯讀網址：

```text
https://你的排版桌網址/?preview=boss&date=2026-08-27&post=貼文ID
```

- 隱藏新增、編輯、刪除、同步、Token、發布文案與 Canva 工具。
- 保留日期切換、貼文清單、上一則／下一則及公開 Canva 預覽。
- 網址會跟著目前日期與貼文更新，可直接複製分享。
- Instagram 與 Facebook 同時呈現，使用紫紅／橘與藍色區塊明確區分。
- Instagram 顯示完整輪播；Facebook 一般貼文固定第一張字卡。
- 主題為「圖文時間」時，Facebook 才顯示完整圖組。
- 窄螢幕與手機會自動改成上下排列，不需要切換平台。

## V8.4.2 Facebook 純淨預覽

- Facebook 一般貼文的 Canva iframe 會向上下延伸並置中裁切。
- Canva 底部的進度列、翻頁、縮放與全螢幕控制會落在可視區域之外。
- 字卡仍維持原比例並置中呈現，不直接用遮罩蓋住圖片底部。
- 主題為「圖文時間」時不裁切控制列，保留完整圖組的翻頁操作。

## V8.4.3 真實社群比例

- 老闆預覽不再隨視窗無限放大：Instagram 區塊固定約 420px，Facebook 區塊固定約 500px。
- Facebook 長文預設只顯示前段並提供「顯示更多」，圖片會直接出現在首屏可視範圍。
- 一般 Facebook 貼文維持單張首圖，主題為「圖文時間」時改用 2×2 四圖排列。
- Facebook 圖片維持唯讀，Canva 的進度、翻頁、縮放與全螢幕操作列不會顯示。
- 小螢幕仍會自動改成上下排列，卡片寬度不超出裝置。

## V8.4 效能調整

- 移除 HTML 對 `database.js` 的重複載入，啟動時只重新驗證一次公開資料。
- 以 ETag 與內容指紋辨識未變更資料；未更新時不解析、不合併、不寫入 IndexedDB。
- 公開資料正常時，不再因本機存在 GitHub Token 而重複下載同一份內容。
- 多次文字輸入合併為一次存檔，停止輸入 550ms 後才寫入。
- IndexedDB 直接使用 structured clone，不再先以 JSON 複製整座資料庫。
- 切換貼文只更新選取狀態，不重建整個日視圖。
- 主題與書名選單改為單次索引並快取，不再於每次切換貼文時掃描全部歷史內文。
- 啟動階段移除重複 migration、存檔與日視圖渲染。

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
│           ├── post-composer.js
│           └── performance.js
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
5. GitHub Pages 若已設定為 `main / root`，上傳後第一次按 `Ctrl + F5`；之後一般開啟即可。

新 repo 才需要把 `database.example.js` 複製成 `database.js`。

## Canva 使用方式

1. 在 Canva 將分享權限設為「知道連結的任何人可查看」。
2. 複製完整分享網址，例如 `https://www.canva.com/design/.../.../view?...`。
3. 貼到排版桌的 Canva 欄位。
4. 預覽區會同時呈現 Instagram 與 Facebook；Instagram 可完整翻頁，Facebook 一般貼文顯示首圖，「圖文時間」顯示四圖排列。

`https://canva.link/...` 短網址無法由純前端安全地展開，因此不直接嵌入。遇到短網址時，請改貼 Canva 的完整 `/design/.../view` 分享網址。

## 資料與安全

- GitHub Token 與 repo 名稱只儲存在目前瀏覽器。
- 未設定 Token 的裝置仍會在每次啟動時讀取最新公開資料；Token 只用於同步寫回 GitHub。
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

測試包含 4,000 則模擬貼文、雙平台規則與老闆唯讀模式。
