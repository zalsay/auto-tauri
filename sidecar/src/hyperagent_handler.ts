/**
 * hyperagent_handler.ts - HyperAgent 任务处理器
 * 
 * 负责处理浏览器自动化任务：
 * - 启动持久化浏览器上下文
 * - 执行 HyperAgent 任务
 * - 处理图片提取和 OSS 上传
 * - 保存结果到素材中心
 */

import * as path from 'path';
import * as os from 'os';
import { chromium, BrowserContext } from 'playwright';
import { HyperAgent } from "@hyperbrowser/agent";
import { z } from 'zod';
import OSS from 'ali-oss';
import { LLMConfig } from './llm_config';
import { log, sleep } from './utils';
import { analyzeAndOptimize } from './page_analyzer';
import * as APIClient from './api_client';

export interface HyperAgentInput {
    taskId: string;
    prompt: string;
    url?: string;
    autoOptimizePrompt?: boolean;
    projectId?: string;
    authToken?: string;
    serverUrl?: string;
    oss?: {
        region?: string;
        accessKeyId?: string;
        accessKeySecret?: string;
        bucket?: string;
    };
}

/**
 * 处理 HyperAgent 任务
 */
export async function handleHyperAgent(input: HyperAgentInput, config: LLMConfig): Promise<void> {
    log(`[HyperAgent] 正在初始化持久化环境...`);

    let context: BrowserContext | undefined;
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

        let finalPrompt = input.prompt;
        let pageAnalysis: any = null;

        if (input.autoOptimizePrompt && input.prompt) {
            log(`[PageAnalyzer] 正在分析页面结构并优化 prompt...`);
            try {
                const analysis = await analyzeAndOptimize(page, input.prompt);
                pageAnalysis = analysis;
                log(`[PageAnalyzer] 优化结果:`);
                log(`  - Strategy: ${analysis.strategy}`);
                log(`  - 识别元素数: ${analysis.elements.length}`);
                log(`  - 原 prompt: ${input.prompt}`);
                log(`  - 优化后 prompt: ${analysis.optimizedPrompt}`);
                finalPrompt = analysis.optimizedPrompt;
            } catch (e: any) {
                log(`[PageAnalyzer] 分析失败，使用原始 prompt: ${e.message}`);
            }
        }

        log(`[HyperAgent] 正在执行任务: ${finalPrompt}`);

        const materialNameFallback = `Result: ${input.taskId} - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

        const ossConfig = input.oss || {};
        let ossClient: any = null;
        const uploadedImageUrls: string[] = [];

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

        // Helper function to download image and upload to OSS
        const downloadAndUploadImage = async (imageUrl: string, index: number): Promise<string | null> => {
            try {
                log(`[HyperAgent] 正在下载图片: ${imageUrl}`);
                const response = await fetch(imageUrl);
                if (!response.ok) {
                    log(`[HyperAgent] 图片下载失败: ${response.status}`);
                    return null;
                }
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Determine file extension from URL or content-type
                const contentType = response.headers.get('content-type') || '';
                let ext = 'png';
                if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
                else if (contentType.includes('gif')) ext = 'gif';
                else if (contentType.includes('webp')) ext = 'webp';
                else if (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')) ext = 'jpg';
                else if (imageUrl.includes('.gif')) ext = 'gif';
                else if (imageUrl.includes('.webp')) ext = 'webp';

                const client = await ensureOssClient();
                const objectName = `images/${input.taskId}/image-${index}-${Date.now()}.${ext}`;
                const uploadResult = await client.put(objectName, buffer);
                log(`[HyperAgent] 图片已上传至: ${uploadResult.url}`);
                return uploadResult.url;
            } catch (e: any) {
                log(`[HyperAgent] 图片下载上传失败: ${e.message}`);
                return null;
            }
        };

        const result = await (agent as any).executeTask(
            input.prompt,
            {
                outputSchema: z.object({
                    name: z.string().describe("素材标题，适合作为素材中心名称字段"),
                    content: z.string().describe("素材正文内容，用于素材中心内容字段"),
                    imageUrls: z.array(z.string()).optional().describe("从页面提取的图片URL列表，如果任务涉及获取图片请填写")
                }),
                enableVisualMode: false,
            },
            page
        );
        log(`[HyperAgent] 任务完成。result: ${JSON.stringify(result)}`);

        const structuredOutput: any = result?.output || {};
        const materialName = structuredOutput.name || materialNameFallback;
        const materialContent = structuredOutput.content || JSON.stringify(structuredOutput || result || '');

        // Process extracted image URLs - download and re-upload to OSS
        if (structuredOutput.imageUrls && Array.isArray(structuredOutput.imageUrls) && structuredOutput.imageUrls.length > 0) {
            log(`[HyperAgent] 检测到 ${structuredOutput.imageUrls.length} 张图片，正在处理...`);
            for (let i = 0; i < structuredOutput.imageUrls.length; i++) {
                const originalUrl = structuredOutput.imageUrls[i];
                const uploadedUrl = await downloadAndUploadImage(originalUrl, i);
                if (uploadedUrl) {
                    uploadedImageUrls.push(uploadedUrl);
                }
            }
            log(`[HyperAgent] 图片处理完成，成功上传 ${uploadedImageUrls.length} 张`);
        }

        const stepsCount = result?.steps?.length || 0;
        let imageUrlsForMaterial: string | undefined;
        if (uploadedImageUrls.length > 0) {
            imageUrlsForMaterial = JSON.stringify(uploadedImageUrls);
        }

        const dataPayload: any = {
            ...result,
            output: materialContent,
            name: materialName,
            content: materialContent,
            structuredOutput,
            extractedImageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
            promptOptimization: pageAnalysis ? {
                originalPrompt: input.prompt,
                optimizedPrompt: finalPrompt,
                strategy: pageAnalysis.strategy,
                elementsCount: pageAnalysis.elements.length,
            } : undefined,
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

        // Save to material center if auth token is provided
        if (input.authToken) {
            log(`[HyperAgent] 正在保存素材到素材中心...`);
            const savedMaterial = await APIClient.saveTaskResultAsMaterial(
                input.taskId,
                materialContent,
                input.projectId,
                materialName,
                imageUrlsForMaterial,
                {
                    serverUrl: input.serverUrl || 'http://localhost:8080',
                    authToken: input.authToken
                }
            );
            if (savedMaterial) {
                log(`[HyperAgent] 素材已保存: ${savedMaterial.id}`);
            }
        }

    } catch (e: any) {
        log(`[HyperAgent] 错误: ${e.message}`);
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'failed',
            error: e.message
        }));
    } finally {
        if (context) {
            await sleep(3000);
            await context.close();
        }
        log('Sidecar 执行结束。');
    }
}
