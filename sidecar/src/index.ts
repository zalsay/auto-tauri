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

  log('Sidecar ready. Waiting for input...');

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const input = JSON.parse(line);
        await processTask(input);
        // We only handle one task per invocation
        break; 
      } catch (e: any) {
        log(`Error parsing input: ${e.message}`);
        process.exit(1);
      }
    }
  }
}

async function processTask(input: any) {
  log(`Received task: ${input.taskId}`);
  log(`Type: ${input.type || 'default'}`);

  if (input.type === 'xhs_automation') {
     await handleXHSAutomation(input);
  } else {
     await handleDefaultMock(input);
  }
}

async function handleXHSAutomation(input: any) {
    log('Launching Browser for XHS Automation...');
    // We launch non-headless so the user can see/interact (especially for XHS login)
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
        log(`Error in automation: ${e.message}`);
        console.log(JSON.stringify({
            taskId: input.taskId,
            status: 'failed',
            error: e.message
        }));
    } finally {
        // Keep browser open for a bit if we want user to see it, otherwise close
        // await browser.close();
        log('Automation sequence finished.');
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
  log(`Target URL: ${input.url || 'N/A'}`);
  log(`Prompt: ${input.prompt}`);

  // Mock processing
  log('Starting browser...');
  await sleep(1000);
  log('Navigating to page...');
  await sleep(1000);
  log('Extracting data...');
  await sleep(1000);

  // Result
  const result = {
    taskId: input.taskId,
    status: 'success',
    data: {
      title: 'Mock Page Title',
      summary: 'This is a mock result extracted from the page.',
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


