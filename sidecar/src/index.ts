import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';
import { chromium } from 'playwright';
import { HyperAgent } from "@hyperbrowser/agent";
import { runScraperAndPublish } from './auto_agents';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

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

    if (!baseURL && (apiKey === OPENROUTER_API_KEY || (apiKey && model.includes('gemini')))) {
        baseURL = 'https://openrouter.ai/api/v1';
    }

    return { provider, model, apiKey, baseURL };
}

async function processTask(input: any) {
  const config = getLLMConfig(input);
  
  log(`收到任务: ${input.taskId}`);
  log(`执行配置: Provider=${config.provider}, Model=${config.model}`);

  if (input.type === 'xhs_automation') {
     await handleXHSFlow(input, config);
  } else {
     await handleHyperAgent(input, config);
  }
}

async function handleHyperAgent(input: any, config: any) {
    log(`[HyperAgent] 正在初始化持久化环境...`);
    
    const userDataDir = path.join(os.homedir(), '.auto-tauri', 'browser-profile');

    let context;
    try {
        // 1. 启动持久化上下文
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            viewport: { width: 1280, height: 800 }
        });

        // 重要：获取 launchPersistentContext 默认打开的第一个页面，不要新建
        const pages = context.pages();
        const page = pages.length > 0 ? pages[0] : await context.newPage();

        log(`[HyperAgent] 已锁定主窗口。`);

        // 2. 初始化 Agent
        const agent = new HyperAgent({
            llm: {
                provider: config.provider as any,
                model: config.model,
                apiKey: config.apiKey,
                baseURL: config.baseURL
            },
            connectorConfig: {
                driver: "playwright",
                options: {
                    page,
                    context
                }
            }
        });

        // 3. 导航到目标 URL
        if (input.url) {
            log(`[HyperAgent] 正在主窗口导航至: ${input.url}`);
            await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        }

        // 4. 执行任务指令
        log(`[HyperAgent] 正在执行任务: ${input.prompt}`);
        
        // 关键修复：显式传入 page 参数给 executeTask，防止它开启新窗口
        const result = await (agent as any).executeTask(input.prompt, {}, page);

        log(`[HyperAgent] 任务完成。`);
        
        const stepsCount = result?.steps?.length || 0;
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'success',
            data: result,
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
