/**
 * db.js — i-En SQLite 資料庫模組
 * 使用 sqlite3 CLI + 寫入暫時 .sql 檔案（避免 shell 轉義問題）
 */
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = join(__dirname, '..', 'data', 'ien.db');

// ─────────────────────────────────────────────────────────────────────────────
// 內部工具：透過暫時 SQL 檔案執行（安全轉義）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 執行一條 SQL 檔案，回傳多列（每列以 | 分隔的陣列）
 * @param {string} sql - 要執行的 SQL（會寫入暫時檔）
 * @returns {Array<Array<string>>} 每列為字串陣列
 */
function sqlQuery(sql) {
    const tmpDir = '/tmp/ien-sql-' + process.pid;
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const f = join(tmpDir, 'query.sql');
    writeFileSync(f, sql, 'utf-8');
    try {
        const out = execSync(
            `sqlite3 -noheader -separator '|' '${DB_PATH}' < '${f}'`,
            { stdio: ['pipe', 'pipe', 'pipe'] }
        ).toString().trim();
        unlinkSync(f);
        if (!out) return [];
        return out.split('\n').map(line =>
            line.split('|').map(s => s.trim())
        );
    } catch (e) {
        try { unlinkSync(f); } catch (_) {}
        return [];
    }
}

/**
 * 執行一條 SQL（無回傳值）
 * @param {string} sql
 */
function sqlRun(sql) {
    const tmpDir = '/tmp/ien-sql-' + process.pid;
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const f = join(tmpDir, 'run.sql');
    writeFileSync(f, sql, 'utf-8');
    try {
        execSync(`sqlite3 '${DB_PATH}' < '${f}'`, { stdio: ['pipe', 'pipe', 'pipe'] });
        unlinkSync(f);
    } catch (e) {
        try { unlinkSync(f); } catch (_) {}
        // 忽略 sqlite3 exit 0 以外的非錯誤退出（如 DELETE 沒刪到東西）
        if (e.status !== 0) {
            console.warn(`[DB] SQL 執行異常（exit ${e.status}）: ${sql.slice(0, 80)}`);
        }
    }
}

/**
 * 逃離單引號（SQLite 標準方式）
 */
function esc(s) {
    return String(s).replace(/'/g, "''");
}

// ─────────────────────────────────────────────────────────────────────────────
// 記憶體佇列（取代 memory_queue.json）
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_LIMIT = 5;

/**
 * 取得最近的話題佇列（由新到舊，最多 MEMORY_LIMIT 筆）
 */
export function getMemoryQueue() {
    return sqlQuery(
        `SELECT topic, created_at FROM memory ORDER BY id DESC LIMIT ${MEMORY_LIMIT};`
    ).map(([topic, created_at]) => ({ topic, created_at }));
}

/**
 * 新增話題，並維持佇列長度不超過 MEMORY_LIMIT
 */
export function pushMemory(topic) {
    sqlRun(`INSERT INTO memory (topic) VALUES ('${esc(topic)}');`);
    sqlRun(`
        DELETE FROM memory WHERE id NOT IN (
            SELECT id FROM memory ORDER BY id DESC LIMIT ${MEMORY_LIMIT}
        );
    `);
}

/**
 * 清除所有記憶體
 */
export function clearMemory() {
    sqlRun(`DELETE FROM memory;`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 日誌（寫入 logs 表，但主要持久化仍是文字檔 logger.js）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 寫入一筆日誌（level: INFO|WARN|ERROR|FATAL）
 */
export function logToDb(level, message) {
    const ts = new Date().toISOString();
    sqlRun(`INSERT INTO logs (ts, level, message) VALUES ('${esc(ts)}', '${esc(level)}', '${esc(message)}');`);
}

/**
 * 查詢最近 N 筆日誌
 */
export function getRecentLogs(limit = 50) {
    return sqlQuery(
        `SELECT ts, level, message FROM logs ORDER BY id DESC LIMIT ${limit};`
    ).map(([ts, level, message]) => ({ ts, level, message }));
}

/**
 * 查詢某段時間的日誌（since/until 為 ISO 字串）
 */
export function getLogsByTimeRange(since, until) {
    return sqlQuery(
        `SELECT ts, level, message FROM logs
         WHERE ts >= '${esc(since)}' AND ts <= '${esc(until)}'
         ORDER BY id ASC;`
    ).map(([ts, level, message]) => ({ ts, level, message }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 任務執行記錄（取代 output/index.json）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 記錄一次 Pipeline 執行
 */
export function recordRun({
    newsTitle, newsUrl, newsSource, newsAuthor,
    topic, fluxPrompt, igCaption,
    imageUrl, postId, status, errorMsg, rawNews
}) {
    const newsTitle_  = newsTitle  ? `'${esc(newsTitle)}'`  : 'NULL';
    const newsUrl_    = newsUrl    ? `'${esc(newsUrl)}'`    : 'NULL';
    const newsSource_ = newsSource ? `'${esc(newsSource)}'` : 'NULL';
    const newsAuthor_ = newsAuthor ? `'${esc(newsAuthor)}'` : 'NULL';
    const topic_      = topic      ? `'${esc(topic)}'`       : 'NULL';
    const fluxPrompt_ = fluxPrompt ? `'${esc(fluxPrompt)}'` : 'NULL';
    const igCaption_  = igCaption  ? `'${esc(igCaption)}'`  : 'NULL';
    const imageUrl_   = imageUrl   ? `'${esc(imageUrl)}'`   : 'NULL';
    const postId_      = postId     ? `'${esc(postId)}'`     : 'NULL';
    const status_      = `'${esc(status || 'success')}'`;
    const errorMsg_    = errorMsg   ? `'${esc(errorMsg)}'`   : 'NULL';
    const rawNews_     = rawNews    ? `'${esc(JSON.stringify(rawNews))}'` : 'NULL';

    sqlRun(`
        INSERT INTO runs
            (news_title, news_url, news_source, news_author,
             topic, flux_prompt, ig_caption,
             image_url, post_id, status, error_msg, raw_news)
        VALUES
            (${newsTitle_}, ${newsUrl_}, ${newsSource_}, ${newsAuthor_},
             ${topic_}, ${fluxPrompt_}, ${igCaption_},
             ${imageUrl_}, ${postId_}, ${status_}, ${errorMsg_}, ${rawNews_});
    `);
}

/**
 * 取得最近 N 次執行
 */
export function getRecentRuns(limit = 10) {
    return sqlQuery(
        `SELECT id, run_at, news_title, news_source, topic, status, post_id
         FROM runs ORDER BY id DESC LIMIT ${limit};`
    ).map(([id, run_at, news_title, news_source, topic, status, post_id]) =>
        ({ id, run_at, news_title, news_source, topic, status, post_id })
    );
}

/**
 * 取得今天的執行記錄
 */
export function getTodayRuns() {
    const today = new Date().toISOString().split('T')[0];
    return sqlQuery(
        `SELECT id, run_at, news_title, topic, status, post_id
         FROM runs WHERE run_at LIKE '${today}%' ORDER BY id DESC;`
    ).map(([id, run_at, news_title, topic, status, post_id]) =>
        ({ id, run_at, news_title, topic, status, post_id })
    );
}

/**
 * 統計：成功/失敗次數
 */
export function getRunStats() {
    const rows = sqlQuery(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failed
        FROM runs;
    `);
    if (!rows || rows.length === 0 || !rows[0][0]) {
        return { total: 0, success: 0, failed: 0 };
    }
    const [total, success, failed] = rows[0];
    return {
        total:   parseInt(total,   10) || 0,
        success: parseInt(success,  10) || 0,
        failed:  parseInt(failed,   10) || 0,
    };
}
