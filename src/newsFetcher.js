/**
 * i-En 財經新聞爬蟲
 * 使用方式: node newsFetcher.js
 * 匯入方式: import { fetchTodayNews } from './src/newsFetcher.js'
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const POSTED_TOPICS_FILE = join(DATA_DIR, 'posted_topics.json');

// ── 日期工具 ──────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
    .replace(/\//g, '-');
}

// ── posted_topics.json 管理 ───────────────────────────────
function loadPostedTopics() {
  if (!existsSync(POSTED_TOPICS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(POSTED_TOPICS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function savePostedTopics(data) {
  writeFileSync(POSTED_TOPICS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function markTopicPosted(dateStr, topic) {
  const data = loadPostedTopics();
  if (!data[dateStr]) data[dateStr] = [];
  if (!data[dateStr].includes(topic)) data[dateStr].push(topic);
  savePostedTopics(data);
}

// ── HTML 抓取 ──────────────────────────────────────────────
async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; i-En-Bot/1.0; +http://i-en.example/bot)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

// ── 經濟日報 (UDN Money) 爬蟲 ─────────────────────────────
async function fetchUDNNews() {
  const url = 'https://money.udn.com/money/index';
  const html = await fetchHTML(url);

  // 用 dynamic import 避免頂層 cheerio 意外crash
  const { load } = await import('cheerio');
  const $ = load(html);

  const candidates = [];

  // UDN 常見結構：<div class="category-list"> 內有新聞區塊
  // 標題多在 <a> 或 <h3> 內，包在特定容器中
  const selectors = [
    'div.category-list__item a',
    'div.balance-story__card a',
    'section.content-list a',
    'div.story__content a',
    'div.ranking-list__item a',
    'ul.list-bullet a',
    'div.tab-content a',
    'a[href*="/money/"]',
  ];

  let usedSelectors = [];

  for (const sel of selectors) {
    const items = $(sel);
    if (items.length === 0) continue;
    usedSelectors.push(sel);

    items.each((_, el) => {
      const $el = $(el);
      const title = $el.clone().children().remove().end().text().trim();
      const href = $el.attr('href') || '';
      const summary = $el.find('p').first().text().trim() ||
                      $el.parents('div').first().find('p').first().text().trim() ||
                      '';

      if (title && title.length > 5 && href) {
        // 補足相對路徑
        const fullUrl = href.startsWith('http') ? href : `https://money.udn.com${href}`;
        candidates.push({
          title: title.replace(/\s+/g, ' ').slice(0, 200),
          url: fullUrl,
          summary: summary.replace(/\s+/g, ' ').slice(0, 300),
          source: 'UDN',
        });
      }
    });

    if (candidates.length >= 5) break;
  }

  // 如果所有 selector 都找不到，取頁面上所有明顯的新聞連結
  if (candidates.length === 0) {
    $('a').each((_, el) => {
      const $el = $(el);
      const title = $el.text().trim();
      const href = $el.attr('href') || '';
      if (title.length > 10 && title.length < 200 && href &&
          (href.includes('money.udn.com') || href.startsWith('/'))) {
        const fullUrl = href.startsWith('http') ? href : `https://money.udn.com${href}`;
        candidates.push({
          title,
          url: fullUrl,
          summary: '',
          source: 'UDN',
        });
      }
    });
  }

  return candidates.slice(0, 5);
}

// ── 工商時報 (CTEE) 爬蟲 ─────────────────────────────────
async function fetchCTEENews() {
  const url = 'https://www.ctee.com.tw/';
  const html = await fetchHTML(url);

  const { load } = await import('cheerio');
  const $ = load(html);

  const candidates = [];

  const selectors = [
    'div.news-list__item a',
    'div.article-list a',
    'div.latest-news a',
    'section.content-list a',
    'ul.news-list a',
    'div.m-list a',
    'div.hot-news a',
    'a[href*="/ctee/"]',
    'a[href*=".ctee.com.tw"]',
  ];

  for (const sel of selectors) {
    const items = $(sel);
    if (items.length === 0) continue;

    items.each((_, el) => {
      const $el = $(el);
      const title = $el.clone().children().remove().end().text().trim();
      const href = $el.attr('href') || '';
      const summary = $el.find('p').first().text().trim() ||
                      $el.parents('div').first().find('p').first().text().trim() ||
                      '';

      if (title && title.length > 5 && href) {
        const fullUrl = href.startsWith('http') ? href : `https://www.ctee.com.tw${href}`;
        candidates.push({
          title: title.replace(/\s+/g, ' ').slice(0, 200),
          url: fullUrl,
          summary: summary.replace(/\s+/g, ' ').slice(0, 300),
          source: 'CTEE',
        });
      }
    });

    if (candidates.length >= 5) break;
  }

  if (candidates.length === 0) {
    $('a').each((_, el) => {
      const $el = $(el);
      const title = $el.text().trim();
      const href = $el.attr('href') || '';
      if (title.length > 10 && title.length < 200 && href &&
          (href.includes('ctee.com.tw') || href.startsWith('/'))) {
        const fullUrl = href.startsWith('http') ? href : `https://www.ctee.com.tw${href}`;
        candidates.push({
          title,
          url: fullUrl,
          summary: '',
          source: 'CTEE',
        });
      }
    });
  }

  return candidates.slice(0, 5);
}

// ── 主函式：取一篇今日未發表的新聞 ───────────────────────
/**
 * @returns {Promise<{title, url, summary, source}|null>}
 *   回傳一篇今日未發表的新聞；若今日主題已耗盡，回傳 null
 */
export async function fetchTodayNews() {
  const dateStr = todayStr();
  const posted = loadPostedTopics();
  const todayPosted = new Set(posted[dateStr] || []);

  let udnCandidates = [];
  let cteeCandidates = [];

  // 同時發請求（兩個來源各自獨立的錯誤不互相影響）
  const [udnErr, cteeErr] = await Promise.all([
    fetchUDNNews().then(r => { udnCandidates = r; return null; }).catch(e => e),
    fetchCTEENews().then(r => { cteeCandidates = r; return null; }).catch(e => e),
  ]);

  // 兩個都失敗
  if (udnErr && cteeErr) {
    throw new Error(`[newsFetcher] 兩個來源都失敗｜UDN: ${udnErr.message}｜CTEE: ${cteeErr.message}`);
  }

  // 合併候選（UDN 優先）
  const allCandidates = [...udnCandidates, ...cteeCandidates];

  // 過濾掉今日已發表的主題
  const fresh = allCandidates.filter(n => !todayPosted.has(n.title));

  if (fresh.length === 0) {
    // 主題已耗盡，整個 pipeline 應當日停止
    console.log('[newsFetcher] ✅ 今日主題已耗盡，回傳 null');
    return null;
  }

  // 隨機選一篇（比輪流更自然）
  const chosen = fresh[Math.floor(Math.random() * fresh.length)];

  // 標記為已發表
  markTopicPosted(dateStr, chosen.title);

  console.log(`[newsFetcher] 📰 取出｜來源: ${chosen.source}｜標題: ${chosen.title.slice(0, 40)}…`);
  return {
    title: chosen.title,
    url: chosen.url,
    summary: chosen.summary,
    source: chosen.source,
  };
}

// ── 獨立測試入口 ─────────────────────────────────────────
const isMainModule = process.argv[1]?.endsWith('newsFetcher.js');
if (isMainModule) {
  console.log(`[newsFetcher] 測試模式｜日期: ${todayStr()}`);
  fetchTodayNews()
    .then(news => {
      if (!news) {
        console.log('[newsFetcher] 今日無新主題可用');
      } else {
        console.log('[newsFetcher] 取得新聞:');
        console.log(JSON.stringify(news, null, 2));
      }
    })
    .catch(err => {
      console.error('[newsFetcher] 錯誤:', err.message);
      process.exit(1);
    });
}
