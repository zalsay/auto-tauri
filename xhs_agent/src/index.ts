import { chromium } from 'playwright';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as readline from 'readline';
import * as https from 'https';

// Helper for logging
const log = (msg: string) => console.error(JSON.stringify({ type: 'log', message: `[XHS Agent] ${msg}`, timestamp: new Date().toISOString() }));

interface PublishConfig {
    imagePath: string;
    title: string;
    content: string;
    taskId?: string;
}

async function downloadImage(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode} ${response.statusMessage}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function runPublish(config: PublishConfig) {
    if (!config.imagePath) {
        throw new Error("Image path is required for XHS publish.");
    }

    let actualImagePath = config.imagePath;

    // Handle URL downloading using native https
    if (config.imagePath.startsWith('http')) {
        log(`Downloading image from URL: ${config.imagePath}`);
        const tmpDir = path.join(os.tmpdir(), 'auto-tauri-xhs');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        actualImagePath = path.join(tmpDir, `publish_${Date.now()}.png`);
        
        try {
            await downloadImage(config.imagePath, actualImagePath);
            log("Download complete.");
        } catch (e: any) {
            throw new Error(`Failed to download image: ${e.message}`);
        }
    }

    if (!fs.existsSync(actualImagePath)) {
        throw new Error(`Image file not found: ${actualImagePath}`);
    }

    log("Initializing persistent browser context...");
    const userDataDir = path.join(os.homedir(), '.auto-tauri', 'browser-profile');
    
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        channel: 'chrome',
        viewport: { width: 1280, height: 800 },
        args: ['--start-maximized']
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        log("Navigating to Xiaohongshu Creator Center...");
        await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'networkidle', timeout: 60000 });

        const checkPublishPage = () => page.url().includes('/publish/publish');

        if (!checkPublishPage()) {
            log("--- ACTION REQUIRED ---");
            log("Waiting for user to reach the Publish page...");
            
            const startTime = Date.now();
            while (!checkPublishPage()) {
                if (Date.now() - startTime > 120000) {
                    throw new Error("Timeout waiting for login. Please reach the publish page manually.");
                }
                try {
                    await page.waitForURL('**/publish/publish', { timeout: 5000 });
                } catch (e) {
                    if (!checkPublishPage()) {
                        log("Still waiting for you to reach the Publish page... (Please log in)");
                    }
                }
            }
            log("Target page detected! Proceeding...");
        }

        log("Looking for upload area...");
        const imageTab = page.getByText('上传图文', { exact: true }).first();
        if (await imageTab.isVisible()) {
            log("Clicking '上传图文' tab...");
            await imageTab.dispatchEvent('click');
            await page.waitForTimeout(2000);
        }

        log("Uploading image...");
        const fileInput = page.locator('input[type="file"]');
        await fileInput.waitFor({ state: 'attached', timeout: 20000 });
        await fileInput.setInputFiles(actualImagePath);
        
        log("Waiting for upload processing...");
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

        log("Ready to publish!");
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

        log("Published! Waiting for confirmation...");
        await page.waitForTimeout(5000);
        
        console.log(JSON.stringify({ taskId: config.taskId, status: 'success', data: { message: 'Published to XHS' } }));

    } catch (e: any) {
        log(`Error: ${e.message}`);
        console.log(JSON.stringify({ taskId: config.taskId, status: 'failed', error: e.message }));
    } finally {
        await context.close();
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    // If no args, wait for stdin (JSON)
    if (args.length === 0) {
        const rl = readline.createInterface({
            input: process.stdin,
            terminal: false
        });

        for await (const line of rl) {
            if (line.trim()) {
                let config;
                try {
                    config = JSON.parse(line);
                } catch (e: any) {
                    console.error(JSON.stringify({ type: 'error', message: `Invalid JSON on stdin: ${e.message}` }));
                    process.exit(1);
                }

                try {
                    await runPublish(config);
                    break;
                } catch (e: any) {
                    log(`Execution error: ${e.message}`);
                    console.log(JSON.stringify({ taskId: config?.taskId, status: 'failed', error: e.message }));
                    process.exit(1);
                }
            }
        }
    } else {
        // Handle CLI args for backward compatibility
        const config: PublishConfig = {
            imagePath: args[0],
            title: args[1],
            content: args[2] || ''
        };
        await runPublish(config);
    }
}

main().catch(console.error);