/**
 * browser_launcher.ts - 浏览器启动/CDP连接管理
 * 
 * 提供 CDP Stealth 模式的浏览器连接：
 * - 避免 navigator.webdriver = true
 * - 保留用户真实 Cookies、历史记录、插件
 * - 完全真实的浏览器指纹
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { log, sleep } from './utils';

const CDP_PORT = 9222;
const CDP_ENDPOINT = `http://127.0.0.1:${CDP_PORT}`;

// Chrome 可执行文件路径 (macOS)
const CHROME_PATHS = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
];

// 用户数据目录
const USER_DATA_DIR = path.join(os.homedir(), '.auto-tauri', 'browser-profile');

let chromeProcess: ChildProcess | null = null;

/**
 * 获取 Chrome 可执行文件路径
 */
function getChromePath(): string | null {
    for (const chromePath of CHROME_PATHS) {
        if (fs.existsSync(chromePath)) {
            return chromePath;
        }
    }
    return null;
}

/**
 * 检查 CDP 端口是否可用
 */
async function isCDPAvailable(): Promise<boolean> {
    try {
        const response = await fetch(`${CDP_ENDPOINT}/json/version`);
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * 启动 Chrome 进程 (带 CDP 端口)
 */
async function launchChrome(): Promise<void> {
    const chromePath = getChromePath();
    if (!chromePath) {
        throw new Error('Chrome 未找到，请安装 Google Chrome');
    }

    // 确保用户数据目录存在
    if (!fs.existsSync(USER_DATA_DIR)) {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    log(`[BrowserLauncher] 正在启动 Chrome (CDP 模式)...`);
    log(`[BrowserLauncher] Chrome 路径: ${chromePath}`);
    log(`[BrowserLauncher] 用户数据目录: ${USER_DATA_DIR}`);

    chromeProcess = spawn(chromePath, [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
    ], {
        detached: true,
        stdio: 'ignore'
    });

    chromeProcess.unref();

    // 等待 CDP 端口就绪
    log(`[BrowserLauncher] 等待 CDP 端口就绪...`);
    let retries = 0;
    const maxRetries = 20;
    while (retries < maxRetries) {
        if (await isCDPAvailable()) {
            log(`[BrowserLauncher] CDP 端口已就绪`);
            return;
        }
        await sleep(500);
        retries++;
    }

    throw new Error('Chrome 启动超时');
}

/**
 * 通过 CDP 连接到浏览器
 */
export async function connectCDP(): Promise<Browser> {
    // 检查是否已有浏览器运行
    if (await isCDPAvailable()) {
        log(`[BrowserLauncher] 检测到已运行的 Chrome，正在连接...`);
    } else {
        // 启动新浏览器
        await launchChrome();
    }

    // 连接到浏览器
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    log(`[BrowserLauncher] 已通过 CDP 连接到浏览器`);
    return browser;
}

/**
 * 获取或创建页面
 */
export async function getOrCreatePage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const contexts = browser.contexts();

    if (contexts.length > 0) {
        const context = contexts[0];
        const pages = context.pages();
        if (pages.length > 0) {
            log(`[BrowserLauncher] 使用现有页面`);
            return { context, page: pages[0] };
        }
        log(`[BrowserLauncher] 在现有上下文中创建新页面`);
        const page = await context.newPage();
        return { context, page };
    }

    // 如果没有上下文，创建一个新的
    log(`[BrowserLauncher] 创建新的浏览器上下文和页面`);
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    return { context, page };
}

/**
 * 确保浏览器连接并返回页面
 * 这是主要的入口函数
 */
export async function ensureBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    const browser = await connectCDP();
    const { context, page } = await getOrCreatePage(browser);
    return { browser, context, page };
}

/**
 * 关闭浏览器连接 (不关闭浏览器进程)
 */
export async function disconnectBrowser(browser: Browser): Promise<void> {
    try {
        // 断开连接而不关闭浏览器
        await browser.close();
        log(`[BrowserLauncher] 已断开浏览器连接`);
    } catch (e: any) {
        log(`[BrowserLauncher] 断开连接时出错: ${e.message}`);
    }
}

/**
 * 强制关闭浏览器进程
 */
export function killBrowser(): void {
    if (chromeProcess) {
        chromeProcess.kill();
        chromeProcess = null;
        log(`[BrowserLauncher] 已终止 Chrome 进程`);
    }
}

// 导出常量
export { CDP_PORT, CDP_ENDPOINT, USER_DATA_DIR };
