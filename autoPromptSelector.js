#!/usr/bin/env node
/**
 * autoPromptSelector.js — 月初自動人格切換腳本
 * 由 Cron Job 每月初呼叫，自動判斷當月適合的季節模式並執行 injection
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAIN_FILE = resolve(__dirname, 'src/brain.js');

// ─── 月份 → 季節 Prompt 對照表 ─────────────────────────────────────────────
const SEASON_MAP = {
    1:  '春節',       // 元旦/春節
    2:  '春節',       // 春季前期
    3:  '春季',       // 春季
    4:  '春季',       // 春季
    5:  '梅雨季',     // 梅雨季
    6:  '梅雨季',     // 梅雨季
    7:  '夏季酷暑',   // 夏季酷暑
    8:  '夏季酷暑',   // 夏季酷暑
    9:  '秋季',       // 秋季
    10: '秋季',       // 秋季
    11: '秋季',       // 秋季
    12: '冬季濕冷',   // 冬季濕冷
};

const now      = new Date();
const month    = now.getMonth() + 1; // 1-12
const year     = now.getFullYear();
const season   = SEASON_MAP[month] || '普通';
const prevSeasonFile = resolve(__dirname, '.last_season');

console.log(`[PromptSelector] ${year}-${String(month).padStart(2,'0')} → 切換至「${season}」模式`);

// 讀取上次已套用的季節，避免重複執行
let lastSeason = '';
try {
    lastSeason = readFileSync(prevSeasonFile, 'utf-8').trim();
} catch { /* 首次執行 */ }

if (lastSeason === season) {
    console.log(`[PromptSelector] 已為「${season}」模式，略過 injection`);
    process.exit(0);
}

// 執行 injection
try {
    execSync(`node "${resolve(__dirname, 'promptInjector.js')}" --season="${season}"`, {
        stdio: 'inherit',
        cwd: __dirname
    });
    writeFileSync(prevSeasonFile, season, 'utf-8');
    console.log(`[PromptSelector] 已寫入 .last_season`);
} catch (err) {
    console.error(`[PromptSelector] ❌ injection 失敗: ${err.message}`);
    process.exit(1);
}
