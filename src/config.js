import dotenv from 'dotenv';

const result = dotenv.config({ path: '/home/clawuser/.openclaw/.env' });
const env = result.parsed || {};

export const CONFIG = {
    MINIMAX_KEY: env.MINIMAX_API_KEY,
    IG_TOKEN: env.META_INSTAGRAM_API_KEY,
    IG_USER_ID: env.IG_USER_ID,
    MEMORY_LIMIT: parseInt(env.MEMORY_LIMIT || '5', 10),
    MEMORY_FILE_PATH: env.DATA_DIR,
    R2: {
        ACCOUNT_ID: env.R2_ACCOUNT_ID,
        ACCESS_KEY: env.R2_ACCESS_KEY_ID,
        SECRET_KEY: env.R2_SECRET_ACCESS_KEY,
        BUCKET: env.R2_BUCKET_NAME,
        PUBLIC_URL: env.R2_PUBLIC_URL
    }
};
