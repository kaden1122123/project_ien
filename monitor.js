/**
 * monitor.js — i-En 異常觀測系統
 * 讀取最近 24 小時日誌，偵測致命錯誤、Token 過期、記憶體檔案異常
 * 發現问题时發送 Email 通知
 */

import { readFileSync, statSync } from 'fs';
import { execFileSync } from 'child_process';

const LOG_FILE   = '/home/clawuser/openclaw-workspace/project_ien/logs/ien_system.log';
const MEM_FILE   = '/home/clawuser/openclaw-workspace/project_ien/data/memory.json';
const LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 小時

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

// ─── 3. 發送 Email ────────────────────────────────────────────────────────
function sendEmail(subject, body) {
    try {
        // 使用 execFileSync（陣列形式），避免 shell 解讀 body 中的換行符
        execFileSync('gog', [
            'email', 'send',
            '--to', 'k.chang.8844@gmail.com',
            '--subject', subject,
            '--body', body
        ], { encoding: 'utf-8', stdio: 'pipe' });
        console.log('[Monitor] ✅ Email 通知已發送至 k.chang.8844@gmail.com');
    } catch (err) {
        console.error(`[Monitor] ❌ Email 發送失敗: ${err.message}`);
        console.log(`\n========== 警報（Email 發送失敗）==========\n${body}\n==========================================`);
    }
}

// ─── 4. 主邏輯 ───────────────────────────────────────────────────────────
function main() {
    const logErrors   = checkLogs();
    const memIssues   = checkMemory();
    const hasFatal    = logErrors.length > 0;
    const has190      = logErrors.some(e => e.code190);
    const hasMemIssue = memIssues.length > 0;

    if (!hasFatal && !hasMemIssue) {
        console.log('[Monitor] ✅ 無異常，系統正常運行（近 24 小時）');
        return;
    }

    // ─── 組合警報 ───────────────────────────────────────────────────────
    let lines = [
        '🚨 i-En 異常警報 🚨\n',
        `觸發時間：${new Date().toISOString()} (UTC)\n`
    ];

    if (hasFatal) {
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('📌 致命錯誤（近 24 小時）');
        lines.push(`共 ${logErrors.length} 筆\n`);
        if (has190) lines.push('⚠️  IG API Token 已過期（Meta Error Code 190）— 請更新 META_INSTAGRAM_API_KEY\n');
        logErrors.forEach(e => {
            const tag = e.code190 ? ' [⚠️ Token 過期]' : '';
            lines.push(`[${e.ts}]${tag} ${e.msg}`);
        });
        lines.push('');
    }

    if (hasMemIssue) {
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('📌 記憶體檔案異常');
        memIssues.forEach(issue => lines.push(`• ${issue}`));
        lines.push('');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('請登入系統檢查或聯繫 SRE。');

    const alertText = lines.join('\n');
    const subject = has190
        ? '🚨 i-En 異常：IG Token 過期（Code 190）'
        : '🚨 i-En 異常：系統錯誤';

    sendEmail(subject, alertText);
}

main();
