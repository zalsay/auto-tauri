import * as readline from 'readline';
import { chromium } from 'playwright';
import { runScraperAndPublish } from './auto_agents';

// Mock HyperAgent Sidecar
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  log('Sidecar 已就绪。等待输入...');

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const input = JSON.parse(line);
        await processTask(input);
        // We only handle one task per invocation
        break; 
      } catch (e: any) {
        log(`输入解析错误: ${e.message}`);
        process.exit(1);
      }
    }
  }
}

async function processTask(input: any) {
  log(`收到任务: ${input.taskId}`);
  log(`类型: ${input.type || 'default'}`);

  if (input.type === 'xhs_automation' || input.type === 'scrape') {
     await handleXHSAutomation(input);
  } else {
     await handleDefaultMock(input);
  }
}

async function handleXHSAutomation(input: any) {
    log('正在启动浏览器进行网页获取...');
    // We launch non-headless so the user can see/interact (especially for login)
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    try {
        const result = await runScraperAndPublish(context, input.url, input.prompt);
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'success',
            data: result
        }));
    } catch (e: any) {
        log(`自动化执行错误: ${e.message}`);
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'failed',
            error: e.message
        }));
    } finally {
        // Keep browser open for a bit if we want user to see it, otherwise close
        // await browser.close();
        log('自动化流程结束。');
        // We exit process after a delay to allow stdout to flush? 
        // Or we just let the parent kill us. 
        // For the purpose of "leaving the window open", we might need to NOT exit immediately 
        // if we want the user to click "Publish".
        // But the Sidecar architecture usually expects a return.
        // Let's close for now or wait a bit.
        await sleep(5000);
        await browser.close();
    }
}

async function handleDefaultMock(input: any) {
  log(`目标 URL: ${input.url || 'N/A'}`);
  log(`提示词: ${input.prompt}`);

  // Mock processing
  log('启动浏览器...');
  await sleep(1000);
  log('导航到页面...');
  await sleep(1000);
  log('提取数据...');
  await sleep(1000);

  // Result
  const result = {
    taskId: input.taskId,
    status: 'success',
    data: {
      title: '模拟页面标题',
      summary: '这是从页面提取的模拟结果。',
      price: '$99.99'
    }
  };

  // Output result as the last line
  console.log(JSON.stringify(result));
}

function log(message: string) {
  const event = {
    type: 'log',
    message: message,
    timestamp: new Date().toISOString()
  };
  console.error(JSON.stringify(event));
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error(JSON.stringify({ type: 'error', message: err.message }));
  process.exit(1);
});


