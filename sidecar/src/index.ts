import * as readline from 'readline';
import { chromium, Page } from 'playwright';
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
    log(`[HyperAgent] 正在初始化引擎...`);
    
    // 1. 初始化 Agent
    const agent = new HyperAgent({
        llm: {
            provider: config.provider as any,
            model: config.model,
            apiKey: config.apiKey,
            baseURL: config.baseURL
        }
    });

    try {
        // 2. 获取页面实例
        log(`[HyperAgent] 正在启动浏览器...`);
        const page = await agent.getCurrentPage();

        // 3. 如果提供了 URL，先导航
        if (input.url) {
            log(`[HyperAgent] 正在导航至: ${input.url}`);
            await page.goto(input.url, { waitUntil: 'domcontentloaded' });
        }

        // 4. 执行任务指令
        log(`[HyperAgent] 正在执行任务: ${input.prompt}`);
        const result = await agent.executeTask(input.prompt);

        log(`[HyperAgent] 任务完成。`);
        
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'success',
            data: result
        }));

    } catch (e: any) {
        log(`[HyperAgent] 错误: ${e.message}`);
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'failed',
            error: e.message
        }));
    } finally {
        await agent.closeAgent();
        log('Sidecar 执行结束。');
    }
}

async function handleXHSFlow(input: any, config: any) {
    log('启动浏览器...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    try {
        const result = await runScraperAndPublish(context, input.url, input.prompt);
        console.log(JSON.stringify({ taskId: input.taskId, status: 'success', data: result }));
    } catch (e: any) {
        log(`错误: ${e.message}`);
        console.log(JSON.stringify({ taskId: input.taskId, status: 'failed', error: e.message }));
    } finally {
        await sleep(5000);
        await browser.close();
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
