import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { chromium } from 'playwright';
import { HyperAgent } from "@hyperbrowser/agent";
import { runScraperAndPublish } from './auto_agents';
import { publishToXHS } from './auto_agents/xhs_publish';
import OSS from 'ali-oss';
import dotenv from 'dotenv';

// Explicitly resolve the path to the .env file located in the parent directory of the script
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Log to confirm if the env var was loaded
if (process.env.OSS_ACCESS_KEY_ID) {
    console.error(`[dotenv] Successfully loaded OSS_ACCESS_KEY_ID: ${process.env.OSS_ACCESS_KEY_ID.substring(0, 4)}...`);
} else {
    console.error("[dotenv] Failed to load OSS credentials from .env file.");
}

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    log('Sidecar 已就绪。等待指令...');

    for await (const line of rl) {
        if (line.trim()) {
            try {
                const input = JSON.parse(line);
                await processTask(input);
                break;
            } catch (e: any) {
                log(`指令解析错误: ${e.message}`);
                process.exit(1);
            }
        }
    }
}

function getLLMConfig(input: any) {
    const llm = input.llm || {};
    let provider = llm.provider || input.llmProvider || 'openai';
    let apiKey = llm.apiKey || input.llmApiKey || OPENROUTER_API_KEY;
    let model = llm.model || input.llmModel || 'google/gemini-2.0-flash-exp:free';
    let baseURL = llm.baseURL || undefined;

    if (provider === 'TaskMaster') {
        provider = 'openai';
    }

    if (!baseURL && (apiKey === OPENROUTER_API_KEY || (apiKey && model.includes('gemini')))) {
        baseURL = 'https://openrouter.ai/api/v1';
    }

    if (baseURL && baseURL.includes('openrouter.ai')) {
        provider = 'openai';
    }

    return { provider, model, apiKey, baseURL };
}

async function processTask(input: any) {
    const config = getLLMConfig(input);

    log(`收到任务: ${input.taskId}`);
    const maskedApiKey = config.apiKey ? (config.apiKey.length > 8 ? `${config.apiKey.substring(0, 4)}...${config.apiKey.substring(config.apiKey.length - 4)}` : '****') : 'none';
    log(`执行配置: Provider=${config.provider}, Model=${config.model}, BaseURL=${config.baseURL || 'default'}, APIKey=${maskedApiKey}`);

    if (input.type === 'xhs_automation') {
        await handleXHSFlow(input, config);
    } else if (input.type === 'xhs_publish') {
        await handleXHSPublish(input, config);
    } else {
        await handleHyperAgent(input, config);
    }
}

async function handleXHSPublish(input: any, config: any) {
    log('启动持久化浏览器 (XHS Publish)...');
    const userDataDir = path.join(os.homedir(), '.auto-tauri', 'browser-profile');

    let context;
    try {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            viewport: { width: 1280, height: 800 }
        });

        await publishToXHS(context, {
            imagePathOrUrl: input.imagePathOrUrl || input.url,
            title: input.title,
            content: input.prompt || input.content
        });
        
        console.log(JSON.stringify({ taskId: input.taskId, status: 'success', data: { message: 'Published to XHS' } }));
    } catch (e: any) {
        log(`错误: ${e.message}`);
        console.log(JSON.stringify({ taskId: input.taskId, status: 'failed', error: e.message }));
    } finally {
        if (context) {
            await sleep(5000);
            await context.close();
        }
    }
}

async function handleHyperAgent(input: any, config: any) {
    log(`[HyperAgent] 正在初始化持久化环境...`);

    let context;
    try {
        context = await chromium.launchPersistentContext(path.join(os.homedir(), '.auto-tauri', 'browser-profile'), {
            headless: false,
            channel: 'chrome',
            viewport: { width: 1280, height: 800 }
        });

        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
        log(`[HyperAgent] 已锁定主窗口。`);

        const agent = new HyperAgent({
            llm: {
                provider: config.provider as any,
                model: config.model,
                apiKey: config.apiKey,
                baseURL: config.baseURL
            },
            connectorConfig: { driver: "playwright", options: { page, context } }
        });

        if (input.url) {
            log(`[HyperAgent] 正在主窗口导航至: ${input.url}`);
            await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        }

        log(`[HyperAgent] 正在执行任务: ${input.prompt}`);
        const result = await (agent as any).executeTask(input.prompt, {}, page);
        log(`[HyperAgent] 任务完成。`);

        let screenshotUrl: string | null = null;
        if (input.screenshot) {
            log(`[HyperAgent] 正在执行截图并上传至OSS...`);
            try {
                const ossConfig = input.oss || {};
                const client = new OSS({
                    region: ossConfig.region || process.env.OSS_REGION,
                    accessKeyId: ossConfig.accessKeyId || process.env.OSS_ACCESS_KEY_ID,
                    accessKeySecret: ossConfig.accessKeySecret || process.env.OSS_ACCESS_KEY_SECRET,
                    bucket: ossConfig.bucket || process.env.OSS_BUCKET,
                });

                const imageBuffer = await page.screenshot({ fullPage: true });
                const objectName = `screenshots/screenshot-${input.taskId}.png`;

                const uploadResult = await client.put(objectName, imageBuffer);
                screenshotUrl = uploadResult.url;
                log(`[HyperAgent] 截图已上传至: ${screenshotUrl}`);

            } catch (e: any) {
                log(`[HyperAgent] 截图或上传失败: ${e.message}`);
            }
        }

        const stepsCount = result?.steps?.length || 0;
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'success',
            data: { ...result, screenshotUrl },
            stepsCount: stepsCount
        }));

    } catch (e: any) {
        log(`[HyperAgent] 错误: ${e.message}`);
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'failed',
            error: e.message
        }));
    } finally {
        if (context) {
            await new Promise(r => setTimeout(r, 3000));
            await context.close();
        }
        log('Sidecar 执行结束。');
    }
}

async function handleXHSFlow(input: any, config: any) {
    log('启动持久化浏览器 (XHS)...');
    const userDataDir = path.join(os.homedir(), '.auto-tauri', 'browser-profile');

    let context;
    try {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            viewport: { width: 1280, height: 800 }
        });

        const result = await runScraperAndPublish(context, input.url, input.prompt);
        console.log(JSON.stringify({ taskId: input.taskId, status: 'success', data: result }));
    } catch (e: any) {
        log(`错误: ${e.message}`);
        console.log(JSON.stringify({ taskId: input.taskId, status: 'failed', error: e.message }));
    } finally {
        if (context) {
            await sleep(5000);
            await context.close();
        }
    }
}

function log(message: string) {
    console.error(JSON.stringify({ type: 'log', message, timestamp: new Date().toISOString() }));
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
    console.error(JSON.stringify({ type: 'error', message: err.message }));
    process.exit(1);
});
