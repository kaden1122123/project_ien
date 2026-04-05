import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_BASE = join(__dirname, '..', 'output');
const IMAGES_DIR  = join(OUTPUT_BASE, 'images');

// ─── slugify ──────────────────────────────────────────────────────────────────
/**
 * 將任意字串轉換為 safe filename（不帶副檔名）
 * 保留中文、英文、數字；去掉空白替為 _；移除 / \ | 等危險字元
 * 長度上限 50 字元（避免檔名過長）
 */
export function slugify(text) {
    return text
        .replace(/[^\w\u4e00-\u9fff-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 50) || 'untitled';
}

// ─── 目錄初始化 ─────────────────────────────────────────────────────────────
async function ensureDirs() {
    // output/YYYY-MM/
    // output/images/YYYY-MM/
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm  = String(now.getMonth() + 1).padStart(2, '0');

    for (const dir of [
        join(OUTPUT_BASE, `${yyyy}-${mm}`),
        join(IMAGES_DIR,  `${yyyy}-${mm}`),
    ]) {
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }
    return { yyyy, mm };
}

// ─── 圖片寫入（base64 → .jpg）───────────────────────────────────────────────
/**
 * 將 base64 字串解碼寫入磁碟
 * @param {string} base64Data  - data:image/jpeg;base64,xxxx 或純 base64 字串
 * @param {string} filePath    - 目標路徑
 */
async function saveImageFromBase64(base64Data, filePath) {
    // 去掉 data URI prefix（如果有的話）
    const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    await fs.writeFile(filePath, buffer);
}

// ─── YAML frontmatter 建構 ───────────────────────────────────────────────────
/**
 * @param {Object} params
 * @param {Object} params.news         - { title, url, summary, source, author, content }
 * @param {Object} params.content       - { topic_summary, flux_prompt, ig_caption }
 * @param {string} params.imageLocalPath - 相對於 output/ 的圖片路徑（如 images/2026-04/xxx.jpg）
 * @param {string} params.r2Url        - R2 CDN URL
 * @param {string} params.postId       - Instagram post ID
 */
function buildFrontmatter({ news, content, imageLocalPath, r2Url, postId }) {
    const lines = [
        '---',
        `pipeline_date: "${new Date().toISOString().split('T')[0]}"`,
        `pipeline_timestamp: "${new Date().toISOString()}"`,
        '',
        'news:',
        `  title: "${_escapeYAML(news.title)}"`,
        `  url: "${news.url}"`,
        `  summary: "${_escapeYAML(news.summary)}"`,
        `  source: "${news.source}"`,
        news.author ? `  author: "${_escapeYAML(news.author)}"` : null,
        '',
        'content:',
        `  topic_summary: "${_escapeYAML(content.topic_summary)}"`,
        `  flux_prompt: |`,
        ...content.flux_prompt.split('\n').map(l => `    ${l}`),
        `  ig_caption: |`,
        ...content.ig_caption.split('\n').map(l => `    ${l}`),
        '',
        'image:',
        `  local_path: "${imageLocalPath}"`,
        `  r2_url: "${r2Url}"`,
        '',
        'ig:',
        `  post_id: "${postId}"`,
        '---',
    ].filter(line => line !== null);

    return lines.join('\n');
}

function _escapeYAML(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}

// ─── Atomic write ────────────────────────────────────────────────────────────
async function atomicWrite(filePath, content) {
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
}

// ─── 主函式：存檔單筆 Pipeline 輸出 ────────────────────────────────────────
/**
 * 在 Pipeline Stage 4（IG 發布成功）後呼叫。
 * Pipeline 失敗時不呼叫（不存 partial output）。
 *
 * @param {Object} params
 * @param {Object} params.news         - newsFetcher 的完整輸出（含 author/content 由 fetchFullArticle 擴展）
 * @param {Object} params.content      - brain.js 的輸出 { topic_summary, flux_prompt, ig_caption }
 * @param {string} params.imageBase64  - vision.js 輸出的完整 base64 字串（不帶 data URI prefix）
 * @param {string} params.publicImageUrl - R2 CDN URL（uploader.js 回傳值）
 * @param {string} params.postId       - Instagram post ID（publisher.js 回傳值）
 */
export async function archiveRecord({ news, content, imageBase64, publicImageUrl, postId }) {
    // 1. 初始化目錄
    const { yyyy, mm } = await ensureDirs();

    // 2. 建立 slug 與日期前輟
    const dateStr  = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const slug     = slugify(content.topic_summary);
    const baseName = `${dateStr}_${slug}`;

    // 3. 儲存圖片（base64 → images/YYYY-MM/{date}_{slug}.jpg）
    const imageFileName = `${baseName}.jpg`;
    const imageDir      = join(IMAGES_DIR, `${yyyy}-${mm}`);
    const imagePath     = join(imageDir, imageFileName);
    const imageLocalPath = `images/${yyyy}-${mm}/${imageFileName}`;

    await saveImageFromBase64(imageBase64, imagePath);

    // 4. 建構 YAML frontmatter
    const frontmatter = buildFrontmatter({
        news,
        content,
        imageLocalPath,
        r2Url: publicImageUrl,
        postId,
    });

    // 5. 建構 Markdown body（純文字內容）
    const body = [
        `## ${news.title}`,
        '',
        `**來源：** ${news.source}（${news.url}）`,
        news.author ? `**作者：** ${news.author}` : null,
        '',
        `### 📝 主題摘要`,
        content.topic_summary,
        '',
        `### 🖼️ 圖片生成 Prompt（flux_prompt）`,
        '```',
        content.flux_prompt,
        '```',
        '',
        `### 📣 Instagram 貼文文案（ig_caption）`,
        content.ig_caption,
        '',
        `### 🌐 完整文章內容`,
        news.content || '(無完整內容)',
        '',
        `---`,
        `**Pipeline 執行時間：** ${new Date().toISOString()}`,
        `**IG Post ID：** ${postId}`,
        `**R2 URL：** ${publicImageUrl}`,
        `**圖片本地路徑：** ${imageLocalPath}`,
    ].filter(l => l !== null).join('\n');

    // 6. 寫入 .md 檔（atomic）
    const mdFileName = `${baseName}.md`;
    const mdPath     = join(OUTPUT_BASE, `${yyyy}-${mm}`, mdFileName);
    await atomicWrite(mdPath, `${frontmatter}\n\n${body}`);

    console.log(`[outputArchiver] ✅ 已存檔：${yyyy}-${mm}/${mdFileName}`);
    return mdPath;
}