import { v4 as uuidv4 } from 'uuid';
import { uploadToR2 as doR2Upload } from './r2Upload.js';

/**
 * Push image buffer to Cloudflare R2 via r2Upload module.
 * @param {Buffer} imageBuffer - JPEG image buffer
 * @returns {Promise<string>} public R2 URL
 */
export async function uploadToR2(imageBuffer) {
    return doR2Upload(imageBuffer);
}
