/**
 * monitor.js — i-En 異常觀測系統
 * 讀取最近 24 小時日誌，偵測致命錯誤、Token 過期、記憶體檔案異常
 * 發現问题时發送 Email 通知
 */

import { readFileSync, statSync, writeFileSync, appendFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { healthCheck } from './src/health_check.js';
import dotenv from 'dotenv';

// 載入 GMAIL_APP_PASSWORD（與 config.js 同樣的 .env 路徑）
const envLoaded = dotenv.config({ path: '/home/clawuser/.openclaw/.env' });
const env = envLoaded.parsed || {};

const LOG_FILE        = '/home/clawuser/openclaw-workspace/others/project_ien/logs/ien_system.log';
const MEM_FILE        = '/home/clawuser/openclaw-workspace/others/project_ien/data/memory.json';
const LAST_ALERT_FILE = '/home/clawuser/openclaw-workspace/others/project_ien/.last_alert_ts';
const ERR_LOG_FILE    = '/home/clawuser/openclaw-workspace/others/project_ien/logs/ien_monitor_errors.log';
const LOOKBACK_MS     = 24 * 60 * 60 * 1000; // 24 小時

const FROM_EMAIL = 'kaden1122123@gmail.com';
const TO_EMAIL   = 'k.chang.8844@gmail.com';
const APP_PASS   = env.GMAIL_APP_PASSWORD || '';

// ─── 1. 讀取日誌，篩選近 24 小時的 [致命錯誤] ───────────────────────────────
function checkLogs() {
    const errors = [];
    let content;
    try {
        content = readFileSync(LOG_FILE, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('[Monitor] 日誌檔尚不存在（main.js 尚未寫入日誌），略過日誌檢查');
            return errors;
        }
        errors.push({ ts: new Date().toISOString(), msg: `[日誌讀取錯誤] ${err.message}`, code190: false });
        return errors;
    }

    const lines = content.split('\n');
    const cutoff = Date.now() - LOOKBACK_MS;

    for (const line of lines) {
        if (!line.includes('[致命錯誤]')) continue;
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

// ─── 2. 檢查 memory.json ───────────────────────────────────────────────────
function checkMemory() {
    const issues = [];
    try {
        const stat = statSync(MEM_FILE);
        const expectedMax = 500 * 10; // 5KB 安全上限
        if (stat.size > expectedMax) {
            issues.push(`memory.json 大小異常：${stat.size} bytes（預期 < ${expectedMax} bytes）`);
        }

        const content = readFileSync(MEM_FILE, 'utf-8');
        try {
            const data = JSON.parse(content);
            if (!Array.isArray(data)) {
                issues.push(`memory.json 格式錯誤：根層級應為 Array，實際為 ${typeof data}`);
            }
        } catch {
            issues.push(`memory.json JSON 解析失敗，檔案可能已損壞`);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            issues.push(`memory.json 讀取錯誤：${err.message}`);
        }
    }
    return issues;
}

// ─── 3. 發送 Email（App Password SMTP，繞過 OAuth）──────────────────────
function buildRFC822(from, to, subject, body) {
    return [
        `From: i-En Monitor <${from}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=UTF-8`,
        ``,
        body
    ].join('\r\n');
}

function sendEmail(subject, body) {
    if (!APP_PASS) {
        const msg = '[Monitor] ❌ GMAIL_APP_PASSWORD 未設定（.env）— 無法寄信';
        console.error(msg);
        try { appendFileSync(ERR_LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8'); } catch {}
        return false;
    }
    try {
        execFileSync('curl', [
            '--silent', '--show-error',
            '--url', 'smtps://smtp.gmail.com:465',
            '--ssl-reqd',
            '--mail-from', FROM_EMAIL,
            '--mail-rcpt', TO_EMAIL,
            '--user', `${FROM_EMAIL}:${APP_PASS}`,
            '--upload-file', '-'
        ], {
            input: buildRFC822(FROM_EMAIL, TO_EMAIL, subject, body),
            encoding: 'utf-8',
            stdio: 'pipe'
        });
        console.log(`[Monitor] ✅ Email 通知已發送至 ${TO_EMAIL}`);
        return true;
    } catch (err) {
        const failMsg = `[Monitor] ❌ Email 發送失敗: ${err.message}`;
        console.error(failMsg);
        try { appendFileSync(ERR_LOG_FILE, `[${new Date().toISOString()}] ${failMsg}\n--- BODY ---\n${body}\n--- END ---\n`, 'utf-8'); } catch {}
        console.log(`\n========== 警報（Email 發送失敗）==========\n${body}\n==========================================`);
        return false;
    }
}

// ─── 3b. 讀取上次發送時間 ────────────────────────────────────────────────
function readLastAlertTs() {
    try {
        return parseInt(readFileSync(LAST_ALERT_FILE, 'utf-8').trim(), 10);
    } catch {
        return 0; // 從未發過 alert
    }
}

function writeLastAlertTs(ts) {
    writeFileSync(LAST_ALERT_FILE, String(ts), 'utf-8');
}

// ─── 4. 主邏輯 ───────────────────────────────────────────────────────────
async function main() {
    // ── 4a. Proactive health check（Token 有效性 + API 版本）──────────────
    const report = await healthCheck();

    if (report.healthy) {
        console.log('[Monitor] ✅ 健康：Token OK / API v21.0 OK / 無 FATAL log');
        return;
    }

    // ── 4b. 組合被動日誌掃描結果 ──────────────────────────────────────
    const logErrors   = checkLogs();
    const memIssues   = checkMemory();
    const hasFatal   = logErrors.length > 0;
    const has190     = logErrors.some(e => e.code190);
    const hasMemIssue = memIssues.length > 0;

    if (!hasFatal && !hasMemIssue) {
        console.log('[Monitor] ✅ 無異常，系統正常運行（近 24 小時）');
        return;
    }

    // ─── 過濾：只取「上次通知之後」新發生的錯誤 ─────────────────────────
    const lastAlertTs = readLastAlertTs();
    const nowMs = Date.now();

    const newFatalErrors = hasFatal
        ? logErrors.filter(e => new Date(e.ts).getTime() > lastAlertTs)
        : [];

    const newMemIssues = hasMemIssue ? memIssues : [];

    // 若沒有新錯誤，代表上次已通知過舊錯誤，本次略過
    if (newFatalErrors.length === 0 && newMemIssues.length === 0) {
        console.log(`[Monitor] ✅ 有歷史異常但已通知過（last alert: ${new Date(lastAlertTs).toISOString()}），略過重複通知`);
        return;
    }

    // ─── 組合警報 ───────────────────────────────────────────────────────
    let lines = [
        '🚨 i-En 異常警報 🚨\n',
        `觸發時間：${new Date().toISOString()} (UTC)\n`
    ];

    if (newFatalErrors.length > 0) {
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push(`📌 新增致命錯誤（自 ${new Date(lastAlertTs).toLocaleString('zh-TW')} 後）`);
        lines.push(`共 ${newFatalErrors.length} 筆\n`);
        if (newFatalErrors.some(e => e.code190)) lines.push('⚠️  IG API Token 已過期（Meta Error Code 190）— 請至 Meta Developer → 角色 → 重新產生 META_DEV_IEN_ACCESS_TOKEN\n');
        newFatalErrors.forEach(e => {
            const tag = e.code190 ? ' [⚠️ Token 過期]' : '';
            lines.push(`[${e.ts}]${tag} ${e.msg}`);
        });
        lines.push('');
    }

    if (newMemIssues.length > 0) {
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('📌 記憶體檔案異常（新發生）');
        newMemIssues.forEach(issue => lines.push(`• ${issue}`));
        lines.push('');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('請登入系統檢查或聯繫 SRE。');

    const alertText = lines.join('\n');
    const subject = has190
        ? '🚨 i-En 異常：IG Token 過期（Code 190）'
        : '🚨 i-En 異常：系統錯誤';

    sendEmail(subject, alertText);
    writeLastAlertTs(nowMs); // 更新時間，避免下次重複寄同一批錯誤
    console.log(`[Monitor] ✅ 警報已發送，last_alert_ts 更新為 ${new Date(nowMs).toISOString()}`);
}

main();
