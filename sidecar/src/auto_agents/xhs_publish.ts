import { BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const log = (msg: string) => console.error(JSON.stringify({ type: 'log', message: `[XHS Publish] ${msg}`, timestamp: new Date().toISOString() }));

export interface XHSPublishConfig {
    imagePathOrUrl: string;
    title: string;
    content: string;
}

async function downloadImage(context: BrowserContext, url: string): Promise<string> {
    const tmpDir = path.join(process.cwd(), 'tmp_assets');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const localPath = path.join(tmpDir, `downloaded_${Date.now()}.png`);
    
    log(`Downloading image from ${url}...`);
    const response = await context.request.get(url);
    if (!response.ok()) {
        throw new Error(`Failed to download image: ${response.status()} ${response.statusText()}`);
    }
    const buffer = await response.body();
    fs.writeFileSync(localPath, buffer);
    return localPath;
}

export async function publishToXHS(context: BrowserContext, config: XHSPublishConfig) {
    if (!config.imagePathOrUrl) {
        throw new Error("小红书发布需要至少一张图片。请选择图片素材或为文本素材提供图片 URL。");
    }

    let localImagePath = config.imagePathOrUrl;
    
    if (config.imagePathOrUrl.startsWith('http')) {
        localImagePath = await downloadImage(context, config.imagePathOrUrl);
    }

    if (!fs.existsSync(localImagePath)) {
        throw new Error(`Image file not found: ${localImagePath}`);
    }

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        log("Navigating to Xiaohongshu Creator Center...");
        await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'networkidle', timeout: 60000 });

        const checkPublishPage = () => page.url().includes('/publish/publish');

        if (!checkPublishPage()) {
            log("Waiting for user to reach the Publish page...");
            // Wait for up to 2 minutes for login
            const startTime = Date.now();
            while (!checkPublishPage()) {
                if (Date.now() - startTime > 120000) {
                    throw new Error("Timeout waiting for Publish page. Please login manually.");
                }
                try {
                    await page.waitForURL('**/publish/publish', { timeout: 5000 });
                } catch (e) {
                    if (!checkPublishPage()) {
                        log("Still waiting for Publish page (Manual login might be needed)...");
                    }
                }
            }
            log("Target page detected!");
        }

        log("Selecting '上传图文' tab...");
        const imageTab = page.getByText('上传图文', { exact: true }).first();
        if (await imageTab.isVisible()) {
            await imageTab.dispatchEvent('click');
            await page.waitForTimeout(2000);
        }

        log("Uploading image...");
        const fileInput = page.locator('input[type="file"]');
        await fileInput.waitFor({ state: 'attached', timeout: 20000 });
        await fileInput.setInputFiles(localImagePath);
        
        await page.waitForTimeout(5000);

        log("Filling title and content...");
        const titleInput = page.locator('input[placeholder*="标题"]');
        await titleInput.fill(config.title);

        const contentArea = page.locator('#post-textarea');
        if (await contentArea.count() > 0) {
            await contentArea.fill(config.content);
        } else {
            await page.keyboard.press('Tab');
            await page.keyboard.type(config.content);
        }

        log("Clicking '发布'...");
        const publishButton = page.getByRole('button', { name: '发布', exact: true });
        const publishButtonFallback = page.getByText('发布', { exact: true });

        if (await publishButton.isVisible()) {
             await publishButton.click();
        } else if (await publishButtonFallback.isVisible()) {
             await publishButtonFallback.click();
        } else {
             const publishNoteBtn = page.getByText('发布笔记', { exact: true });
             if (await publishNoteBtn.isVisible()) {
                await publishNoteBtn.click();
             } else {
                throw new Error("Publish button not found");
             }
        }

        log("Published successfully!");
        await page.waitForTimeout(5000);

    } finally {
        if (localImagePath !== config.imagePathOrUrl && fs.existsSync(localImagePath)) {
            // fs.unlinkSync(localImagePath); // Keep for debugging if needed, or delete
        }
    }
}