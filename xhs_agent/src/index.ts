import { chromium } from 'playwright';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Helper for logging
const log = (msg: string) => console.log(`[XHS Agent] ${msg}`);

interface PublishConfig {
    imagePath: string;
    title: string;
    content: string;
}

async function main() {
    // Parse arguments: node script.js <imagePath> <title> <content>
    // Or simpler: pass a JSON string as the first argument
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: ts-node src/index.ts '<JSON_CONFIG>'");
        console.error("Or: ts-node src/index.ts <imagePath> <title> <content>");
        process.exit(1);
    }

    let config: PublishConfig;

    if (args.length === 1) {
        try {
            config = JSON.parse(args[0]);
        } catch (e) {
            console.error("Invalid JSON config provided.");
            process.exit(1);
        }
    } else {
        config = {
            imagePath: args[0],
            title: args[1],
            content: args[2] || ''
        };
    }

    if (!fs.existsSync(config.imagePath)) {
        console.error(`Image file not found: ${config.imagePath}`);
        process.exit(1);
    }

    log("Initializing persistent browser context...");
    // Use the same profile path as the main app to share login state
    const userDataDir = path.join(os.homedir(), '.auto-tauri', 'browser-profile');
    
    // Ensure directory exists
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: process.env.HEADLESS === 'true', // Support headless mode via env var
        channel: 'chrome', // Use installed Chrome if available, otherwise chromium
        viewport: { width: 1280, height: 800 },
        args: ['--start-maximized']
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        log("Navigating to Xiaohongshu Creator Center...");
        await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'networkidle', timeout: 60000 });

        const currentUrl = page.url();
        log(`Current URL: ${currentUrl}`);

        const checkPublishPage = () => page.url().includes('/publish/publish');

        if (!checkPublishPage()) {
            log("--- ACTION REQUIRED ---");
            log("Waiting for user to reach the Publish page (https://creator.xiaohongshu.com/publish/publish)...");
            log("Please log in if necessary and navigate to the creation center.");
            
            // Wait indefinitely for the URL to match
            try {
                // We use a loop with a shorter timeout to provide heartbeat logs
                while (!checkPublishPage()) {
                    try {
                        await page.waitForURL('**/publish/publish', { timeout: 10000 });
                    } catch (e) {
                        if (!checkPublishPage()) {
                            log("Still waiting for you to reach the Publish page... (Control+C to cancel)");
                        }
                    }
                }
                log("Target page detected! Proceeding with automation...");
            } catch (e: any) {
                log(`Error during wait: ${e.message}`);
                throw e;
            }
        }

        log("Looking for upload area...");
        // Switch to Image/Text tab
        // Use .first() to resolve strict mode violation if multiple exist (e.g. mobile view hidden one)
        const imageTab = page.getByText('上传图文', { exact: true }).first();
        if (await imageTab.isVisible()) {
            log("Clicking '上传图文' tab...");
            // Use dispatchEvent to bypass viewport checks
            await imageTab.dispatchEvent('click');
            await page.waitForTimeout(2000); // Wait for tab switch
        }

        log("Uploading image...");
        const fileInput = page.locator('input[type="file"]');
        try {
            await fileInput.waitFor({ state: 'attached', timeout: 20000 });
            await fileInput.setInputFiles(config.imagePath);
        } catch (e) {
            log(`Failed to find upload input. Current URL: ${page.url()}`);
            // Take a screenshot for debugging
            const debugPath = path.join(process.cwd(), 'debug_screenshot.png');
            await page.screenshot({ path: debugPath });
            log(`Debug screenshot saved to ${debugPath}`);
            throw e;
        }
        
        log("Waiting for upload processing...");
        await page.waitForTimeout(5000); // Wait for upload and UI update

        log("Filling title...");
        // Selectors are subject to change. Using generic placeholders where possible.
        const titleInput = page.locator('input[placeholder*="标题"]');
        await titleInput.fill(config.title);

        log("Filling content...");
        // Content area usually ID #post-textarea or similar div
        const contentArea = page.locator('#post-textarea');
        if (await contentArea.count() > 0) {
            await contentArea.fill(config.content);
        } else {
            // Fallback for contenteditable div
            await page.keyboard.press('Tab'); // Move focus
            await page.keyboard.type(config.content);
        }

        log("Ready to publish!");
        
        // Automate the Publish click
        const publishButton = page.getByRole('button', { name: '发布', exact: true });
        
        // Fallback if '发布' is too generic or not found as a role
        const publishButtonFallback = page.getByText('发布', { exact: true });

        if (await publishButton.isVisible()) {
             log("Clicking '发布' button...");
             await publishButton.click();
        } else if (await publishButtonFallback.isVisible()) {
             log("Clicking '发布' button (fallback)...");
             await publishButtonFallback.click();
        } else {
             log("Could not find '发布' button. Trying '发布笔记'...");
             const publishNoteBtn = page.getByText('发布笔记', { exact: true });
             if (await publishNoteBtn.isVisible()) {
                await publishNoteBtn.click();
             } else {
                throw new Error("Publish button not found");
             }
        }

        log("Published! Waiting for confirmation...");
        await page.waitForTimeout(5000); // Wait for post-publish redirection or success message

    } catch (e: any) {
        log(`Error: ${e.message}`);
        console.error(e);
    } finally {
        await context.close();
    }
}

main().catch(console.error);
