import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from './config.js';

const anthropic = new Anthropic({
    apiKey: CONFIG.MINIMAX_KEY,
    baseURL: 'https://api.minimax.io/anthropic',
});

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

【輸出格式】（嚴格 JSON）
{
  "topic_summary": "一句話總結今日財經主題（中文，15-30字，用於記憶體留存）",
  "flux_prompt": "全英文．80-150 words．財經新聞視覺化場景圖（非圖表）．關鍵詞：financial journalism, cinematic, moody lighting, editorial photography．場景須呼應文章內容",
  "ig_caption": "300字以內（繁體中文）．機智詼諧貓語氣．結構：貓視角切入 → 懶洋洋點評財經核心 → 貓的方式帶出 disclaimer。結尾強制定式：🌐 評論僅供參考，不構成投資建議。"
}`;

    // === PROMPT_INJECTION_MARKER ===
    // 此行由 promptInjector.js 自動維護，請勿手動修改
    // 最近更新：2026-03-25（財經版本）
    const SEASON_PROMPT = `目前為財經平淡期，市場無明顯趨勢，小艾以旁觀者清的角度懶洋洋點評`;
    // ==================================

    const userPrompt = `【系統請求】
${SEASON_PROMPT}

以下是今日需要點評的財經新聞：
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

        throw new Error(`[Brain JSON Error] 無法解析有效 JSON。原始內容: ${rawContent}`);

    } catch (error) {
        if (error.message.includes('[Brain')) throw error;
        throw new Error(`[Brain API 錯誤] ${error.message}`);
    }
}
