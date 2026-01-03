import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { chromium } from 'playwright';
import { HyperAgent } from "@hyperbrowser/agent";
import { z } from 'zod';
import OSS from 'ali-oss';
import dotenv from 'dotenv';

// Explicitly resolve the path to the .env file located in the parent directory of the script
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const originalFetch = (globalThis as any).fetch;
if (typeof originalFetch === 'function') {
    (globalThis as any).fetch = (async (input: any, init?: any) => {
        try {
            if (typeof input === 'string' && input.startsWith('/snapshot/fonts/')) {
                try {
                    const buffer = await fs.promises.readFile(input);
                    const NodeResponse = (globalThis as any).Response;
                    if (NodeResponse) {
                        if (buffer && buffer.length > 0) {
                            return new NodeResponse(buffer);
                        }
                        const fallback = 'info face="" size=16\n';
                        return new NodeResponse(fallback, { status: 200 });
                    }
                } catch (e) {
                    const NodeResponse = (globalThis as any).Response;
                    if (NodeResponse) {
                        const fallback = 'info face="" size=16\n';
                        return new NodeResponse(fallback, { status: 200 });
                    }
                }
            }
        } catch (e) {
        }
        return originalFetch(input as any, init as any);
    }) as any;
}

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

    log(`收到任务: ${input.taskId}, 类型: ${input.type}`);
    const maskedApiKey = config.apiKey ? (config.apiKey.length > 8 ? `${config.apiKey.substring(0, 4)}...${config.apiKey.substring(config.apiKey.length - 4)}` : '****') : 'none';
    log(`执行配置: Provider=${config.provider}, Model=${config.model}, BaseURL=${config.baseURL || 'default'}, APIKey=${maskedApiKey}`);


    await handleHyperAgent(input, config);
    
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

        const materialNameFallback = `Result: ${input.taskId} - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

        const ossConfig = input.oss || {};
        const shouldScreenshot = !!input.screenshot;
        let ossClient: any = null;
        let screenshotFailed = false;
        const stepScreenshotUrls: string[] = [];

        const ensureOssClient = async () => {
            if (ossClient) return ossClient;
            const client = new OSS({
                region: ossConfig.region || process.env.OSS_REGION,
                accessKeyId: ossConfig.accessKeyId || process.env.OSS_ACCESS_KEY_ID,
                accessKeySecret: ossConfig.accessKeySecret || process.env.OSS_ACCESS_KEY_SECRET,
                bucket: ossConfig.bucket || process.env.OSS_BUCKET,
            });
            ossClient = client;
            return client;
        };

        const result = await (agent as any).executeTask(
            input.prompt,
            {
                outputSchema: z.object({
                    name: z.string().describe("素材标题，适合作为素材中心名称字段"),
                    content: z.string().describe("素材正文内容，用于素材中心内容字段"),
                }),
                enableVisualMode: shouldScreenshot,
                onStep: shouldScreenshot
                    ? async (step: any) => {
                        if (screenshotFailed) {
                            return;
                        }
                        try {
                            const client = await ensureOssClient();
                            const imageBuffer = await page.screenshot({ fullPage: true });
                            const objectName = `screenshots/${input.taskId}/step-${step.idx}-${Date.now()}.png`;
                            const uploadResult = await client.put(objectName, imageBuffer);
                            stepScreenshotUrls.push(uploadResult.url);
                            log(`[HyperAgent] Step ${step.idx} 截图已上传至: ${uploadResult.url}`);
                        } catch (e: any) {
                            screenshotFailed = true;
                            log(`[HyperAgent] Step ${step.idx} 截图或上传失败: ${e.message}`);
                        }
                    }
                    : undefined,
            },
            page
        );
        log(`[HyperAgent] 任务完成。result: ${JSON.stringify(result)}`);

        const structuredOutput: any = result?.output || {};
        const materialName = structuredOutput.name || materialNameFallback;
        const materialContent = structuredOutput.content || JSON.stringify(structuredOutput || result || '');

        let screenshotUrl: string | null = null;
        if (shouldScreenshot && !screenshotFailed) {
            log(`[HyperAgent] 正在执行截图并上传至OSS...`);
            try {
                const client = await ensureOssClient();
                const imageBuffer = await page.screenshot({ fullPage: true });
                const objectName = `screenshots/${input.taskId}/final-${Date.now()}.png`;

                const uploadResult = await client.put(objectName, imageBuffer);
                screenshotUrl = uploadResult.url;
                stepScreenshotUrls.push(uploadResult.url);
                log(`[HyperAgent] 截图已上传至: ${screenshotUrl}`);

            } catch (e: any) {
                log(`[HyperAgent] 截图或上传失败: ${e.message}`);
                screenshotFailed = true;
            }
        }

        const stepsCount = result?.steps?.length || 0;
        let imageUrlsForMaterial: string | undefined;
        if (stepScreenshotUrls.length > 0) {
            imageUrlsForMaterial = JSON.stringify(stepScreenshotUrls);
        } else if (screenshotUrl) {
            imageUrlsForMaterial = JSON.stringify([screenshotUrl]);
        }

        const dataPayload: any = {
            ...result,
            output: materialContent,
            name: materialName,
            content: materialContent,
            structuredOutput,
            screenshotUrl,
        };

        if (imageUrlsForMaterial) {
            dataPayload.imageUrl = imageUrlsForMaterial;
        }

        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'success',
            data: dataPayload,
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
