import fs from 'fs/promises';
import { CONFIG } from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// 模組 A：FIFO 滑動視窗記憶體（既有，完全保留）
// ─────────────────────────────────────────────────────────────────────────────

export async function getRecentContext() {
    try {
        const data = await fs.readFile(CONFIG.MEMORY_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw new Error(`[Storage Error] 記憶體讀取失敗: ${error.message}`);
    }
}

export async function updateMemoryQueue(newTopicSummary) {
    let queue = await getRecentContext();

    queue.push(newTopicSummary);

    while (queue.length > CONFIG.MEMORY_LIMIT) {
        queue.shift();
    }

    await fs.writeFile(CONFIG.MEMORY_FILE_PATH, JSON.stringify(queue, null, 2), 'utf-8');
    return queue;
}

// ─────────────────────────────────────────────────────────────────────────────
// 模組 B：檔案存檔（新增）
// ─────────────────────────────────────────────────────────────────────────────

import { archiveRecord as _archiveRecord } from './outputArchiver.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_BASE = join(__dirname, '..', 'output');
const INDEX_FILE  = join(OUTPUT_BASE, 'index.json');

/**
 * 封裝 outputArchiver.js 的 archiveRecord，統一從 storage.js 匯出。
 * 參數格式與 outputArchiver.js archiveRecord 相同。
 */
export { _archiveRecord as archiveRecord };

/**
 * 從指定 URL 抓取完整文章內容（作者、正文）
 * 使用 cheerio 解析文章頁面結構
 * @param {string} url - 文章網址
 * @returns {Promise<{author: string, content: string}>}
 */
export async function fetchFullArticle(url) {
    // 先嘗試從快取拿（optional enhancement）
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; i-En-Bot/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        },
    });
    if (!res.ok) throw new Error(`[fetchFullArticle] HTTP ${res.status} from ${url}`);
    const html = await res.text();

    const { load } = await import('cheerio');
    const $ = load(html);

    // 常見作者標籤（UDN / CTEE 及其他）
    const authorSelectors = [
        'meta[name="author"]',
        'meta[property="article:author"]',
        '[itemprop="author"]',
        '.author-name',
        '.article-author',
        '.reporter',
        '.editor',
        'span[itemprop="name"]',
    ];

    let author = '';
    for (const sel of authorSelectors) {
        const val = $(sel).first().attr('content') ||
                    $(sel).first().attr('itemprop') ||
                    $(sel).first().text().trim();
        if (val && val.length < 100) {
            author = val;
            break;
        }
    }

    // 常見文章內容區塊
    const contentSelectors = [
        '[itemprop="articleBody"]',
        '.article-content',
        '.article-body',
        '.story-content',
        '#story-body',
        'article',
        '.post-content',
    ];

    let content = '';
    for (const sel of contentSelectors) {
        const el = $(sel).first();
        if (el.length) {
            // 拿純文字，保留段落間的空行
            content = el.find('p').map((_, p) => $(p).text().trim()).get()
                      .filter(t => t.length > 0)
                      .join('\n\n');
            if (content.length > 100) break;
        }
    }

    // fallback：取整個 body 的文字
    if (!content || content.length < 100) {
        content = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000);
    }

    return { author, content };
}

/**
 * 讀取全局 index.json，無則回傳空陣列。
 * @returns {Promise<Array>}
 */
export async function getArchiveIndex() {
    try {
        const raw = await fs.readFile(INDEX_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}