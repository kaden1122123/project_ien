import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getIgToken } from './config_backup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE  = join(__dirname, '..', 'logs', 'ien_system.log');

const API_VER       = "v21.0";          // 與 publisher.js 同步
const SUPPORTED_VER = ["v21.0"];       // 只列出目前支援的版本

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
