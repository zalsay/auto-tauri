/**
 * ossUpload.ts - 阿里云 OSS 直传上传工具
 * 
 * 使用 ali-oss SDK 实现真正的 OSS 上传功能：
 * - 获取 OSS 凭证
 * - 上传文件到 OSS
 */

import { apiRequest, getStoredToken } from './api';
import OSS from 'ali-oss';

export interface OSSTempToken {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region: string;
    endpoint: string;
    expiredTime: number;
}

let ossClient: OSS | null = null;
let tokenExpireTime = 0;

/**
 * 获取 OSS 临时凭证
 */
export async function getOSSTempToken(): Promise<OSSTempToken> {
    const token = getStoredToken();
    if (!token) throw new Error('未登录');

    return apiRequest('/api/v1/oss/temp-token', {
        headers: { Authorization: `Bearer ${token}` },
    }) as Promise<OSSTempToken>;
}

/**
 * 获取或创建 OSS Client
 */
async function getOSSClient(): Promise<OSS> {
    const now = Date.now();

    // 如果 client 存在且未过期，直接返回
    if (ossClient && tokenExpireTime > now + 60000) {
        return ossClient;
    }

    // 获取新的凭证
    const tokenData = await getOSSTempToken();

    console.log('[OSS] Creating client with config:', {
        region: tokenData.region,
        endpoint: tokenData.endpoint,
        bucket: tokenData.bucket,
    });

    // 创建新的 OSS client - 使用 endpoint 而不是 region
    ossClient = new OSS({
        endpoint: tokenData.endpoint,
        accessKeyId: tokenData.accessKeyId,
        accessKeySecret: tokenData.accessKeySecret,
        bucket: tokenData.bucket,
    });

    tokenExpireTime = tokenData.expiredTime * 1000;

    return ossClient;
}

/**
 * 上传文件到 OSS (使用 ali-oss SDK)
 * @param file 要上传的文件
 * @param onProgress 进度回调 (0-100)
 * @returns 上传后的 URL
 */
export async function uploadToOSS(
    file: File,
    onProgress?: (percent: number) => void
): Promise<string> {
    const client = await getOSSClient();

    // 生成唯一文件名
    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const objectKey = `uploads/${timestamp}-${randomStr}.${ext}`;

    try {
        const result = await client.put(objectKey, file, {
            progress: (p: number) => {
                if (onProgress) {
                    onProgress(Math.round(p * 100));
                }
            },
        });

        // 返回公开访问 URL
        return result.url;
    } catch (error: any) {
        console.error('[OSS] 上传失败:', error);
        throw new Error(`上传失败: ${error.message}`);
    }
}

/**
 * 简易版 OSS 上传 (使用 SDK)
 * 直接调用 SDK 上传，失败时抛出错误
 */
export async function uploadToOSSSimple(file: File): Promise<string> {
    // Validate image file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(`不支持的文件格式: ${file.type}。请上传 JPG、PNG、GIF、WebP 等图片格式。`);
    }

    try {
        const url = await uploadToOSS(file);
        console.log('[OSS] 上传成功:', url);
        return url;
    } catch (e: any) {
        console.error('[OSS] 上传失败:', e);
        throw new Error(`图片上传失败: ${e.message || '请检查网络连接和 OSS 配置'}`);
    }
}
