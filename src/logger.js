/**
 * logger.js — i-En 統一日誌模組
 * 同時輸出至 stdout 與 logs/ien_system.log
 */
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR  = __dirname + '/../logs';
const LOG_FILE = LOG_DIR + '/ien_system.log';

function ensureLogDir() {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

export function log(level, ...args) {
    const ts   = new Date().toISOString();
    const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const line = `[${ts}] [${level}] ${text}\n`;

    process.stdout.write(line);              // stdout（cron delivery 捕捉）
    ensureLogDir();
    appendFileSync(LOG_FILE, line);           // 寫入日誌檔
}

export const logger = {
    info:  (...a) => log('INFO',  ...a),
    warn:  (...a) => log('WARN',  ...a),
    error: (...a) => log('ERROR', ...a),
    fatal: (...a) => log('FATAL', ...a),
};
