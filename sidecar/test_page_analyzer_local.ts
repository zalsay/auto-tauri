import * as path from 'path';
import { chromium } from 'playwright';
import { PageAnalyzer } from './src/page_analyzer';

async function runLocalTest() {
  console.log('=== Page Analyzer Local Test (No LLM) ===\n');

  console.log('[Test] Local HTML Page with Forms');
  console.log('URL: file:///Users/yingzhang/Documents/dev/auto-tauri/sidecar/test_page.html');
  console.log('Original Prompt: "帮我登录"\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`file://${path.resolve(__dirname, 'test_page.html')}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('Page loaded successfully');

  const analyzer = new PageAnalyzer(page);

  console.log('\n--- Extracted Page Elements ---');
  const elements = await (analyzer as any).extractPageElements();
  console.log(`Found ${elements.length} interactive elements:\n`);

  elements.forEach((el: any, i: number) => {
    console.log(`[${i}] Role: ${el.role}`);
    console.log(`    Text: "${el.text}"`);
    console.log(`    Placeholder: "${el.placeholder || 'N/A'}"`);
    console.log(`    Type: "${el.type || 'N/A'}"`);
    console.log(`    Description: ${el.description}`);
    console.log('');
  });

  const pageContext = await (analyzer as any).capturePageContext();
  console.log('--- Page Context ---');
  console.log(`Title: ${pageContext.title}`);
  console.log(`Strategy: ${pageContext.strategy}`);

  await browser.close();

  console.log('\n=== Test Complete ===');
  console.log('Note: Full LLM optimization requires OPENAI_API_KEY environment variable.');
}

runLocalTest().catch(console.error);
