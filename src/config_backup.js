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
