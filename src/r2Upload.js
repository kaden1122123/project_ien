import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';
import { createBlob, createTree, createCommit, updateRef } from './githubUpload.js';
import dotenv from 'dotenv';

dotenv.config({ path: '/home/clawuser/.openclaw/.env' });
const env = process.env;

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const GITHUB_TOKEN = env.GITHUB_TOKEN;
const GITHUB_REPO  = 'kaden1122123/ien-images';
const GITHUB_BRANCH = 'main';

/**
 * Upload image buffer to GitHub via Git Data API, return raw CDN URL.
 * @param {Buffer} buffer - JPEG image buffer
 * @param {string} fileName - file name for GitHub
 * @returns {Promise<string>} GitHub raw CDN URL
 */
async function uploadToGitHub(buffer, fileName) {
  const objectKey = `ien-vision_image/${fileName}`;
  const blobSha  = await createBlob(buffer, GITHUB_TOKEN, GITHUB_REPO);
  const treeSha  = await createTree(objectKey, blobSha, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH);
  const commitSha = await createCommit(`Upload ${fileName}`, treeSha, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH);
  await updateRef(commitSha, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH);
  return `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${objectKey}`;
}

/**
 * Upload image buffer to Cloudflare R2, return public URL.
 * @param {Buffer} imageBuffer - JPEG image buffer
 * @returns {Promise<string>} public URL
 */
export async function uploadToR2(imageBuffer) {
  const fileName = `${uuidv4()}.jpg`;

  // Upload to R2 for archival
  await R2.send(new PutObjectCommand({
    Bucket: "insta-ienvision-claw",
    Key: `ien-vision_image/${fileName}`,
    Body: imageBuffer,
    ContentType: "image/jpeg",
  }));
  console.log(`[R2] Uploaded: ien-vision_image/${fileName}`);

  // Also upload to GitHub for Instagram URL (R2 URL is blocked by Meta crawler)
  const githubUrl = await uploadToGitHub(imageBuffer, fileName);
  console.log(`[GitHub] Uploaded: ${githubUrl}`);

  // Return GitHub URL since Instagram can reliably access it
  return githubUrl;
}
