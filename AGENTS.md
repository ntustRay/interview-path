# Interview Path

## 題庫與資料

- `src/questions.ts` 維護題庫。題目 ID 要唯一且穩定，選項 ID 亦須保留既有紀錄的對應。
- `src/study.ts` 負責 localStorage、備份格式與合併策略。變更資料時，測試舊備份、兩端互補欄位、實際衝突及失敗的匯入。
- `src/views.ts` 處理畫面輸出，`src/main.ts` 接操作。輸出筆記、作答等使用者文字時，沿用既有 HTML 跳脫方式。

## 開發與驗證

- 使用 Bun。跑 `bun run dev` 預覽，並執行 `bun test` 與 `bun run build`。
- 畫面有改動時，在桌機及手機檢查篩題、筆記、作答和備份合併。Pages 使用 `dist/` 靜態輸出。[開發方式](README.md#開發)
