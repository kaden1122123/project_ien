# i-En Cron Jobs
> 集中管理所有 i-En 相關的系統 crontab 項目

## 設計原則

所有 crontab 寫在 `cron/active_crons`，不再直接操作系統 crontab 以後要修改：
1. 改 `active_crons` 檔案
2. 執行 `crontab cron/active_crons` 生效
3. 缺點：只能有一個 crontab 檔（需整合其他機器的 jobs）

## 現有 Jobs

### 1. i-En Pipeline，每4小時
```
0 */4 * * *
```
**腳本：** `ien_cron_runner.sh`（`~/.openclaw/workspace/`）
**職責：** Brain → Vision → R2 → IG → Memory 完整流程
**日誌：** `logs/cron_runner.log`

### 2. API 監控，每小時
```
0 * * * *
```
**腳本：** `ien_light_monitor.sh`（`~/.openclaw/workspace/`）
**職責：** 三檢查點被動監控，有異常才通知
**日誌：** `logs/cron_monitor.log`

## 歷史

| 日期 | 事件 |
|------|------|
| 2026-04 | 最初以 OpenClaw cron job（Job ID `27fbcaf7`）運作 |
| 2026-05-27 | 改用系統 crontab（`ien_cron_runner.sh`），原因：isolated agent setup timeout |
