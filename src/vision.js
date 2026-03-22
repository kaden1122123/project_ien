import axios from 'axios';
import { CONFIG } from './config.js';

export async function generateImageBuffer(prompt) {
    try {
        // 網址已更新為官方的國際版 endpoint
        const response = await axios.post('https://api.minimax.io/v1/image_generation', {
            model: "image-01",
            prompt: prompt,
            aspect_ratio: "3:4", // IG 最佳直式比例
            response_format: "base64" 
        }, {
            headers: { 
                'Authorization': `Bearer ${CONFIG.MINIMAX_KEY}`, 
                'Content-Type': 'application/json' 
            }
        });

        // 🛡️ 防禦性檢查 1：MiniMax 業務邏輯錯誤
        const baseResp = response.data?.base_resp;
        if (baseResp && baseResp.status_code !== 0) {
            throw new Error(`[Vision 拒絕存取] 狀態碼: ${baseResp.status_code}, 訊息: ${baseResp.status_msg}`);
        }

        // 🛡️ 防禦性檢查 2：確保 Base64 資料存在
        const imageData = response.data?.data?.image_base64;
        if (!imageData || !Array.isArray(imageData) || !imageData[0]) {
            throw new Error('[Vision Error] API 回傳成功，但找不到 base64 圖片資料。');
        }

        return Buffer.from(imageData[0], 'base64');
        
    } catch (error) {
        if (error.response) {
            throw new Error(`[Vision API 網路錯誤] HTTP 狀態: ${error.response.status}, 內容: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}