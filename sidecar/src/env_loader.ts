/**
 * env_loader.ts - 环境变量加载
 * 
 * 负责从多个可能的路径加载 .env 文件
 */

import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

// 可能的 .env 文件路径列表
const envPaths = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../resources/.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
];

let envLoaded = false;

/**
 * 加载环境变量
 * 尝试从多个路径加载 .env 文件
 * @returns 是否成功加载
 */
export function loadEnv(): boolean {
    if (envLoaded) return true;

    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            if (process.env.OSS_ACCESS_KEY_ID) {
                console.error(`[dotenv] Successfully loaded from: ${envPath}`);
                console.error(`[dotenv] OSS_ACCESS_KEY_ID: ${process.env.OSS_ACCESS_KEY_ID.substring(0, 4)}...`);
            }
            envLoaded = true;
            return true;
        }
    }

    console.error("[dotenv] No .env file found in any of these paths:");
    console.error(envPaths);
    return false;
}

/**
 * 获取 OpenRouter API Key
 */
export function getOpenRouterApiKey(): string {
    return process.env.OPENROUTER_API_KEY || '';
}

// 自动加载
loadEnv();
