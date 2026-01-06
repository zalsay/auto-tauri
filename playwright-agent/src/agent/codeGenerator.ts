import { ActionIntent } from '../types';

/**
 * Playwright 代码生成器
 * 将操作意图转换为可执行的 Playwright 代码
 */
export class CodeGenerator {
    private codeLines: string[] = [];
    private imports: Set<string> = new Set();

    constructor() {
        this.reset();
    }

    /**
     * 重置生成器状态
     */
    reset(): void {
        this.codeLines = [];
        this.imports = new Set(['chromium']);
    }

    /**
     * 添加操作并生成对应代码
     */
    addAction(action: ActionIntent): string {
        let code = '';

        switch (action.action) {
            case 'navigate':
                code = `await page.goto('${action.url}');`;
                break;

            case 'click':
                code = `await page.click('${this.escapeSelector(action.selector || '')}');`;
                break;

            case 'fill':
                code = `await page.fill('${this.escapeSelector(action.selector || '')}', '${this.escapeString(action.value || '')}');`;
                break;

            case 'select':
                code = `await page.selectOption('${this.escapeSelector(action.selector || '')}', '${this.escapeString(action.value || '')}');`;
                break;

            case 'wait':
                const ms = parseInt(action.value || '1000') * 1000;
                code = `await page.waitForTimeout(${ms});`;
                break;

            case 'screenshot':
                code = `await page.screenshot({ path: 'screenshot_${Date.now()}.png' });`;
                break;

            case 'scroll':
                if (action.value === '到底部') {
                    code = `await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));`;
                } else if (action.value === '到顶部') {
                    code = `await page.evaluate(() => window.scrollTo(0, 0));`;
                } else {
                    code = `await page.evaluate(() => window.scrollBy(0, 500));`;
                }
                break;
        }

        if (code) {
            // 添加注释说明
            this.codeLines.push(`  // ${action.description}`);
            this.codeLines.push(`  ${code}`);
        }

        return code;
    }

    /**
     * 生成完整的可执行脚本
     */
    generateFullScript(): string {
        const importList = Array.from(this.imports).join(', ');

        return `import { ${importList} } from 'playwright';

/**
 * 自动生成的 Playwright 脚本
 * 生成时间: ${new Date().toISOString()}
 */
async function run() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100 
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
${this.codeLines.join('\n')}
    
    console.log('脚本执行完成');
  } catch (error) {
    console.error('执行出错:', error);
  } finally {
    await browser.close();
  }
}

run();
`;
    }

    /**
     * 获取当前代码片段（不含包装）
     */
    getCurrentCode(): string {
        return this.codeLines.join('\n');
    }

    /**
     * 转义选择器中的特殊字符
     */
    private escapeSelector(selector: string): string {
        return selector.replace(/'/g, "\\'");
    }

    /**
     * 转义字符串中的特殊字符
     */
    private escapeString(str: string): string {
        return str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
    }
}

export const codeGenerator = new CodeGenerator();
