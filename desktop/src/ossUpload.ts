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
    stsToken: string; // STS Security Token
    bucket: string;
    region: string;
    endpoint: string;
    expiration: string; // ISO date string
}

let ossClient: OSS | null = null;
let tokenExpireTime = 0;

/**
 * 获取 OSS STS 临时凭证
 */
export async function getOSSTempToken(): Promise<OSSTempToken> {
    const token = getStoredToken();
    if (!token) throw new Error('未登录');

    return apiRequest('/api/v1/oss/temp-token', {
        headers: { Authorization: `Bearer ${token}` },
    }) as Promise<OSSTempToken>;
}

/**
 * 清洗并标准化 endpoint
 */
function normalizeEndpoint(endpoint: string): string {
    let finalEndpoint = endpoint;

    // 移除协议头
    finalEndpoint = finalEndpoint.replace(/^https?:\/\//, '');

    // 移除所有 oss- 前缀
    while (finalEndpoint.startsWith('oss-')) {
        finalEndpoint = finalEndpoint.substring(4);
    }

    // 移除所有 .aliyuncs.com 后缀
    while (finalEndpoint.endsWith('.aliyuncs.com')) {
        finalEndpoint = finalEndpoint.substring(0, finalEndpoint.length - 13);
    }

    // 重建标准 Endpoint
    return `oss-${finalEndpoint}.aliyuncs.com`;
}

/**
 * 获取或创建 OSS Client (使用 STS 临时凭证)
 */
async function getOSSClient(): Promise<OSS> {
    const now = Date.now();

    // 如果 client 存在且未过期，直接返回
    if (ossClient && tokenExpireTime > now + 60000) {
        console.log('[OSS] Reusing existing client, expires in:', Math.round((tokenExpireTime - now) / 1000), 'seconds');
        return ossClient;
    }

    console.log('[OSS] Fetching new STS credentials...');

    // 获取新的 STS 凭证
    let tokenData: OSSTempToken;
    try {
        tokenData = await getOSSTempToken();
        console.log('[OSS] Received token data:', {
            hasAccessKeyId: !!tokenData.accessKeyId,
            hasAccessKeySecret: !!tokenData.accessKeySecret,
            hasStsToken: !!tokenData.stsToken,
            bucket: tokenData.bucket,
            region: tokenData.region,
            endpoint: tokenData.endpoint,
            expiration: tokenData.expiration,
        });
    } catch (err) {
        console.error('[OSS] Failed to get STS token:', err);
        throw new Error('获取OSS凭证失败: ' + (err instanceof Error ? err.message : String(err)));
    }

    // 检查必要字段
    if (!tokenData.accessKeyId || !tokenData.accessKeySecret) {
        throw new Error('OSS凭证不完整，请检查后端STS配置');
    }

    const cleanEndpoint = normalizeEndpoint(tokenData.endpoint || tokenData.region);
    const expirationTime = tokenData.expiration ? new Date(tokenData.expiration).getTime() : (now + 3600000);

    // 创建新的 OSS client (使用 STS 临时凭证)
    const clientConfig: any = {
        endpoint: cleanEndpoint,
        accessKeyId: tokenData.accessKeyId,
        accessKeySecret: tokenData.accessKeySecret,
        bucket: tokenData.bucket,
        secure: true, // 强制使用 HTTPS
    };

    // 只有在有 stsToken 时才添加 STS 相关配置
    if (tokenData.stsToken) {
        clientConfig.stsToken = tokenData.stsToken;
        clientConfig.refreshSTSToken = async () => {
            console.log('[OSS] Refreshing STS token...');
            const newCreds = await getOSSTempToken();
            return {
                accessKeyId: newCreds.accessKeyId,
                accessKeySecret: newCreds.accessKeySecret,
                stsToken: newCreds.stsToken,
            };
        };
        clientConfig.refreshSTSTokenInterval = 300000;
    } else {
        console.warn('[OSS] No STS token provided, using direct credentials (less secure)');
    }

    ossClient = new OSS(clientConfig);

    tokenExpireTime = expirationTime;

    return ossClient;
}

/**
 * 上传文件到 OSS (使用 ali-oss SDK)
 * @param file 要上传的文件
 * @returns 上传后的 URL
 */
export async function uploadToOSS(
    file: File
): Promise<string> {
    const client = await getOSSClient();

    // 生成唯一文件名
    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const objectKey = `uploads/${timestamp}-${randomStr}.${ext}`;

    try {
        const result = await client.put(objectKey, file);

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
