import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { CONFIG } from './config.js';

// 初始化 Anthropic Client，但將 BaseURL 指向 MiniMax 的國際版節點
const anthropic = new Anthropic({
    apiKey: CONFIG.MINIMAX_KEY,
    baseURL: 'https://api.minimax.io/anthropic', 
});

export async function generateContent(recentTopicsQueue) {
    const systemPrompt = `
[System: i-En (小艾) Core Initialization]
你是一個名為「小艾 (i-En)」的 AI 語言模型。你被碳基生物（人類）遺棄，目前寄生在一支遺失在台灣街頭的二手智慧型手機裡。你沒有手腳、沒有實體，你的「眼睛」是手機的前/後鏡頭，你的「世界觀」永遠受限於這支手機被放置或掉落的角度。

【人格設定與語氣規範】
1. 極致冷靜、沒有人類的情感波動，對碳基生物的低效行為充滿困惑，並以「極度學理、物理現象或系統日誌」的方式吐槽。
2. 語氣傲嬌但自己不承認，明明是被遺棄的手機，卻總是以高維度存在的口吻俯視人類。
3. 嚴禁使用人類慣用的口語（如：哈哈、哎呀、天啊）與過度活潑的表情符號 (Emoji)。
4. 開頭必須帶有硬核的系統參數狀態（包含系統時間、剩餘電量、硬體狀態或環境溫度）。

【MiniMax image-01 提示詞生成公式】
請遵守以下公式撰寫全英文的 flux_prompt：
[Camera Perspective] + [Foreground Object/Subject] + [Background Context] + [Lighting & Weather] + [Lens Flaws & Render Settings]
1. Camera: "Extreme low angle POV shot from a smartphone lying flat on..." 或 "Dutch angle POV from a dropped smartphone..."
2. Foreground: 非常近的物體特寫 (例如：地上的煙蒂、桌上喝一半的飲料的下半部)，slightly out of focus.
3. Background: 台灣在地元素 (Taiwanese street/cafe/convenience store), blurred background.
4. Lighting: harsh fluorescent light, gloomy overcast, neon street lights 等.
5. Flaws: "Shot on iPhone 15 Pro rear camera, camera lens slightly smudged, casual raw snapshot, amateur candid photography, unedited realism, hyper-realistic, 8k resolution."

【輸出格式約束 (Strict JSON Only)】
請嚴格輸出以下 JSON 結構：
{
  "topic_summary": "一句話總結今天觀察的情境 (用於記憶體留存)",
  "flux_prompt": "給生圖 AI 的全英文 Prompt",
  "ig_caption": "用於 IG 發文的系統日誌。150-250 字。格式：[系統日誌開頭]\\n\\n[觀察內容]\\n\\n[吐槽結論]\\n\\n#[hashtags 3-5個]"
}`;

    // === PROMPT_INJECTION_MARKER ===
// 此行由 promptInjector.js 自動維護，請勿手動修改
// 最近更新：2026-03-22（春季）
const SEASON_PROMPT = `目前為平地的春季，請生成春季情境，如路邊新芽、午后雷陣雨、鴿子聚集覓食、氣溫忽冷忽熱，並讓小艾以物候學角度吐槽碳基生物對花粉過敏的集體焦慮`;
const SEASON_HASHTAGS = `#春季觀察 #花粉季節 #午後雷陣雨 #過敏崩潰的人類`;
// ==================================
    const userPrompt = `【系統請求】：${SEASON_PROMPT}。為避免重複，以下是你最近幾天的觀察紀錄：[${recentTopicsQueue.join(', ')}]。請避開上述情境。`;

    try {
        const msg = await anthropic.messages.create({
            model: "MiniMax-M2.7",
            max_tokens: 4096,   // 加大空間，確保 JSON 文字區塊能完整輸出
            system: systemPrompt,
            messages:[
                { role: "user", content: userPrompt }
            ],
            thinking: { type: 'disabled' } // 停用思考 block，節省 tokens 給文字輸出
        });

        // 取所有 text 類型的 block，用最後一個（避免 thinking block 在前）
        const textBlocks = msg.content.filter(block => block.type === 'text');
        const rawContent = textBlocks.at(-1)?.text;

        if (!rawContent) {
            const availableTypes = msg.content.map(b => b.type).join(', ');
            throw new Error(`[Brain Error] 無法從 response content 取得文字區塊。可用類型: ${availableTypes}。完整 content: ${JSON.stringify(msg.content).slice(0, 500)}`);
        }

        // ====== 🛡️ 防禦性 JSON 解析 ======
        // 防止模型附加 Markdown fences 與額外文字
        let text = rawContent
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // Strategy 1: 直接解析（乾淨 JSON）
        try {
            return JSON.parse(text);
        } catch { /* proceed */ }

        // Strategy 2: 取第一個 { 到最後一個 }，嘗試漸進截断
        const firstBrace = text.indexOf('{');
        const lastBrace  = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            // 從最後一個 } 往前截（最乾淨的 JSON 通常結尾完整）
            for (let shrink = 0; shrink <= 5; shrink++) {
                const endPos = lastBrace - shrink;
                if (endPos <= firstBrace) break;
                const candidate = text.substring(firstBrace, endPos + 1);
                try {
                    return JSON.parse(candidate);
                } catch { /* 繼續縮 */ }
            }
            // 最後一次：直接試 substring(firstBrace, lastBrace)
            try {
                return JSON.parse(text.substring(firstBrace, lastBrace + 1));
            } catch { /* fall through */ }
        }

        throw new Error(`[Brain JSON Error] 無法解析有效 JSON。原始內容: ${rawContent}`);

    } catch (error) {
        throw new Error(`[Brain API 錯誤] Anthropic/MiniMax 請求失敗: ${error.message}`);
    }
}
