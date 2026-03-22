import axios from 'axios';
import { CONFIG } from './config.js';

export async function publishToInstagram(imageUrl, caption) {
    const API_VER = "v20.0"; // 建議鎖定固定版本以確保 API 穩定性

    try {
        // Step 1: 建立 Media Container (將雲端圖片註冊到 IG 伺服器)
        const containerRes = await axios.post(`https://graph.facebook.com/${API_VER}/${CONFIG.IG_USER_ID}/media`, {
            image_url: imageUrl,
            caption: caption,
            access_token: CONFIG.IG_TOKEN
        });

        const creationId = containerRes.data.id;

        // Step 2: 進行發布 (將註冊好的 Container 實際推送到塗鴉牆)
        const publishRes = await axios.post(`https://graph.facebook.com/${API_VER}/${CONFIG.IG_USER_ID}/media_publish`, {
            creation_id: creationId,
            access_token: CONFIG.IG_TOKEN
        });

        return publishRes.data.id; // 回傳成功發布的 Post ID

    } catch (error) {
        // 深度解析 Meta Graph API 的專屬錯誤格式
        const igError = error.response?.data?.error;
        if (igError) {
            throw new Error(`[IG API 錯誤] 類型: ${igError.type}, 訊息: ${igError.message}, 錯誤碼: ${igError.code}`);
        }
        throw new Error(`[發布模組錯誤] 網路或未知異常: ${error.message}`);
    }
}
