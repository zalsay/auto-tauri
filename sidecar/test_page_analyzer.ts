import * as path from 'path';
import { chromium } from 'playwright';
import { PageAnalyzer, analyzeAndOptimize } from './src/page_analyzer';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const TEST_URLS = [
  {
    name: 'Login Page',
    url: 'https://httpbin.org/html',
    prompt: '帮我登录账号',
  },
  {
    name: 'Simple Page',
    url: 'https://example.com',
    prompt: '点击按钮',
  },
];

async function runTest() {
  console.log('=== Page Analyzer Test ===\n');

  for (const testCase of TEST_URLS) {
    console.log(`\n[Test] ${testCase.name}`);
    console.log(`URL: ${testCase.url}`);
    console.log(`Original Prompt: "${testCase.prompt}"`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(testCase.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log('Page loaded successfully');

      const result = await analyzeAndOptimize(page, testCase.prompt);

      console.log('\n--- Analysis Result ---');
      console.log(`Strategy: ${result.strategy}`);
      console.log(`Elements Found: ${result.elements.length}`);
      console.log(`\nOptimized Prompt:`);
      console.log(result.optimizedPrompt);

      console.log('\n--- Elements ---');
      result.elements.slice(0, 5).forEach((el, i) => {
        console.log(`[${i}] ${el.description}`);
      });

    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    } finally {
      await browser.close();
    }

    console.log('\n' + '='.repeat(50));
  }
}

runTest().catch(console.error);
