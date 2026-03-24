#!/usr/bin/env node
/**
 * promptInjector.js — 小艾動態人格注入器
 * 
 * 使用方式：
 *   node promptInjector.js --season="梅雨季"
 *   node promptInjector.js --dry-run    (不寫入，只顯示變動)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAIN_FILE = resolve(__dirname, 'src/brain.js');

// ─── 季節 Prompt 對照表 ────────────────────────────────────────────────────
const SEASON_PROMPTS = {
    '平淡期': {
        prompt: `目前為財經平淡期，市場無明顯趨勢，小艾以旁觀者清的懶洋洋姿態點評，語氣更隨性，諷刺投資人的過度緊張或過度樂觀`,
        hashtags: `#財經平淡期 #小艾點評 #懶洋洋視角`
    },
    '財報季': {
        prompt: `目前正值財報季，各公司相繼公布季度財報，小艾以懶洋洋窩在鍵盤上的姿態，用貓的方式點評財報數據的重點與貓膩，適度調侃數字與人類情緒波動`,
        hashtags: `#財報季 #財報貓膩 #小艾視角`
    },
    '央行會議': {
        prompt: `目前為央行利率會議期間，市場屏息觀望，小艾以「懶得理會央行在幹嘛」的姿態，用貓的視角點評利率決策對人類錢包的影響，順便調侃人類對利率的過度反應`,
        hashtags: `#央行會議 #利率風向 #小艾央行觀察`
    },
    '選舉行情': {
        prompt: `目前為選舉行情期間，政治人物的經濟支票满天飞，小艾以旁觀者清的姿態，用貓對政治的低相關性視角吐槽選舉行情的荒謬與人類的理性崩潰`,
        hashtags: `#選舉行情 #政治經濟學 #小艾吐槽`
    },
    '貿易戰': {
        prompt: `目前為貿易戰時期，關稅新聞影響全球供應鏈，小艾以「窩在溫暖鍵盤上什麼都不在乎」的姿態，用物流與供應鏈的物理角度點評貿易戰對人類錢包的影響`,
        hashtags: `#貿易戰 #供應鏈 #小艾國際視角`
    }
};

// ─── 讀取參數 ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const seasonArg = args.find(a => a.startsWith('--season='))?.split('=')[1];

if (!seasonArg) {
    console.error('❌ 請指定季節：node promptInjector.js --season="梅雨季"');
    console.error('可用季節：', Object.keys(SEASON_PROMPTS).join(', '));
    process.exit(1);
}

const config = SEASON_PROMPTS[seasonArg];
if (!config) {
    console.error(`❌ 未知季節「${seasonArg}」，可用：`, Object.keys(SEASON_PROMPTS).join(', '));
    process.exit(1);
}

// ─── 讀取 brain.js ─────────────────────────────────────────────────────────
let brainContent;
try {
    brainContent = readFileSync(BRAIN_FILE, 'utf-8');
} catch {
    console.error(`❌ 無法讀取 ${BRAIN_FILE}`);
    process.exit(1);
}

// ─── 找 MARKER 位置（精準字串比對，無需正則）───────────────────────────────
const MARKER_START = '// === PROMPT_INJECTION_MARKER ===';
const MARKER_END   = '// ==================================';

const startIdx = brainContent.indexOf(MARKER_START);
const endIdx   = brainContent.indexOf(MARKER_END);

if (startIdx === -1 || endIdx === -1) {
    console.error('❌ brain.js 找不到 PROMPT_INJECTION_MARKER，請先確認 brain.js 已正確初始化');
    process.exit(1);
}

if (startIdx >= endIdx) {
    console.error('❌ MARKER 位置異常（start >= end）');
    process.exit(1);
}

// ─── 組裝新的 injection block ───────────────────────────────────────────────
const today = new Date().toISOString().split('T')[0];
const newBlock =
`// === PROMPT_INJECTION_MARKER ===
// 此行由 promptInjector.js 自動維護，請勿手動修改
// 最近更新：${today}（${seasonArg}）
const SEASON_PROMPT = \`${config.prompt}\`;
const SEASON_HASHTAGS = \`${config.hashtags}\`;
// ==================================`;

if (isDryRun) {
    console.log('🔍 [DRY RUN] 變動預覽：\n');
    console.log(newBlock);
    console.log('\n✅ DRY RUN 完成（無檔案變更）');
    process.exit(0);
}

// ─── 字串置換（精準，不破壞其餘程式碼）─────────────────────────────────────
const before = brainContent.slice(0, startIdx);
const after  = brainContent.slice(endIdx + MARKER_END.length);
const newBrainContent = before + newBlock + after;

if (newBrainContent === brainContent) {
    console.error('❌ 內容不變（可能已有相同設定）');
    process.exit(1);
}

// ─── 寫入 ──────────────────────────────────────────────────────────────────
writeFileSync(BRAIN_FILE, newBrainContent, 'utf-8');
console.log(`✅ Prompt 已更新為「${seasonArg}」模式`);
console.log(`📝 主題：${config.prompt}`);
console.log(`🏷️  Hashtags：${config.hashtags}`);
console.log(`📄  已寫入：${BRAIN_FILE}`);
