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
    1:  "平淡期",       // 元旦新年效應，市場休息期
    2:  "財報季",      // Q4 財報密集公布
    3:  "平淡期",       // Q4 財報結束，市場重新布局
    4:  "平淡期",       // 財報淡季，Q1 展望期
    5:  "財報季",      // Q1 財報密集公布
    6:  "平淡期",       // Q1 財報結束
    7:  "平淡期",       // Q2 展望期
    8:  "財報季",      // Q2 財報密集公布
    9:  "平淡期",       // Q2 財報結束，Q3 展望
    10: "平淡期",       // Q3 展望期
    11: "財報季",      // Q3 財報密集公布
    12: "平淡期",       // Q3 財報結束，年終盤點
};

const now      = new Date();
const month    = now.getMonth() + 1; // 1-12
const year     = now.getFullYear();
const season   = SEASON_MAP[month] || '平淡期';
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
