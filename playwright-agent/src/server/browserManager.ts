import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserState } from '../types';
import path from 'path';
import os from 'os';

/**
 * 浏览器管理器
 * 管理 Playwright 浏览器实例，支持持久化登录态
 */
export class BrowserManager {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private profilePath: string;

    constructor() {
        // 使用项目约定的持久化路径
        this.profilePath = path.join(os.homedir(), '.auto-tauri', 'browser-profile');
    }

    /**
     * 清理浏览器锁文件
     */
    private async cleanLockFiles(): Promise<void> {
        const fs = await import('fs/promises');
        const lockFiles = [
            path.join(this.profilePath, 'Default', 'SingletonLock'),
            path.join(this.profilePath, 'Default', 'SingletonSocket'),
            path.join(this.profilePath, 'Default', 'SingletonCookie'),
        ];
        for (const file of lockFiles) {
            try {
                await fs.unlink(file);
            } catch {
                // 文件不存在，忽略
            }
        }
    }

    /**
     * 启动浏览器
     */
    async launch(headless: boolean = false): Promise<Page> {
        // 如果已经有有效的页面和上下文，直接返回
        if (this.page && this.context) {
            try {
                // 检查页面是否仍然有效
                await this.page.title();
                return this.page;
            } catch {
                // 页面已失效，需要重新启动
                this.page = null;
                this.context = null;
            }
        }

        // 尝试清理可能的锁文件
        await this.cleanLockFiles();

        try {
            // 使用持久化上下文以保持登录态
            this.context = await chromium.launchPersistentContext(this.profilePath, {
                headless,
                slowMo: 50,
                viewport: { width: 1280, height: 720 },
                locale: 'zh-CN',
                timezoneId: 'Asia/Shanghai',
            });

            // 获取或创建页面
            const pages = this.context.pages();
            this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

            console.log('浏览器已启动，使用持久化 profile:', this.profilePath);
            return this.page;
        } catch (error: any) {
            console.error('持久化 profile 启动失败，尝试临时模式:', error.message);

            // Fallback: 使用临时 context（不保持登录态）
            const browser = await chromium.launch({
                headless,
                slowMo: 50,
            });
            this.context = await browser.newContext({
                viewport: { width: 1280, height: 720 },
                locale: 'zh-CN',
                timezoneId: 'Asia/Shanghai',
            });
            this.page = await this.context.newPage();

            console.log('浏览器已启动（临时模式）');
            return this.page;
        }
    }

    /**
     * 获取当前页面
     */
    getPage(): Page | null {
        return this.page;
    }

    /**
     * 获取浏览器状态
     */
    async getState(): Promise<BrowserState> {
        if (!this.page) {
            return {
                url: '',
                title: '',
                isLoading: false,
            };
        }

        return {
            url: this.page.url(),
            title: await this.page.title(),
            isLoading: false,
        };
    }

    /**
     * 执行操作
     */
    async executeAction(action: string, params: Record<string, any>): Promise<any> {
        if (!this.page) {
            throw new Error('浏览器未启动');
        }

        switch (action) {
            case 'navigate':
                await this.page.goto(params.url, { waitUntil: 'domcontentloaded' });
                break;

            case 'click':
                await this.page.click(params.selector);
                break;

            case 'fill':
                await this.page.fill(params.selector, params.value);
                break;

            case 'screenshot':
                const screenshot = await this.page.screenshot({ type: 'png' });
                return screenshot.toString('base64');

            case 'wait':
                await this.page.waitForTimeout(params.ms || 1000);
                break;

            case 'scroll':
                if (params.direction === 'bottom') {
                    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                } else if (params.direction === 'top') {
                    await this.page.evaluate(() => window.scrollTo(0, 0));
                } else {
                    await this.page.evaluate((y) => window.scrollBy(0, y), params.amount || 500);
                }
                break;
        }

        return await this.getState();
    }

    /**
     * 获取 CDP WebSocket 端点（用于前端 DevTools 连接）
     */
    async getCDPEndpoint(): Promise<string | null> {
        if (this.browser) {
            // 注意：持久化上下文模式下 CDP 端点获取方式不同
            return null;
        }
        return null;
    }

    /**
     * 关闭浏览器
     */
    async close(): Promise<void> {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.page = null;
    }
}

export const browserManager = new BrowserManager();
