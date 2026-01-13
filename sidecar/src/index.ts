/**
 * Sidecar 主入口文件
 * 
 * ============================================================================
 * 功能模块说明
 * ============================================================================
 * 
 * 1. env_loader           - 环境变量加载（.env 文件路径解析）
 * 2. llm_config           - LLM 配置解析（Provider, Model, API Key）
 * 3. ai_call              - 大模型调用封装（直接调用 OpenAI 兼容 API）
 * 4. hyperagent_handler   - HyperAgent 任务处理（浏览器自动化、OSS上传）
 * 5. ai_workflow_handler  - AI 工作流生成（生成/继续/确认）
 * 6. cache_manager        - 会话缓存管理
 * 7. api_client           - 后端 API 通信
 * 8. page_analyzer        - 页面分析与 prompt 优化
 * 9. utils                - 公共工具函数（log, sleep）
 * 
 * ============================================================================
 * 任务类型
 * ============================================================================
 * 
 * - default (hyperagent)  : 浏览器自动化任务
 * - ai_workflow           : AI 工作流生成任务
 * 
 * ============================================================================
 */

import * as readline from 'readline';
import * as fs from 'fs';

// 模块导入
import './env_loader';  // 自动加载环境变量
import { getLLMConfig, getMaskedApiKey } from './llm_config';
import { handleHyperAgent } from './hyperagent_handler';
import { handleAIWorkflow } from './ai_workflow_handler';
import { log } from './utils';

// Fetch polyfill for snapshot fonts (pkg compatibility)
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

/**
 * 主函数
 * 从 stdin 读取任务指令并处理
 */
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

/**
 * 任务路由
 * 根据任务类型分发到对应处理器
 */
async function processTask(input: any) {
    const config = getLLMConfig(input);

    log(`收到任务: ${input.taskId}, 类型: ${input.type || 'hyperagent'}`);
    log(`执行配置: Provider=${config.provider}, Model=${config.model}, BaseURL=${config.baseURL || 'default'}, APIKey=${getMaskedApiKey(config.apiKey)}`);

    // Route to appropriate handler based on task type
    if (input.type === 'ai_workflow') {
        await handleAIWorkflow(input, config);
    } else {
        await handleHyperAgent(input, config);
    }
}

// 启动
main().catch(err => {
    console.error(JSON.stringify({ type: 'error', message: err.message }));
    process.exit(1);
});
