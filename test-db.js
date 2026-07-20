/**
 * test-db.js — i-En SQLite 完整測試
 * 執行方式：node test-db.js
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = join(__dirname, 'data', 'ien.db');

// 將 src/db.js 當作 internal module 引入（不走 import，走直接執行）
// 我們用 execSync 自己組裝來測試

let passed = 0;
let failed = 0;

function run(sql) {
    execSync(`sqlite3 '${DB_PATH}' "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}

function query(sql) {
    const out = execSync(
        `sqlite3 -noheader -separator '|' '${DB_PATH}' "${sql.replace(/"/g, '\\"')}"`,
        { stdio: 'pipe' }
    ).toString().trim();
    return out ? out.split('\n').map(r => r.split('|')) : [];
}

function esc(s) {
    return String(s).replace(/'/g, "''");
}

function assert(condition, msg) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.log(`  ❌ ${msg}`);
        failed++;
    }
}

async function runTests() {
    console.log('\n🧪 i-En SQLite 測試開始\n');

    // ── 環境檢查 ────────────────────────────────────────────
    console.log('【環境檢查】');
    try {
        execSync('sqlite3 --version', { stdio: 'pipe' });
        assert(true, 'sqlite3 CLI 可用');
    } catch {
        assert(false, 'sqlite3 CLI 不可用');
    }

    try {
        execSync(`test -f '${DB_PATH}'`, { stdio: 'pipe' });
        assert(true, `資料庫檔案存在: ${DB_PATH}`);
    } catch {
        assert(false, `資料庫檔案不存在: ${DB_PATH}`);
    }

    // ── Schema 檢查 ─────────────────────────────────────────
    console.log('\n【Schema 檢查】');
    const tables = query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
    const tableNames = tables.map(r => r[0]);
    assert(tableNames.includes('memory'), `memory 表存在 (實際: ${tableNames.join(', ')})`);
    assert(tableNames.includes('logs'),    `logs 表存在`);
    assert(tableNames.includes('runs'),    `runs 表存在`);

    const indexes = query("SELECT name FROM sqlite_master WHERE type='index';");
    assert(indexes.length >= 4, `索引已建立 (共 ${indexes.length} 個)`);

    // ── memory 模組測試 ─────────────────────────────────────
    console.log('\n【memory 模組測試】');

    // 清理
    run("DELETE FROM memory;");

    // 模擬 pushMemory（寫入5筆，順序不同）
    const topics = [
        'AI 取代白領工作',
        'SQLite 安裝教學',
        '財務自由的五個步驟',
        '區塊鏈趨勢分析',
        '機器學習基礎概念',
        '第六筆（會被淘汰）'
    ];

    for (const t of topics) {
        run(`INSERT INTO memory (topic) VALUES ('${esc(t)}');`);
        // 滑動視窗
        run(`
            DELETE FROM memory WHERE id NOT IN (
                SELECT id FROM memory ORDER BY id DESC LIMIT 5
            );
        `);
    }

    const mem = query("SELECT topic FROM memory ORDER BY id DESC;");
    assert(mem.length === 5, `佇列維持5筆 (實際: ${mem.length})`);
    assert(mem[0][0] === '第六筆（會被淘汰）', `最新話題在第一筆 (實際: ${mem[0][0]})`);
    assert(mem[4][0] === 'SQLite 安裝教學',   `最舊話題在最後 (實際: ${mem[4][0]})`);

    // ── logs 模組測試 ───────────────────────────────────────
    console.log('\n【logs 模組測試】');
    run("DELETE FROM logs;");

    const levels = ['INFO', 'WARN', 'ERROR', 'FATAL'];
    for (let i = 0; i < 10; i++) {
        run(`INSERT INTO logs (ts, level, message) VALUES (datetime('now','-${i} second'), '${levels[i%4]}', '測試訊息 ${i}');`);
    }

    const recent = query("SELECT COUNT(*) FROM logs;");
    assert(recent[0][0] === '10', `寫入10筆日誌 (實際: ${recent[0][0]})`);

    const warnLogs = query("SELECT COUNT(*) FROM logs WHERE level='WARN';");
    assert(warnLogs[0][0] === '3', `WARN 等級有3筆 (實際: ${warnLogs[0][0]})`);

    const getRecent = query("SELECT message FROM logs ORDER BY id DESC LIMIT 3;");
    assert(getRecent[0][0] === '測試訊息 9', `最近優先 (實際: ${getRecent[0][0]})`);

    // ── runs 模組測試 ───────────────────────────────────────
    console.log('\n【runs 模組測試】');
    run("DELETE FROM runs;");

    // 寫入一筆成功記錄
    run(`
        INSERT INTO runs
            (news_title, news_url, news_source, news_author,
             topic, flux_prompt, ig_caption,
             image_url, post_id, status, error_msg, raw_news)
        VALUES
            ('AI 行情大漲', 'https://example.com/ai', '經濟日報', '王小明',
             'AI 投資熱潮', 'a cat reading newspaper',
             '#AI #finance', 'https://r2.ex.com/img.jpg',
             'ig_12345', 'success', NULL, '{"title":"AI行情"}');
    `);

    // 寫入一筆失敗記錄
    run(`
        INSERT INTO runs
            (news_title, status, error_msg)
        VALUES
            ('區塊鏈新聞', 'failed', 'API timeout');
    `);

    const total = query("SELECT COUNT(*) FROM runs;");
    assert(total[0][0] === '2', `共2筆記錄 (實際: ${total[0][0]})`);

    const success = query("SELECT COUNT(*) FROM runs WHERE status='success';");
    assert(success[0][0] === '1', `成功1筆 (實際: ${success[0][0]})`);

    const failed_ = query("SELECT COUNT(*) FROM runs WHERE status='failed';");
    assert(failed_[0][0] === '1', `失敗1筆 (實際: ${failed_[0][0]})`);

    const stats = query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failed
        FROM runs;
    `);
    const [t, s, f] = stats[0];
    assert(parseInt(t) === 2 && parseInt(s) === 1 && parseInt(f) === 1,
        `統計正確 total=2 success=1 failed=1 (實際: ${t},${s},${f})`);

    // ── 交織寫入測試（模擬同時寫入）──────────────────────────
    console.log('\n【交織寫入測試】');
    run("DELETE FROM memory;");
    run("DELETE FROM runs;");

    // 同時寫5次 memory
    for (let i = 0; i < 5; i++) {
        run(`INSERT INTO memory (topic) VALUES ('交織話題${i}');`);
        run(`INSERT INTO runs (news_title, status) VALUES ('news${i}', 'success');`);
    }

    const mCount = query("SELECT COUNT(*) FROM memory;");
    const rCount = query("SELECT COUNT(*) FROM runs;");
    assert(mCount[0][0] === '5', `memory 交織寫入5次後有5筆 (實際: ${mCount[0][0]})`);
    assert(rCount[0][0] === '5', `runs 交織寫入5次後有5筆 (實際: ${rCount[0][0]})`);

    // ── 清理 ────────────────────────────────────────────────
    console.log('\n【清理】');
    run("DELETE FROM memory;");
    run("DELETE FROM logs;");
    run("DELETE FROM runs;");
    const emptyM = query("SELECT COUNT(*) FROM memory;");
    const emptyL = query("SELECT COUNT(*) FROM logs;");
    const emptyR = query("SELECT COUNT(*) FROM runs;");
    assert(emptyM[0][0] === '0' && emptyL[0][0] === '0' && emptyR[0][0] === '0',
        '所有測試資料已清理');

    // ── 總結 ────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`結果：✅ ${passed}  ❌ ${failed}`);
    if (failed === 0) {
        console.log('🎉 所有測試通過！\n');
    } else {
        console.log(`⚠️  仍有 ${failed} 項失敗，請檢查。\n`);
        process.exit(1);
    }
}

runTests().catch(e => {
    console.error('測試執行錯誤:', e);
    process.exit(1);
});
