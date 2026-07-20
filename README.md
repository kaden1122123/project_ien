# i-En (小艾) — 自動化 Instagram Agent

一個運行在 Node.js 上的 AI Instagram 自動化系統。以「被遺棄的手機」視角觀察台灣街頭，
生成諷刺性圖文並自動發布至 Instagram `@ien_vision`。

**Last update：** 2026-07-21（8 commits drift cleanup：A→G）

---

## 系統架構

```
src/
├── main.js             進入點，7-stage pipeline
├── brain.js            AI 內容生成（MiniMax via Anthropic API，529 重試）
├── vision.js           圖片生成（MiniMax image-01）
├── publisher.js        IG Graph API 發布（指數退避輪詢，最多 10 分鐘）
├── uploader.js         薄包裝 delegate 到 r2Upload.js
├── r2Upload.js         R2 + GitHub dual upload 主邏輯
├── githubUpload.js     GitHub Git Data API helpers
├── storage.js          SQLite 記憶體 + JSON fallback
├── logger.js           文字 log + SQLite log
├── config.js           環境變數載入器
├── config_backup.js    Token fallback 支援
├── health_check.js     主動健康檢查（token / API 版本 / 24h FATAL）
├── db.js               SQLite 模組（memory / logs / runs）
├── newsFetcher.js      新聞爬蟲
└── outputArchiver.js   輸出存檔
```

## 7-Stage Pipeline

```
[0/5]  News      → 抓取今日財經新聞
[0.5/5] Article   → 抓完整文章內容
[1/5]  Brain     → 生成主題 + flux_prompt + IG caption
[2/5]  Vision    → 生成圖片（base64）
[3/5]  R2        → 上傳至 Cloudflare R2 + GitHub CDN
[4/5]  IG        → 發布至 Instagram Graph API（指數退避輪詢）
[5/5]  Archive   → 寫入 output/ 存檔
[6/5]  Memory    → 寫入 SQLite 滑動視窗（也寫 JSON fallback）
[7/5]  Record    → 寫入 SQLite runs 表（status / postId / errorMsg）
```

---

## 環境變數

`.env` 統一放在 `~/.openclaw/.env`（跟 config.js 路徑一致），需要：

```bash
# ── MiniMax（Brain + Vision）──
MINIMAX_API_KEY=                # MiniMax API Key

# ── Meta Instagram（Publisher）──
META_INSTAGRAM_API_KEY=         # Long-lived IG User Access Token（60 天）
IG_USER_ID=                     # Instagram Business Account ID
# 可選：META_INSTAGRAM_API_KEY_BACKUP=  # 備用 token（fallback）

# ── Cloudflare R2 + GitHub CDN（Uploader）──
R2_ACCOUNT_ID=                  # Cloudflare R2 Account ID
R2_ACCESS_KEY_ID=               # R2 Access Key
R2_SECRET_ACCESS_KEY=           # R2 Secret Key
R2_BUCKET_NAME=                 # R2 Bucket 名稱
R2_PUBLIC_URL=                  # R2 公開 URL

# ── Slack → Discord Alert（GMAIL_APP_PASSWORD 用於 monitor.js）──
GMAIL_APP_PASSWORD=             # Gmail App Password（19 字元，**繞過 OAuth**）
GOG_ACCOUNT=                    # Gmail 帳號（kaden1122123@gmail.com）
GOOGLE_EMAIL=                   # 同上
GOOGLE_PASSWORD=                # Google 帳號密碼（gog CLI 用）

# ── i-En 內部 ──
MEMORY_LIMIT=5                  # 滑動視窗長度
DATA_DIR=                       # memory.json 路徑（已 gitignore）
```

---

## 安裝

### 1. 系統需求

```bash
# Node.js 22+
node --version

# sqlite3 CLI（db.js 透過它執行 SQL）
sqlite3 --version    # 應該看到 3.x

# 如果沒裝：sudo apt install sqlite3
```

### 2. 專案依賴

```bash
cd /home/clawuser/openclaw-workspace/others/project_ien
npm install
```

### 3. 設定 `.env`

從現有環境複製或創建 `~/.openclaw/.env` 並填入上面的變數。

### 4. 驗證 setup

```bash
# 跑 SQLite 測試（19 套）
npm test

# 跑健康檢查（會印 token/API/logs 狀態）
node --input-type=module -e "import('./src/health_check.js').then(m => m.healthCheck()).then(r => console.log(JSON.stringify(r, null, 2)))"
```

---

## 執行

### 手動跑完整 pipeline

```bash
node src/main.js
```

### 跑監控

```bash
node monitor.js
# 健康時：✅ Token OK / API v21.0 OK / 無 FATAL log（直接 return，零通知）
# 有問題時：寄 Email + 印到 stdout
```

### 季節人格切換

```bash
node promptInjector.js --season="梅雨季"
node promptInjector.js --season="颱風季"
node promptInjector.js --season="夏季酷暑"

# 可用季節
梅雨季 | 颱風季 | 夏季酷暑 | 秋季 | 冬季濕冷 | 跨年煙火 | 春節 | 春季 | 普通
```

自動切換：每月 1 日 00:05 Asia/Taipei 由 cron job 執行 `autoPromptSelector.js`。

---

## Cron 排程

i-En 同時有兩套 cron 管理：

### A. OpenClaw cron（推薦）

- Job ID `27d05048`：每 4 小時跑 `main.js` + `monitor.js`
  - 失敗會推播到 Discord channel `1485058398486532167`（#project-ien）
- Job ID `dabbab38`：每週一 09:00 Asia/Taipei 跑 `scripts/weekly-health-check.js`
  - 一切正常 → 靜默不通知
  - 有問題（Token expired / API deprecated / 新 FATAL）→ 推 Discord `#project-ien`
  - 驗證 IG token TTL（debug_token），< 14 天才警告
  - **2026-07 後 Meta 新政策：long-lived token expires_at=0（永久），不再需要 60 天 refresh**

### B. 系統 crontab（備用，尚未套用）

```bash
# 套用方式（看 cron/README.md）
crontab cron/active_crons
```

`cron/active_crons` 內容：
- 每 4 小時：`ien_cron_runner.sh`（跑完整 pipeline）
- 每 1 小時：`ien_light_monitor.sh`（健康檢查）

### C. 直接 Discord 回報（測試用）

```bash
bash cron_reporter.sh
# 跑 main.js + monitor.js → curl POST 到 Discord
```

---

## Monitor 警報機制

i-En 用 `.last_alert_ts` 檔案防止「重複寄信」：

- `monitor.js` 讀 `.last_alert_ts`（毫秒 timestamp）
- 只寄「時間戳 > `.last_alert_ts`」的新 FATAL（過往的當作已通知）
- 寄信成功或失敗後都會更新 `.last_alert_ts`（避免 retry spam）

**設計意涵**：
- 4-7 月累積的 5 筆歷史 FATAL → timestamp 都早於 `.last_alert_ts` → 不會被重複警告
- 未來新 FATAL → timestamp > 現在 → 會被警告
- `scripts/weekly-health-check.js` 沿用同一個 filter → 週報也不會警告歷史 FATAL

**手動重置**（如果你想重新收到所有 FATAL）：

```bash
# 把 .last_alert_ts 改成 0（讓所有 FATAL 都當作新）
echo 0 > .last_alert_ts
node monitor.js   # 下次 cron 跑前可手動測試
```

---

## 測試

### SQLite 完整測試（19 套）

```bash
npm test
# = node test-db.js

# 涵蓋：
# - 環境檢查（sqlite3 CLI、DB 檔案存在）
# - Schema 檢查（memory/logs/runs 三表 + 4 索引）
# - memory 模組（滑動視窗 FIFO）
# - logs 模組（4 等級 × 10 筆）
# - runs 模組（成功 + 失敗記錄）
# - 交織寫入測試
```

### 監控測試

```bash
node monitor.js
```

---

## 故障排除

### IG 發文失敗 code 190

```
[IG API 錯誤] Invalid OAuth access token - Cannot parse access token
```

**原因**：Long-lived token 過期（60 天）或撤銷。

**解法**：
1. 去 <https://developers.facebook.com/tools/explorer/>
2. 選 iEn_auto_claw App → User Token → 勾選權限 → Generate Long-Lived Token
3. 把新 token 貼到 `~/.openclaw/.env` 的 `META_INSTAGRAM_API_KEY`
4. 或用 API refresh：
   ```bash
   curl -X GET "https://graph.facebook.com/v21.0/oauth/access_token" \
     --data-urlencode "grant_type=fb_exchange_token" \
     --data-urlencode "client_id=${IEN_CLIENT_ID}" \
     --data-urlencode "client_secret=${IEN_CLIENT_SECRET}" \
     --data-urlencode "fb_exchange_token=${CURRENT_TOKEN}"
   ```

### Gmail OAuth 過期（monitor.js 寄信失敗）

**症狀**：`oauth2: "invalid_grant"` 或 monitor.js 顯示 ✅ 但實際沒寄出。

**解法**：i-En 已改用 App Password SMTP（`GMAIL_APP_PASSWORD`），不依賴 OAuth。
如果還是壞，檢查：
```bash
# 直接測 SMTP
curl --url 'smtps://smtp.gmail.com:465' --ssl-reqd \
  --mail-from "$GOG_ACCOUNT" \
  --mail-rcpt 'k.chang.8844@gmail.com' \
  --user "$GOG_ACCOUNT:$GMAIL_APP_PASSWORD" \
  --upload-file - <<< 'Subject: test\n\nbody'
```

### SQLite schema 損壞

```bash
# 重建 DB（會清空所有資料）
rm data/ien.db data/ien.db-*
node src/main.js   # 會自動建立新 schema
```

### R2 / GitHub 上傳失敗

檢查：
- `R2_*` 環境變數是否正確
- GitHub token 仍有 `repo` 權限
- 看 `data/ien.db` 的 `runs` 表，`status='failed'` 那筆的 `error_msg`

---

## 架構備註

- 使用 ES Module（`"type": "module"`）
- dotenv v17 使用 `result.parsed` 而非 `process.env`
- MiniMax 透過 `api.minimax.io/anthropic`（Anthropic 相容端點）
- MiniMax image-01 的 base64 欄位為 `data.data.image_base64[0]`
- Anthropic 回傳格式含 `thinking` block，需用 `filter(block => block.type === 'text')` 取文字
- IG 圖片 URL 用 GitHub raw（Meta crawler 擋 R2）
- IG API host = `graph.facebook.com`（**不是** `graph.instagram.com`）
- IG API version = `v21.0`（FB Login token 適用）

---

## Drift Cleanup 紀錄（2026-07-21）

i-En 自 2026-04-07 起累積 3 個月的 uncommitted drift，這次 session 一次清完（8 commits）：

| Commit | 內容 |
|--------|------|
| `ed4b60f` | fix：IG publish (v20→v21) + monitor App Password SMTP |
| `85b2b3d` | chore：gitignore runtime data（posted_topics.json 等）|
| `9482fc7` | feat：SQLite 整合（db.js + storage/logger/main）|
| `582f562` | refactor：拆分 uploader → r2Upload + githubUpload |
| `a1781e1` | feat：Brain 529 重試 + 健康檢查 + Token fallback |
| `8e9289e` | docs：SPEC + cron 管理 + Discord reporter |
| `7eeb686` | test：SQLite 19 套測試 |
| `735e4e0` | chore：npm test 啟動 SQLite 測試 |
