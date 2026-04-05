import dotenv from 'dotenv';
dotenv.config({ path: '/home/clawuser/.openclaw/.env' });

import { logger } from './logger.js';
import { fetchTodayNews } from './newsFetcher.js';
import { generateContent } from './brain.js';
import { generateImageBuffer } from './vision.js';
import { uploadToR2 } from './uploader.js';
import { publishToInstagram } from './publisher.js';
import { updateMemoryQueue, fetchFullArticle } from './storage.js';
import { archiveRecord } from './outputArchiver.js';

async function main() {
    logger.info('=== Project i-En v2.0（財經貓咪版）啟動 ===');

    let news = null;
    let content = null;
    let imageBuffer = null;

    try {
        // [0/5] 抓取今日財經新聞
        logger.info('[0/5] 抓取今日財經新聞...');
        news = await fetchTodayNews();

        if (!news) {
            logger.info('【！】今日主題已耗盡，Pipeline 停止');
            logger.info('=== i-En 進入休眠 ===');
            return;
        }

        logger.info(`[0/5] 📰 ${news.source}｜${news.title.slice(0, 40)}...`);

        // [0.5/5] 同步抓取完整文章內容（作者、正文）
        logger.info('[0.5/5] 抓取完整文章內容...');
        try {
            const { author, content: articleContent } = await fetchFullArticle(news.url);
            news.author = author;
            news.content = articleContent;
            logger.info(`> 作者: ${author || '(未知)'}｜內容: ${(articleContent || '').length} 字`);
        } catch (err) {
            logger.warn(`[0.5/5] 完整文章抓取失敗，降級使用 summary：${err.message}`);
            news.author = '';
            news.content = news.summary;
        }

        // [1/5] 產生內容（根據新聞生成）
        logger.info('[1/5] 小艾 Brain 分析中...');
        content = await generateContent(news);
        logger.info(`> 主題：${content.topic_summary}`);

        // [2/5] 生成圖片
        logger.info('[2/5] 生成圖片中...');
        imageBuffer = await generateImageBuffer(content.flux_prompt);

        // [3/5] 上傳 R2
        logger.info('[3/5] 上傳至 Cloudflare R2...');
        const publicImageUrl = await uploadToR2(imageBuffer);
        logger.info(`> R2 網址: ${publicImageUrl}`);

        // [4/5] 發布 IG
        logger.info('[4/5] 發布至 Instagram...');
        const postId = await publishToInstagram(publicImageUrl, content.ig_caption);
        logger.info(`> IG 貼文 ID: ${postId}`);

        // [5/5] 寫入檔案存檔（Pipeline 成功才執行）
        logger.info('[5/5] 存檔至 output/...');
        const imageBase64 = imageBuffer.toString('base64');
        await archiveRecord({ news, content, imageBase64, publicImageUrl, postId });

        // [6/5] 寫入滑動視窗記憶體
        logger.info('[6/5] 寫入滑動視窗記憶體...');
        await updateMemoryQueue(content.topic_summary);

    } catch (error) {
        const detail = error?.response?.data
            ? JSON.stringify(error.response.data, null, 2)
            : error.message;
        logger.fatal(`[致命錯誤] ${detail}`);
    } finally {
        logger.info('=== i-En 進入休眠 ===\n');
    }
}

main();