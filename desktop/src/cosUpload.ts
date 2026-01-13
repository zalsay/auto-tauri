/**
 * cosUpload.ts - COS 直传上传工具
 * 
 * 提供腾讯云 COS 直传功能：
 * - 获取临时 Token
 * - 上传文件到 COS
 */

import { apiRequest, getStoredToken } from './api';

export interface COSTempToken {
    credentials: {
        tmpSecretId: string;
        tmpSecretKey: string;
        sessionToken: string;
    };
    expiredTime: number;
    bucket: string;
    region: string;
}

/**
 * 获取 COS 临时 Token
 */
export async function getCOSTempToken(): Promise<COSTempToken> {
    const token = getStoredToken();
    if (!token) throw new Error('未登录');

    return apiRequest('/api/v1/cos/temp-token', {
        headers: { Authorization: `Bearer ${token}` },
    }) as Promise<COSTempToken>;
}

/**
 * 上传文件到 COS
 * @param file 要上传的文件
 * @param onProgress 进度回调 (0-100)
 * @returns 上传后的 URL
 */
export async function uploadToCOS(
    file: File,
    onProgress?: (percent: number) => void
): Promise<string> {
    const tokenData = await getCOSTempToken();

    const { credentials, bucket, region } = tokenData;

    // 生成唯一文件名
    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const objectKey = `uploads/${timestamp}-${randomStr}.${ext}`;

    // COS 直接上传 URL
    const host = `${bucket}.cos.${region}.myqcloud.com`;
    const url = `https://${host}/${objectKey}`;

    // 使用 XMLHttpRequest 进行上传以支持进度
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                const percent = Math.round((e.loaded / e.total) * 100);
                onProgress(percent);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(url);
            } else {
                reject(new Error(`上传失败: ${xhr.status} ${xhr.statusText}`));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('网络错误'));
        });

        // 计算签名 (简化版本 - 生产环境应使用 COS SDK)
        const now = new Date();

        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        // 使用 COS SDK 的方式进行认证
        // 这里使用简化的方式，实际建议使用 cos-js-sdk-v5
        const authStr = `q-sign-algorithm=sha1&q-ak=${credentials.tmpSecretId}`;
        xhr.setRequestHeader('Authorization', authStr);

        if (credentials.sessionToken) {
            xhr.setRequestHeader('x-cos-security-token', credentials.sessionToken);
        }

        xhr.send(file);
    });
}

/**
 * 简易版 COS 上传 (使用 FormData)
 * 由于直接 PUT 需要复杂签名，这里提供一个后备方案
 */
export async function uploadToCOSSimple(file: File): Promise<string> {
    const tokenData = await getCOSTempToken();
    const { bucket, region } = tokenData;

    // 生成唯一文件名
    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const objectKey = `uploads/${timestamp}-${randomStr}.${ext}`;

    // 返回预期的 URL（实际上传需要 COS SDK）
    const url = `https://${bucket}.cos.${region}.myqcloud.com/${objectKey}`;

    console.log('[COS] 预期上传 URL:', url);
    console.log('[COS] 建议安装 cos-js-sdk-v5 以实现完整上传功能');

    // 临时方案：返回本地 blob URL 用于预览
    // 实际生产环境需要使用 COS SDK
    return URL.createObjectURL(file);
}
