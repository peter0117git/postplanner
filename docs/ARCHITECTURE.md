# V8.3 純預覽版架構

## 設計目標

1. 保留 V8.3 的 `database.js` 與同步格式。
2. GitHub Pages 可直接部署，前端不需編譯。
3. 手機維持日視圖與預覽，不提供編輯器。
4. 發布文案組合器只產生副本，不修改原始貼文。
5. Canva 工具只顯示公開預覽，不處理圖片檔案。
6. 短網址與多頁解析由可選的輕量 Worker 完成。

## 元件責任

- `index.html`：頁面骨架與操作控制項。
- `assets/js/app.js`：貼文狀態、編輯器、視圖、預覽與視窗控制。
- `assets/js/services/storage.js`：IndexedDB 與本機儲存。
- `assets/js/services/github.js`：GitHub Contents API。
- `assets/js/services/canva.js`：Canva 網址驗證、嵌入網址與預覽服務呼叫。
- `assets/js/services/post-composer.js`：組合與檢查完整發布文案。
- `canva-worker/src/index.js`：驗證 Canva 網址，解析公開頁面的 preview／thumbnail 資料。

## 資料流程

```text
使用者編輯
  → app.js 更新記憶體資料
  → storage.js 寫入 IndexedDB
  → GitHub 同步時讀取遠端 database.js
  → 合併後由 github.js 寫回
```

```text
Canva 長網址
  → 可嵌入時直接顯示 iframe

Canva 短網址／多頁預覽
  → canva.js 呼叫 Worker /preview
  → Worker 驗證重新導向與公開頁面
  → 回傳 Canva 網域的公開預覽網址
  → 左側預覽與工具視窗顯示輪播／縮圖
```

## 故障隔離

- IndexedDB 失敗：改用 localStorage。
- GitHub 連線失敗：保留本機資料。
- GitHub 版本衝突：重新讀取、合併後重試。
- Worker 未設定：長網址仍可嘗試 iframe；短網址提示設定預覽服務。
- Worker 或 Canva 解析失敗：只顯示狀態與提示，不影響編輯或同步。
