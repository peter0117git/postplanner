# Browser Run 部署與使用

## 部署新版 Worker

Browser Run 需要 Cloudflare 的 `BROWSER` binding 與 `@cloudflare/puppeteer`，因此必須部署整個 `canva-worker/` 專案，不能只在網頁編輯器貼上單一 JavaScript 檔。

```bash
cd canva-worker
npm install
npx wrangler login
npm test
npm run deploy
```

`wrangler.jsonc` 已經設定：

- `browser.binding = "BROWSER"`
- `compatibility_flags = ["nodejs_compat"]`
- `compatibility_date = "2026-08-05"`

部署完成後，開啟以下網址檢查：

```text
https://你的-worker.workers.dev/health
```

正確結果應包含：

```json
{"ok":true,"service":"canva-preview","version":"1.1.0","browserRun":true}
```

回到排版桌的 Canva 圖片工具，把 Worker 網址儲存在「進階設定：多頁與 Browser Run 服務」。

## 兩種解析方式

- 「解析頁面」：只解析 Canva 公開 HTML，速度快，不啟動瀏覽器。
- 「抓取並下載高清」：按下時才啟動 Browser Run、逐頁切換、挑選每頁最大公開預覽，接著自動打包 ZIP。

高清按鈕不會在開啟貼文、輸入網址或一般預覽時自動執行。一次成功後，再按一般「下載全部頁面」會沿用目前已取得的頁面，不會再次啟動 Browser Run。

## 常見訊息

- `BROWSER_NOT_CONFIGURED`：目前仍是舊版 Worker，或部署設定沒有 `BROWSER` binding。
- HTTP 429：Cloudflare 瀏覽器啟動頻率、同時執行數或每日額度已達限制，稍後再試。
- 沒有取得較高畫質頁面：Canva 公開檢視器沒有載入 900px 以上或顯著大於縮圖的版本；請確認分享權限允許未登入訪客查看。
- 只有部分頁面較清晰：ZIP 仍會包含全部可取得頁面，介面會明確列出 Browser Run 頁數與一般預覽頁數。

此功能只讀取任何人可查看的公開連結，不登入 Canva，也不能繞過驗證碼、存取限制或私人設計。Cloudflare 最新額度請查閱 [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/) 與 [pricing](https://developers.cloudflare.com/browser-run/pricing/)。
