import fs from 'fs/promises';
import { CONFIG } from './config.js';

export async function getRecentContext() {
    try {
        const data = await fs.readFile(CONFIG.MEMORY_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // 若檔案不存在 (如：系統第一次啟動，或檔案意外遺失)，初始化為空陣列
        if (error.code === 'ENOENT') {
            return [];
        }
        throw new Error(`[Storage Error] 記憶體讀取失敗: ${error.message}`);
    }
}

export async function updateMemoryQueue(newTopicSummary) {
    let queue = await getRecentContext();

    // 將新觀察加入佇列尾端 (Push)
    queue.push(newTopicSummary);

    // 若長度超過限制，從前端移除最舊的記憶 (Shift, FIFO 演算法)
    while (queue.length > CONFIG.MEMORY_LIMIT) {
        queue.shift();
    }

    // 將更新後的佇列存回 JSON 檔案中，保持格式化以利人類檢查
    await fs.writeFile(CONFIG.MEMORY_FILE_PATH, JSON.stringify(queue, null, 2), 'utf-8');
    return queue;
}
