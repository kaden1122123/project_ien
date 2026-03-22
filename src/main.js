import dotenv from 'dotenv';
dotenv.config({ path: '/home/clawuser/.openclaw/.env' });

import { logger } from './logger.js';
import { getRecentContext, updateMemoryQueue } from './storage.js';
import { generateContent } from './brain.js';
import { generateImageBuffer } from './vision.js';
import { uploadToR2 } from './uploader.js';
import { publishToInstagram } from './publisher.js';

async function main() {
    logger.info('=== Project i-En (小艾) 喚醒 ===');
    try {
        const recentTopics = await getRecentContext();

        logger.info('[1/5] 大腦運算中 (MiniMax M2.7)...');
        const content = await generateContent(recentTopics);
        logger.info(`> 今日主題: ${content.topic_summary}`);

        logger.info('[2/5] 視覺渲染中 (MiniMax image-01)...');
        const imageBuffer = await generateImageBuffer(content.flux_prompt);

        logger.info('[3/5] 上傳至 Cloudflare R2...');
        const publicImageUrl = await uploadToR2(imageBuffer);
        logger.info(`> R2 網址: ${publicImageUrl}`);

        logger.info('[4/5] 發布至 Instagram Graph API...');
        const postId = await publishToInstagram(publicImageUrl, content.ig_caption);
        logger.info(`> 成功！IG 貼文 ID: ${postId}`);

        logger.info('[5/5] 寫入滑動視窗記憶體...');
        await updateMemoryQueue(content.topic_summary);

    } catch (error) {
        logger.fatal(`[致命錯誤]`, error?.response?.data || error.message);
    } finally {
        logger.info('=== i-En 進入深度休眠 ===\n');
    }
}

main();
