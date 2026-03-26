import axios from 'axios';
import { CONFIG } from './config.js';

const API_VER = "v20.0";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 等待 Container 處理完成（輪詢 status_code）
 * @param {string} creationId - Step 1 拿到的 Container ID
 * @param {number} maxWaitMs  - 最大等待時間（預設 5 分鐘）
 * @param {number} intervalMs - 輪詢間隔（預設 5 秒）
 */
async function waitForContainer(creationId, maxWaitMs = 360000, intervalMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const res = await axios.get(
            `https://graph.facebook.com/${API_VER}/${creationId}`,
            { params: { fields: 'status_code', access_token: CONFIG.IG_TOKEN } }
        );
        const status = res.data.status_code;
        console.log(`[IG Container] status=${status}, elapsed=${Math.round((Date.now() - start) / 1000)}s`);
        if (status === 'FINISHED') return true;
        if (status === 'FAILED') throw new Error('[IG Container] 容器處理失敗，請重新上傳圖片');
        await sleep(intervalMs);
    }
    throw new Error(`[IG Container] 等待逾時（${maxWaitMs / 1000}s），請檢查 Meta Developer Dashboard`);
}

/**
 * 發布附重試機制（針對 Error 9007）
 * @param {string} creationId - 已就緒的 Container ID
 * @returns {string} - 成功發布的 Post ID
 */
async function publishWithRetry(creationId) {
    const delays = [10_000, 20_000, 40_000]; // 3 retries: 10s / 20s / 40s

    for (let attempt = 0; attempt <= 5; attempt++) {
        if (attempt > 0) {
            console.log(`[IG] 9007 重試中（第 ${attempt}/3），等待 ${delays[attempt - 1] / 1000}s...`);
            await sleep(delays[attempt - 1]);
        }

        try {
            const res = await axios.post(
                `https://graph.facebook.com/${API_VER}/${CONFIG.IG_USER_ID}/media_publish`,
                { creation_id: creationId, access_token: CONFIG.IG_TOKEN }
            );
            return res.data.id;
        } catch (error) {
            const igError = error.response?.data?.error;
            const code = igError?.code;
            const msg  = igError?.message || error.message;

            // 9007 = Media not ready，只重試；其他錯誤直接拋出
            if (code !== 9007) {
                throw new Error(`[IG API 錯誤] 類型: ${igError?.type}, 訊息: ${msg}, 錯誤碼: ${code}`);
            }
            console.warn(`[IG] 9007（Media not ready，第 ${attempt} 次）：${msg}`);
        }
    }
    throw new Error('[IG] 發布重試 5 次後仍失敗，請登入 Meta Developer Dashboard 確認應用程式狀態');
}

/**
 * 發布圖片至 Instagram
 *
 * Pipeline:
 *   Step 1:  建立 Media Container（向 Meta 註冊圖片 URL）
 *   Step 1.5: 輪詢等待 Container status_code === 'FINISHED'
 *   Step 2:   發布（附 9007 重試機制，最多 5 次）
 *
 * @param {string} imageUrl - R2 公開圖片 URL
 * @param {string} caption   - IG 貼文文案
 * @returns {string} - 成功發布的 Post ID
 */
export async function publishToInstagram(imageUrl, caption) {
    // Step 1: 建立 Media Container
    console.log('[IG] Step 1：建立 Media Container...');
    const containerRes = await axios.post(
        `https://graph.facebook.com/${API_VER}/${CONFIG.IG_USER_ID}/media`,
        { image_url: imageUrl, caption, access_token: CONFIG.IG_TOKEN }
    );
    const creationId = containerRes.data.id;
    console.log(`[IG] Container ID: ${creationId}`);

    // Step 1.5: 等待圖片處理完成
    console.log('[IG] Step 1.5：等待圖片處理完成...');
    await waitForContainer(creationId);
    console.log('[IG] Container 狀態：FINISHED');

    // Step 2: 發布（附重試）
    console.log('[IG] Step 2：發布至塗鴉牆（附 9007 重試機制）...');
    const postId = await publishWithRetry(creationId);
    console.log(`[IG] 發布成功，Post ID: ${postId}`);
    return postId;
}
