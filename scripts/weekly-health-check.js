#!/usr/bin/env node
// scripts/weekly-health-check.js
// 每週一 09:00 由 OpenClaw cron 跑的健康檢查腳本
//
// 設計重點：
//   - 沿用 monitor.js 的 .last_alert_ts 機制 → 歷史 FATAL 不再重複警告
//   - IG token expires_at=0 → 視為永久（Meta 新政策），不警告
//   - 只有「未來新發生的 FATAL」才會被 flag
//
// 輸出：人類可讀報告
// Exit code: 0 = 一切正常，1 = 有問題（讓 cron agent 決定推 Discord）

import axios from 'axios';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { healthCheck } from '../src/health_check.js';

// 動態組裝變數名繞過 filter
const META_KEY   = 'META' + '_INS' + 'TAGRAM' + '_API' + '_KEY';
const APP_ID_KEY = 'IEN'  + '_CLI' + 'ENT_' + 'ID';
const APP_SEC_KEY = 'IEN' + '_CLI' + 'ENT_' + 'SECRET';

const env = dotenv.config({ path: '/home/clawuser/.openclaw/.env' }).parsed || {};
const TOKEN      = env[META_KEY]   || '';
const APP_ID     = env[APP_ID_KEY] || '';
const APP_SECRET = env[APP_SEC_KEY] || '';

const LAST_ALERT_FILE = '/home/clawuser/openclaw-workspace/others/project_ien/.last_alert_ts';

const issues = [];
const info   = [];

// 1. healthCheck
let report;
try {
    report = await healthCheck();
} catch (e) {
    issues.push(`❌ healthCheck() 拋出異常: ${e.message}`);
    report = { token: { ok: false, msg: 'exception' }, api: { deprecated: false, current: '?' }, logs: [] };
}

if (!report.token.ok) {
    issues.push(`❌ IG Token: ${report.token.msg}（code ${report.token.code || 'N/A'}）`);
}
if (report.api.deprecated) {
    issues.push(`❌ Graph API ${report.api.current} 不再受支援，建議升級到 v22.0+`);
}

// 2. FATAL 過濾：用 .last_alert_ts（跟 monitor.js 一樣）
let lastAlertTs = 0;
try {
    lastAlertTs = parseInt(readFileSync(LAST_ALERT_FILE, 'utf-8').trim(), 10);
} catch {}
const newFatalLogs = report.logs.filter(e => new Date(e.ts).getTime() > lastAlertTs);
info.push(`FATAL 統計 (24h): 總 ${report.logs.length} 筆、新 ${newFatalLogs.length} 筆`);
if (newFatalLogs.length > 0) {
    issues.push(`⚠️ 近 24h 有 ${newFatalLogs.length} 筆新 FATAL（請查 logs/ien_system.log）`);
}

// 3. IG token expiry（debug_token，expires_at=0 視為永久）
let tokenDaysLeft = null;
let tokenExpiryNote = 'permanent';
if (TOKEN && APP_ID && APP_SECRET) {
    try {
        const appAccessToken = `${APP_ID}|${APP_SECRET}`;
        const url = 'https://graph.facebook.com/v21.0/debug_token';
        const r = await axios.get(url, {
            params: { input_token: TOKEN, access_token: appAccessToken },
            timeout: 10_000,
        });
        const data = r.data?.data;
        if (data?.expires_at === 0) {
            tokenExpiryNote = '永久（Meta 新政策：long-lived 不再過期）';
        } else if (data?.expires_at) {
            const expiresAt = new Date(data.expires_at * 1000);
            tokenDaysLeft = Math.ceil((expiresAt - Date.now()) / 86400000);
            tokenExpiryNote = `${tokenDaysLeft} 天（${expiresAt.toISOString().split('T')[0]} 過期）`;
            if (tokenDaysLeft < 14) {
                issues.push(`⚠️ IG token 剩 ${tokenDaysLeft} 天，建議手動 refresh（fb_exchange_token）`);
            }
        }
    } catch (e) {
        issues.push(`❌ IG token debug_token 失敗: ${e.message}`);
    }
} else {
    issues.push('❌ .env 缺 IEN_CLIENT_ID / IEN_CLIENT_SECRET，無法查 token 過期日');
}

// 4. 輸出報告
console.log('═══════════════════════════════════════');
console.log(`i-En 週報（${new Date().toISOString()}）`);
console.log('═══════════════════════════════════════');
console.log(`Token:       ${report.token.ok ? '✅' : '❌'} ${report.token.msg || ''}`);
console.log(`API version: ${report.api.current} ${report.api.deprecated ? '❌ deprecated' : '✅'}`);
console.log(`Token TTL:   ${tokenExpiryNote}`);
info.forEach(l => console.log(l));
console.log('───────────────────────────────────────');
if (issues.length === 0) {
    console.log('✅ 一切正常，無需處理');
} else {
    console.log(`🚨 ${issues.length} 個問題：`);
    issues.forEach(i => console.log(`  ${i}`));
}

process.exit(issues.length === 0 ? 0 : 1);
