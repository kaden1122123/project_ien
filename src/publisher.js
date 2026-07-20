import axios from 'axios';
import { CONFIG } from './config.js';

const API_VER = "v21.0";
const IG_API_HOST = "graph.facebook.com";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 等待 Container 處理完成（指數退避輪詢）
 *
 * 策略：
 * - 首次 poll → 等待 baseMs（8s）
 * - IN_PROGRESS → 指數退避：8s → 16s → 32s → 60s（最多）
 * - FAILED → 立即拋出
 * - FINISHED → 完成
 * - 總超时 10 分鐘（maxWaitMs）
 *
 * @param {string} creationId - Container ID
 * @param {number} maxWaitMs  - 最大等待時間（預設 10 分鐘）
 */
async function waitForContainer(creationId, maxWaitMs = 600_000) {
    const baseMs   = 8_000;   // 首次重試間隔
    const maxMs    = 60_000;  // 最大間隔
    const start    = Date.now();
    let   attempt  = 0;
    let   interval = baseMs;

    while (Date.now() - start < maxWaitMs) {
        // 查詢狀態
        const res = await axios.get(
            `https://${IG_API_HOST}/${API_VER}/${creationId}`,
            { params: { fields: 'status_code', access_token: CONFIG.IG_TOKEN } }
        );
        const status   = res.data.status_code;
        const elapsed  = Math.round((Date.now() - start) / 1000);
        console.log(`[IG Container] status=${status}, elapsed=${elapsed}s, retry_in=${interval/1000}s`);

        if (status === 'FINISHED') {
            console.log('[IG Container] 圖片處理完成');
            return true;
        }

        if (status === 'FAILED') {
            throw new Error(`[IG Container] 圖片處理失敗（status=FAILED），請重新上傳`);
        }

        if (status === 'IN_PROGRESS') {
            attempt++;
            console.log(`[IG Container] 圖片仍在處理中，第 ${attempt} 次等待...`);
            await sleep(interval);
            // 指數退避，但最多 60s
            interval = Math.min(interval * 2, maxMs);
        } else {
            // 未知狀態，先等 baseMs 再重試
            console.log(`[IG Container] 未知狀態 '${status}'，等待後重試...`);
            await sleep(baseMs);
        }
    }

    // 總時限到，一次重試後放棄
    console.warn(`[IG Container] 已等待 ${Math.round((Date.now() - start) / 1000)}s，嘗試直接發布...`);
    return false; // caller 決定是否繼續
}

/**
 * 發布（附 9007 重試機制）
 * @param {string} creationId - 已就緒的 Container ID
 * @returns {string} - Post ID
 */
async function publishWithRetry(creationId) {
    const delays = [10_000, 20_000, 40_000]; // 3 次重試：10s / 20s / 40s

    for (let attempt = 0; attempt <= 3; attempt++) {
        if (attempt > 0) {
            console.log(`[IG] 9007 重試中（第 ${attempt}/3），等待 ${delays[attempt - 1] / 1000}s...`);
            await sleep(delays[attempt - 1]);
        }

        try {
            const res = await axios.post(
                `https://${IG_API_HOST}/${API_VER}/${CONFIG.IG_USER_ID}/media_publish`,
                { creation_id: creationId, access_token: CONFIG.IG_TOKEN }
            );
            return res.data.id;
        } catch (error) {
            const igError = error.response?.data?.error;
            const code    = igError?.code;
            const msg     = igError?.message || error.message;

            if (code !== 9007) {
                throw new Error(`[IG API 錯誤] 類型: ${igError?.type}, 訊息: ${msg}, 錯誤碼: ${code}`);
            }
            console.warn(`[IG] 9007（Media not ready，第 ${attempt} 次）：${msg}`);
        }
    }
    throw new Error('[IG] 發布重試 3 次後仍失敗，請登入 Meta Developer Dashboard 確認');
}

/**
 * 發布圖片至 Instagram
 *
 * Pipeline:
 *   Step 1:   建立 Media Container
 *   Step 1.5: 輪詢等待 Container FINISHED（指數退避，最多 10 分鐘）
 *   Step 2:   發布（附 9007 重試機制）
 *
 * @param {string} imageUrl - R2 公開圖片 URL
 * @param {string} caption  - IG 貼文文案
 * @returns {{ postId: string|null, containerId: string|null, timedOut: boolean }}
 */
export async function publishToInstagram(imageUrl, caption) {
    // Step 1: 建立 Media Container
    console.log('[IG] Step 1：建立 Media Container...');
    const containerRes = await axios.post(
        `https://${IG_API_HOST}/${API_VER}/${CONFIG.IG_USER_ID}/media`,
        { image_url: imageUrl, caption, access_token: CONFIG.IG_TOKEN }
    );
    const creationId = containerRes.data.id;
    console.log(`[IG] Container ID: ${creationId}`);

    // Step 1.5: 輪詢等待（指數退避）
    console.log('[IG] Step 1.5：輪詢圖片處理狀態（最多 10 分鐘）...');
    let timedOut = false;
    try {
        timedOut = !(await waitForContainer(creationId));
    } catch (err) {
        console.error(`[IG] Step 1.5 異常：${err.message}`);
        timedOut = true;
    }

    // Step 2: 發布（無論是否超時都試一次，有時處理完剛好來得及）
    console.log('[IG] Step 2：發布至塗鴉牆...');
    let postId = null;
    try {
        postId = await publishWithRetry(creationId);
        console.log(`[IG] 發布成功，Post ID: ${postId}`);
    } catch (err) {
        console.error(`[IG] Step 2 失敗：${err.message}`);
        throw err; // 讓 caller 決定
    }

    return { postId, containerId: creationId, timedOut };
}
