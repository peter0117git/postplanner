# V8.4 效能優化版架構

## 設計目標

1. 保留 V8.3 的 `database.js` 與同步格式。
2. GitHub Pages 可直接部署，前端不需編譯或後端服務。
3. 手機維持日視圖與預覽，不提供編輯器。
4. 發布文案組合器只產生副本，不修改原始貼文。
5. Canva 使用官方嵌入檢視器，不解析或下載圖片。

## 元件責任

- `index.html`：頁面骨架與操作控制項。
- `assets/js/app.js`：貼文狀態、編輯器、視圖、預覽與視窗控制。
- `assets/js/services/storage.js`：IndexedDB 與本機儲存。
- `assets/js/services/github.js`：GitHub Contents API。
- `assets/js/services/canva.js`：Canva 網址驗證與官方 embed 網址建立。
- `assets/js/services/post-composer.js`：組合與檢查完整發布文案。
- `assets/js/services/performance.js`：公開資料指紋與主題／書名索引。

## 資料流程

```text
使用者編輯
  → app.js 更新記憶體資料
  → storage.js 寫入 IndexedDB
  → GitHub 同步時讀取遠端 database.js
  → 合併後由 github.js 寫回
```

```text
網站啟動
  → 讀取 IndexedDB 本機資料
  → 以 ETag 重新驗證公開 database.js
  → 未變更：直接使用本機資料，不解析、不合併、不寫入
  → 已變更：解析並合併公開資料與本機資料（時間相同時以公開版本為準）
  → 公開資料無法取得且有 Token 時，才以 GitHub Contents API 備援
```

```text
使用者連續輸入
  → 立即更新記憶體資料
  → 預覽與日視圖分別延遲局部更新
  → 停止輸入 550ms 後合併為一次 IndexedDB 寫入
```

```text
Canva 完整 /design/.../view 分享網址
  → canva.js 驗證 canva.com 與網址結構
  → 建立 canonical /view?embed 網址
  → app.js 以 iframe 載入 Canva 官方檢視器
  → 翻頁、縮放與全螢幕由 Canva 處理
```

## 故障隔離

- IndexedDB 失敗：改用 localStorage。
- GitHub 連線失敗：保留本機資料。
- 公開 `database.js` 暫時無法讀取：顯示提示並保留本機資料。
- GitHub 版本衝突：重新讀取、合併後重試。
- Canva 短網址：提示改貼完整分享連結，其他功能不受影響。
- Canva 官方頁面無法載入：仍可用「在 Canva 開啟」前往原稿。
