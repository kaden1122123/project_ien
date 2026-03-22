# i-En (小艾) — 自動化 Instagram Agent

一個運行在 Node.js 上的 AI Instagram 自動化系統。以「被遺棄的手機」視角觀察台灣街頭，生成諷刺性圖文並自動發布至 Instagram。

---

## 系統架構

```
src/
├── main.js         進入點，5-stage pipeline
├── brain.js        AI 內容生成（MiniMax via Anthropic API）
├── vision.js       圖片生成（MiniMax image-01）
├── publisher.js    Instagram Graph API 發布
├── uploader.js     Cloudflare R2 圖床上傳
├── storage.js      FIFO 滑動視窗記憶體
├── config.js       環境變數載入器
└── logger.js      雙輸出日誌（stdout + 檔案）
```

## 5-Stage Pipeline

```
[1/5] Brain   → 生成今日觀察主題 + flux_prompt + IG caption
[2/5] Vision  → 生成圖片（base64）
[3/5] R2      → 上傳至 Cloudflare R2
[4/5] IG      → 發布至 Instagram Graph API
[5/5] Memory  → 寫入 FIFO 滑動視窗記憶體
```

## 環境變數

複製 `.env` 並填入以下項目：

```bash
MINIMAX_API_KEY=          # MiniMax API Key
META_INSTAGRAM_API_KEY=   # Meta Instagram User Access Token
IG_USER_ID=               # Instagram Business/User ID
MEMORY_LIMIT=5            # 滑動視窗長度
DATA_DIR=                 # memory.json 路徑
R2_ACCOUNT_ID=            # Cloudflare R2 Account ID
R2_ACCESS_KEY_ID=         # R2 Access Key
R2_SECRET_ACCESS_KEY=     # R2 Secret Key
R2_BUCKET_NAME=           # R2 Bucket 名稱
R2_PUBLIC_URL=            # R2 公開 URL
```

## 安裝

```bash
npm install
```

## 執行

```bash
node src/main.js
```

## 季節人格切換

```bash
# 手動切換
node promptInjector.js --season="梅雨季"
node promptInjector.js --season="颱風季"
node promptInjector.js --season="夏季酷暑"

# 可用季節
梅雨季 | 颱風季 | 夏季酷暑 | 秋季 | 冬季濕冷 | 跨年煙火 | 春節 | 春季 | 普通
```

自動切換：每月 1 日 00:05 Asia/Taipei 由 cron job 執行 `autoPromptSelector.js`。

## 監控

`monitor.js` 每 2 小時執行一次，偵測：
- `[致命錯誤]` 日誌
- Instagram Token 過期（Error Code 190）
- memory.json 檔案異常

發現問題時發送 Email 通知。

## 架構備註

- 使用 ES Module（`type: "module"`）
- dotenv v17 使用 `result.parsed` 而非 `process.env`
- MiniMax 透過 `api.minimax.io/anthropic`（Anthropic 相容端點）
- MiniMax image-01 的 base64 欄位為 `data.data.image_base64[0]`
- Anthropic 回傳格式含 `thinking` block，需用 `filter(block => block.type === 'text')` 取文字
