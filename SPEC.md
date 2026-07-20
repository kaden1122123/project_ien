# i-En 輕量級 API 監控 Script — 實作規格

## 1. 目標

為 i-En 建立輕量級的「健康檢查 + 被動監控」系統，確保：
- **没問題時零通知**
- **有問題時立刻知道、知道原因、知道怎麼修**

## 2. 現有系統參考

- **Pipeline：** `main.js` — 每 2 小時執行一次（5-step 新聞→圖→R2→IG）
- **日誌：** `src/logger.js` 寫入 `logs/ien_system.log`（含 `[FATAL]` 等級）
- **現有監控：** `monitor.js`（純事後讀 log，無 proactive check）
- **Token：** `.env` → `META_INSTAGRAM_API_KEY`
- **User ID：** `.env` → `IG_USER_ID`
- **API 版本：** `publisher.js` 硬編碼 `v21.0`

## 3. 輸出檔案

| 檔案 | 動作 | 用途 |
|------|------|------|
| `src/health_check.js` | 新增 | Token 有效性 / API 版本 / 近 24h FATAL log 檢查 |
| `src/config_backup.js` | 新增 | Token 讀取（含 Backup fallback） |
| `monitor.js` | 修改 | import health_check，零通知改為 stdout 輸出 |

## 4. 詳細規格

### 4.1 `src/config_backup.js`

```js
import dotenv from 'dotenv';

const result = dotenv.config({ path: '/home/clawuser/.openclaw/.env' });
const env = result.parsed || {};

/**
 * 取得主 Token（來自 config.js 相同的讀取方式）
 */
export function getIgToken() {
    return env.META_INSTAGRAM_API_KEY || '';
}

/**
 * 取得備用 Token（如果 .env 有設定的話）
 * .env 需新增：META_INSTAGRAM_API_KEY_BACKUP=...
 */
export function getIgTokenBackup() {
    const backup = env.META_INSTAGRAM_API_KEY_BACKUP;
    return backup && backup.trim() !== '' ? backup.trim() : null;
}
```

### 4.2 `src/health_check.js`

```js
import axios from 'axios';
import { readFileSync } from 'fs';
import { getIgToken, getIgTokenBackup } from './config_backup.js';

const API_VER       = "v21.0";          // 與 publisher.js 同步
const SUPPORTED_VER = ["v21.0"];       // 只列出目前支援的版本
const LOG_FILE      = './logs/ien_system.log';
const LOOKBACK_MS   = 24 * 60 * 60 * 1000; // 24 小時

/**
 * 檢查 Token 有效性（發 GET /me?fields=id）
 * @returns {{ ok: boolean, code: number|null, msg: string }}
 */
export async function checkToken() {
    const token = getIgToken();
    if (!token) return { ok: false, code: null, msg: 'Token 為空' };

    try {
        const res = await axios.get(
            `https://graph.facebook.com/${API_VER}/me`,
            { params: { fields: 'id', access_token: token }, timeout: 10_000 }
        );
        return { ok: true, code: 200, msg: 'Token 有效' };
    } catch (err) {
        const data = err.response?.data?.error;
        const code = data?.code || err.response?.status || null;
        const msg  = data?.message || err.message;
        return { ok: false, code, msg };
    }
}

/**
 * 檢查 API 版本是否仍受支援
 * @returns {{ ok: boolean, current: string, supported: string[], deprecated: boolean }}
 */
export function checkApiVersion() {
    const deprecated = !SUPPORTED_VER.includes(API_VER);
    return {
        ok: !deprecated,
        current: API_VER,
        supported: SUPPORTED_VER,
        deprecated,
    };
}

/**
 * 讀取近 N 小時的 FATAL 錯誤（從 logger 寫的日誌）
 * @param {number} hours
 * @returns {{ ts: string, msg: string, code190: boolean }[]}
 */
export function checkRecentLogs(hours = 24) {
    const errors = [];
    let content;
    try {
        content = readFileSync(LOG_FILE, 'utf-8');
    } catch {
        return errors; // 檔案不存在＝還沒寫過日誌，非錯誤
    }

    const lines  = content.split('\n');
    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    for (const line of lines) {
        if (!line.includes('[FATAL]')) continue;
        const tsMatch = line.match(/^\[([^\]]+)\]/);
        if (!tsMatch) continue;
        const ts = new Date(tsMatch[1]).getTime();
        if (isNaN(ts) || ts < cutoff) continue;

        let msg = line.replace(/^\[[^\]]+\]\s*/, '');
        const code190 = /error code[:\s]*190/i.test(msg);
        errors.push({ ts: tsMatch[1], msg: msg.trim(), code190 });
    }
    return errors;
}

/**
 * 組合健康檢查報告
 * @returns {Promise<HealthReport>}
 */
export async function healthCheck() {
    const [tokenResult, apiResult, logErrors] = await Promise.all([
        checkToken(),
        Promise.resolve(checkApiVersion()), // 同步，不需等待
        Promise.resolve(checkRecentLogs()),
    ]);

    return {
        token: tokenResult,
        api:   apiResult,
        logs:  logErrors,
        // 最終判斷
        healthy: tokenResult.ok && !apiResult.deprecated && logErrors.length === 0,
    };
}
```

### 4.3 `monitor.js` 修改要點

**修改前：** 純日誌掃描，無 proactive check  
**修改後：** 串接 `healthCheck()`，健康時只輸出 stdout

```js
// 新增 import（在現有 import 之後）
import { healthCheck } from './src/health_check.js';

// main() 內修改
async function main() {
    const report = await healthCheck();

    if (report.healthy) {
        // ✅ 健康：零通知，只打 stdout
        console.log(
            `[Monitor] ✅ 健康：Token OK / API ${report.api.current} OK / 無 FATAL log`
        );
        return;
    }

    // ❌ 有問題：依現有邏輯發 Email
    // （其餘邏輯與現有 monitor.js 相同）
}
```

## 5. 通知觸發條件

| 情況 | 通知方式 | 阻斷 main.js？ |
|------|----------|---------------|
| Token 190（過期） | Email + stdout | ❌（由 cron job 決定） |
| API 版本已棄用 | Email | ❌ |
| 近 24h 有 FATAL log | Email（現有） | ❌ |
| 健康運行 | 僅 stdout | — |

## 6. Zero-Notification 設計

```
每小時 cron job 執行 monitor.js
    │
    ├─ healthCheck() → 健康
    │       └─ stdout: "[Monitor] ✅ 健康..."
    │       └─ 0 notification
    │
    └─ healthCheck() → 發現問題
            └─ Email 至 k.chang.8844@gmail.com
            └─ 寫入 last_alert_ts（避免重複通知同一批錯誤）
```

## 7. QA 驗收標準

1. **Token 正常時**：`node monitor.js` 輸出 `✅ 健康：Token OK / API v21.0 OK / 無 FATAL log`，無 Email
2. **Token 190 過期時**：收到 Email，主旨含「Token 過期（Code 190）」
3. **API 版本棄用時**：收到 Email，提醒更新 API 版本
4. **有 FATAL log 時**：收到 Email（與現有行為相同）
5. **短期重複錯誤**：第二次執行不重複發送（依 last_alert_ts 判断）

## 8. 技術約束

- 所有 JS 檔案使用 ES Module（`"type": "module"` in package.json）
- Token 讀取方式與 config.js 一致（`dotenv.config({ path: '/home/clawuser/.openclaw/.env' })`）
- axios 已在專案現有 node_modules 中
- Email 發送使用 `gog gmail send`（現有 monitor.js 已實作）
