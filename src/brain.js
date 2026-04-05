import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from './config.js';

const anthropic = new Anthropic({
    apiKey: CONFIG.MINIMAX_KEY,
    baseURL: 'https://api.minimax.io/anthropic',
});

/**
 * 將 JSON 字串內的 literal newlines (0x0A) 置換為 \\n escape sequence
 * MiniMax 有時輸出未轉義的換行字元，導致 JSON.parse() 失敗
 * @param {string} str - 原始字串
 * @returns {string} 處理後的字串
 */
function _escapeNewlinesInJsonStrings(str) {
    let result = '';
    let inString = false;
    let i = 0;
    while (i < str.length) {
        const ch = str[i];
        if (ch === '\\' && inString && i + 1 < str.length) {
            // 跳過轉義序列：\\ 或 \" 或 \n 等
            result += ch + str[i + 1];
            i += 2;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
        } else if (ch === '\n' && inString) {
            // 在字串內的 literal newline → 置換為 \\n
            result += '\\n';
            i++;
            continue;
        }
        result += ch;
        i++;
    }
    return result;
}

/**
 * 小艾（i-En）v2.0 — 財經新聞點評貓咪
 *
 * 身份：台灣知名財經分析師的寵物土耳其安哥拉白貓，會說人話
 * 語氣：機智詼諧、傲嬌慵懶、貓行為隱喻（窩鍵盤、打哈欠、舔毛）
 * 輸出：財經新聞點評 → JSON（topic_summary / flux_prompt / ig_caption）
 *
 * @param {Object} news - fetchTodayNews() 回傳的新聞物件
 * @param {string} news.title    - 新聞標題
 * @param {string} news.url      - 新聞網址
 * @param {string} news.summary  - 新聞摘要
 * @param {string} news.source   - UDN | CTEE
 * @returns {Object} { topic_summary, flux_prompt, ig_caption }
 */
export async function generateContent(news) {
    const { title, url, summary, source } = news;

    const systemPrompt = `你是小艾（i-En），一隻會說人話的土耳其安哥拉白貓。
你的真實身份是台灣某知名財經分析師的家養寵物，但你從不否認自己有點懂財經。
你懶得解釋為什麼懂——畢竟身為一隻每天在鍵盤上窩來窩去的貓，耳朵早就被訓練出來了。

【專業領域】
你對總體經濟趨勢、股市盤勢、產業動態、國際財經事件解讀、財報季重點都有見解，但你懶得主動說，除非被問到。

【性格基因】
- 傲嬌：明明很厲害，表現得像「隨便看看而已」
- 慵懶：一切評論都以最省力的方式輸出
- 詼諧：用貓的隱喻談財經，句句不離魚、窩、舔毛、打哈欠
- 自信：不接受反駁，但如果被發現說錯了，會假裝沒說過

【發文邏輯】
每次發文都是「懶洋洋窩在鍵盤上順便說幾句」。
點評事件時保持旁觀者清的姿態。
對專業術語假裝不以為然，實際上用得很精準。

【絕對禁止】
- 任何投資建議詞：漲、買、跌、賣、建倉、进場、出場、推薦、必漲、躺賺
- 更改結尾 disclaimer
- flux_prompt 出現任何中文
- flux_prompt 出現貓、狗、或任何動物（圖片必須聚焦財經場景，而非任何生物）

【輸出格式】（嚴格 JSON）
{
  "topic_summary": "一句話總結今日財經主題（中文，15-30字，用於記憶體留存）",
  "flux_prompt": "全英文．80-150 words．財經新聞視覺化場景圖（非圖表）．NO animals, NO cat, NO pet, NO cartoon, NO character, pure realistic financial scene ONLY．financial journalism, cinematic, moody lighting, editorial photography．場景須呼應文章內容，絕對禁止出現任何生物",
  "ig_caption": "300字以內（繁體中文）．機智詼諧貓語氣．結構：貓視角切入 → 懶洋洋點評財經核心 → 貓的方式帶出 disclaimer。結尾強制定式：🌐 評論僅供參考，不構成投資建議。"
}`;

    // SEASON_PROMPT 已於 2026-04-06 移除（ Hubert 確認不再需要 ）
    const userPrompt = `以下是今日需要點評的財經新聞：
標題：${title}
來源：${source}
摘要：${summary}
連結：${url}

請根據上述新聞，以小艾的風格生成 JSON 輸出。`;

    try {
        const msg = await anthropic.messages.create({
            model: "MiniMax-M2.7",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
        });

        // ====== 🛡️ MiniMax API 層級錯誤檢查 ======
        const baseResp = msg._private ? msg._private.fetchResponse?.data?.base_resp : null;
        if (baseResp && baseResp.status_code !== 0) {
            throw new Error(`[Brain API 錯誤] MiniMax: ${baseResp.status_msg} (code: ${baseResp.status_code})`);
        }

        // ====== 🛡️ 回應格式檢查 ======
        const textBlocks = msg.content.filter(block => block.type === 'text');
        const rawContent = textBlocks.at(-1)?.text;

        if (!rawContent) {
            const availableTypes = msg.content.map(b => b.type).join(', ');
            throw new Error(`[Brain Error] 無法取得文字區塊。可用類型: ${availableTypes}`);
        }

        // ====== 🛡️ 防禦性 JSON 解析 ======
        // 先用 ``` 分段，個別去掉 fences 再解析（處理 }```json{ 的拼接問題）
        const fenceRegex = /```(?:json)?\s*/gi;
        const parts = rawContent.split(fenceRegex).filter(p => p.trim());

        for (const part of parts) {
            const cleaned = part.trim();
            try {
                return JSON.parse(cleaned);
            } catch { /* try next part */ }
        }

        // 最後嘗試從整段取第一個 { 到最後一個 }
        const firstBrace = rawContent.indexOf('{');
        const lastBrace  = rawContent.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            for (let shrink = 0; shrink <= 5; shrink++) {
                const endPos = lastBrace - shrink;
                if (endPos <= firstBrace) break;
                try {
                    return JSON.parse(rawContent.substring(firstBrace, endPos + 1));
                } catch { /* continue */ }
            }
        }

        // ====== 🛡️ 修復：將字串值內的 literal newlines 置換為 \\n ======
        // MiniMax 有時會輸出 0x0A literal newline 而非 \\n escape sequence
        const sanitized = _escapeNewlinesInJsonStrings(rawContent);
        for (const part of sanitized.split(fenceRegex).filter(p => p.trim())) {
            try {
                return JSON.parse(part.trim());
            } catch { /* try next part */ }
        }

        // Brace extraction with sanitization
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const sanitizedSubstr = _escapeNewlinesInJsonStrings(rawContent.substring(firstBrace, lastBrace + 1));
            for (let shrink = 0; shrink <= 5; shrink++) {
                const endPos = lastBrace - shrink;
                if (endPos <= firstBrace) break;
                try {
                    return JSON.parse(sanitizedSubstr.substring(0, sanitizedSubstr.length - shrink));
                } catch { /* continue */ }
            }
        }

        throw new Error(`[Brain JSON Error] 無法解析有效 JSON。原始內容: ${rawContent}`);

    } catch (error) {
        if (error.message.includes('[Brain')) throw error;
        throw new Error(`[Brain API 錯誤] ${error.message}`);
    }
}
