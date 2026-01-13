/**
 * MCP Playwright 客户端
 * 通过 MCP 协议连接 Playwright Server 执行浏览器操作
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';

interface MCPMessage {
    jsonrpc: '2.0';
    id?: number;
    method?: string;
    params?: any;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

interface ToolResult {
    success: boolean;
    content: string;
    error?: string;
}

/**
 * MCP Playwright 客户端类
 */
export class MCPPlaywrightClient {
    private process: ChildProcess | null = null;
    private messageId = 0;
    private pendingRequests: Map<number, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    }> = new Map();
    private buffer = '';
    private initialized = false;

    /**
     * 启动 MCP Server
     */
    async start(): Promise<void> {
        if (this.process) {
            console.log('MCP Server 已在运行');
            return;
        }

        return new Promise((resolve, reject) => {
            // 启动 MCP Playwright Server
            this.process = spawn('npx', ['@executeautomation/playwright-mcp-server'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
            });

            this.process.stdout?.on('data', (data: Buffer) => {
                this.handleData(data.toString());
            });

            this.process.stderr?.on('data', (data: Buffer) => {
                console.log('MCP Server stderr:', data.toString());
            });

            this.process.on('error', (error) => {
                console.error('MCP Server 启动失败:', error);
                reject(error);
            });

            this.process.on('close', (code) => {
                console.log('MCP Server 已关闭, code:', code);
                this.process = null;
                this.initialized = false;
            });

            // 等待初始化
            setTimeout(async () => {
                try {
                    await this.initialize();
                    this.initialized = true;
                    console.log('MCP Playwright Server 已启动');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            }, 2000);
        });
    }

    /**
     * 处理 MCP 消息
     */
    private handleData(data: string): void {
        this.buffer += data;

        // 尝试解析完整的 JSON-RPC 消息
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const message: MCPMessage = JSON.parse(line);
                    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
                        const { resolve, reject } = this.pendingRequests.get(message.id)!;
                        this.pendingRequests.delete(message.id);

                        if (message.error) {
                            reject(new Error(message.error.message));
                        } else {
                            resolve(message.result);
                        }
                    }
                } catch (e) {
                    // 不是 JSON，忽略
                }
            }
        }
    }

    /**
     * 发送 MCP 请求
     */
    private async sendRequest(method: string, params: any = {}): Promise<any> {
        if (!this.process?.stdin) {
            throw new Error('MCP Server 未启动');
        }

        const id = ++this.messageId;
        const message: MCPMessage = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('请求超时'));
                }
            }, 30000);

            this.process!.stdin!.write(JSON.stringify(message) + '\n');
        });
    }

    /**
     * 初始化 MCP 连接
     */
    private async initialize(): Promise<void> {
        await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'auto-tauri-agent',
                version: '1.0.0',
            },
        });
    }

    /**
     * 获取可用工具列表
     */
    async listTools(): Promise<any[]> {
        const result = await this.sendRequest('tools/list', {});
        return result.tools || [];
    }

    /**
     * 调用工具
     */
    async callTool(name: string, args: Record<string, any>): Promise<ToolResult> {
        try {
            const result = await this.sendRequest('tools/call', {
                name,
                arguments: args,
            });

            return {
                success: true,
                content: typeof result.content === 'string'
                    ? result.content
                    : JSON.stringify(result.content, null, 2),
            };
        } catch (error: any) {
            return {
                success: false,
                content: '',
                error: error.message,
            };
        }
    }

    /**
     * 浏览器操作便捷方法
     */
    async navigate(url: string): Promise<ToolResult> {
        return this.callTool('browser_navigate', { url });
    }

    async click(selector: string): Promise<ToolResult> {
        return this.callTool('browser_click', { selector });
    }

    async type(selector: string, text: string): Promise<ToolResult> {
        return this.callTool('browser_type', { selector, text });
    }

    async screenshot(): Promise<ToolResult> {
        return this.callTool('browser_screenshot', {});
    }

    async getText(selector: string): Promise<ToolResult> {
        return this.callTool('browser_get_text', { selector });
    }

    async waitForSelector(selector: string): Promise<ToolResult> {
        return this.callTool('browser_wait', { selector });
    }

    /**
     * 停止 MCP Server
     */
    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill();
            this.process = null;
            this.initialized = false;
            console.log('MCP Server 已停止');
        }
    }

    /**
     * 检查是否已初始化
     */
    isReady(): boolean {
        return this.initialized;
    }
}

// 单例实例
export const mcpClient = new MCPPlaywrightClient();
