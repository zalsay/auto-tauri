/**
 * utils.ts - 公共工具函数
 * 
 * 提供 Sidecar 中通用的辅助函数
 */

/**
 * 输出结构化日志到 stderr
 * @param message 日志消息
 */
export function log(message: string): void {
    console.error(JSON.stringify({ type: 'log', message, timestamp: new Date().toISOString() }));
}

/**
 * 异步延时
 * @param ms 毫秒数
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
