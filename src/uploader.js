import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from './config.js';

// 驗證 R2 初始化成功
if (!CONFIG.R2.ACCESS_KEY || !CONFIG.R2.SECRET_KEY || !CONFIG.R2.BUCKET) {
    throw new Error(`[Uploader 初始化錯誤] R2 憑證不完整。ACCESS_KEY=${CONFIG.R2.ACCESS_KEY}, SECRET_KEY=${CONFIG.R2.SECRET_KEY}, BUCKET=${CONFIG.R2.BUCKET}`);
}

const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${CONFIG.R2.ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: CONFIG.R2.ACCESS_KEY,
        secretAccessKey: CONFIG.R2.SECRET_KEY,
    },
});

export async function uploadToR2(imageBuffer) {
    const fileName = `${uuidv4()}.jpg`; // 產生隨機檔名 e.g., a1b2c3d4.jpg
    const objectKey = `ien-vision_image/${fileName}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: CONFIG.R2.BUCKET,
        Key: objectKey,
        Body: imageBuffer,
        ContentType: "image/jpeg"
    }));

    return `${CONFIG.R2.PUBLIC_URL}/${fileName}`;
}
