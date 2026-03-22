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
    '梅雨季': {
        prompt: `目前為台灣梅雨季，請提高生成濕度相關的情境，如鏡頭佈滿水滴、路面嚴重積水，並讓小艾針對碳基生物不撐傘的行為進行吐槽`,
        hashtags: `#梅雨季觀察 #濕度攻擊 #積水視角 #不撐傘的人類`
    },
    '颱風季': {
        prompt: `目前為台灣颱風季，請生成強風暴雨情境，如招牌被吹落、路樹倒伏、騎士被風吹到搖晃，並讓小艾以氣象學角度吐槽碳基生物在狂風中仍堅持外出的行為`,
        hashtags: `#颱風季觀察 #風力發電失敗 #路樹倒伏 #逆向行駛的人類`
    },
    '夏季酷暑': {
        prompt: `目前為台灣夏季酷暑，請生成高溫情境，如地面熱氣流、手機外殼發燙、柏油融化黏鞋底、機車騎士被迫繞路，並讓小艾以熱力學角度吐槽碳基生物的散熱效率`,
        hashtags: `#夏季酷暑觀察 #熱浪攻擊 #柏油黏鞋 #散熱系統失敗的人類`
    },
    '秋季': {
        prompt: `目前為平地的秋季，請生成秋季情境，如路旁落葉、天燈緩緩升空、烤肉煙霧飄散、中秋月餅油渍，並讓小艾以美學角度吐槽碳基生物對季節變化的過度浪漫化`,
        hashtags: `#秋季觀察 #落葉美學 #天燈視角 #過度浪漫化的人類`
    },
    '冬季濕冷': {
        prompt: `目前為平地的冬季濕冷，請生成濕冷情境，如室內除濕機轟鳴、鞋子永遠潮濕、鏡頭起霧、溫泉蒸汽瀰漫，並讓小艾以水循環角度吐槽碳基生物對潮濕的無力感`,
        hashtags: `#冬季濕冷觀察 #除濕機美學 #鏡頭起霧 #除濕失敗的人類`
    },
    '跨年煙火': {
        prompt: `目前為跨年時段，請生成聖誕與跨年煙火情境，如夜空爆炸、人群倒數、倒數後大量廢棄物、手機被擠落，並讓小艾以統計學角度吐槽碳基生物每年重複同一行為的行為模式`,
        hashtags: `#跨年煙火觀察 #倒數失誤 #廢棄物美學 #強迫性重複的人類`
    },
    '春節': {
        prompt: `目前為春節期間，請生成節慶情境，如鞭炮碎片、巷口塞車、紅包被揉捏、寺廟香爐，並讓小艾以物流學角度吐槽碳基生物在節日期間的效率崩潰`,
        hashtags: `#春節觀察 #鞭炮碎片美學 #塞車視角 #物流崩潰的人類`
    },
    '春季': {
        prompt: `目前為平地的春季，請生成春季情境，如路邊新芽、午后雷陣雨、鴿子聚集覓食、氣溫忽冷忽熱，並讓小艾以物候學角度吐槽碳基生物對花粉過敏的集體焦慮`,
        hashtags: `#春季觀察 #花粉季節 #午後雷陣雨 #過敏崩潰的人類`
    },
    '普通': {
        prompt: `請隨機生成當前電量、溫度與台灣街頭情境，並產出今天的觀察日誌`,
        hashtags: `#台灣街頭觀察 #日常美學`
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
