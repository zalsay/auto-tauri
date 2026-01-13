/**
 * 代码执行器
 * 解析并执行生成的 Playwright 代码片段
 */

import { Page } from 'playwright';

interface ExecutionResult {
    success: boolean;
    message: string;
    steps: string[];
    error?: string;
}

/**
 * 从生成的代码中提取可执行的操作
 */
function extractOperations(code: string): Array<{
    type: 'goto' | 'click' | 'fill' | 'waitForLoadState' | 'waitForSelector' | 'screenshot' | 'evaluate' | 'unknown';
    args: string[];
    original: string;
}> {
    const operations: Array<{
        type: 'goto' | 'click' | 'fill' | 'waitForLoadState' | 'waitForSelector' | 'screenshot' | 'evaluate' | 'unknown';
        args: string[];
        original: string;
    }> = [];

    // 匹配各种操作
    const patterns = [
        { regex: /await\s+page\.goto\(['"](.+?)['"]\)/g, type: 'goto' as const },
        { regex: /await\s+page\.click\(['"](.+?)['"]\)/g, type: 'click' as const },
        { regex: /await\s+page\.fill\(['"](.+?)['"],\s*['"](.+?)['"]\)/g, type: 'fill' as const },
        { regex: /await\s+page\.waitForLoadState\(['"](.+?)['"]\)/g, type: 'waitForLoadState' as const },
        { regex: /await\s+page\.waitForSelector\(['"](.+?)['"]\)/g, type: 'waitForSelector' as const },
        { regex: /await\s+page\.screenshot\(/g, type: 'screenshot' as const },
    ];

    for (const { regex, type } of patterns) {
        let match;
        while ((match = regex.exec(code)) !== null) {
            operations.push({
                type,
                args: match.slice(1),
                original: match[0],
            });
        }
    }

    // 按在代码中出现的顺序排序
    operations.sort((a, b) => code.indexOf(a.original) - code.indexOf(b.original));

    return operations;
}

/**
 * 执行代码
 */
export async function executeCode(page: Page, code: string): Promise<ExecutionResult> {
    const operations = extractOperations(code);
    const steps: string[] = [];

    if (operations.length === 0) {
        return {
            success: false,
            message: '未能从代码中提取可执行的操作',
            steps: [],
            error: '代码格式不正确或不包含支持的 Playwright 操作',
        };
    }

    console.log(`提取到 ${operations.length} 个操作`);

    for (const op of operations) {
        try {
            switch (op.type) {
                case 'goto':
                    console.log(`执行: 导航到 ${op.args[0]}`);
                    await page.goto(op.args[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
                    steps.push(`✅ 导航到 ${op.args[0]}`);
                    break;

                case 'click':
                    console.log(`执行: 点击 ${op.args[0]}`);
                    await page.click(op.args[0], { timeout: 10000 });
                    steps.push(`✅ 点击 ${op.args[0]}`);
                    break;

                case 'fill':
                    console.log(`执行: 填写 ${op.args[0]} = ${op.args[1]}`);
                    await page.fill(op.args[0], op.args[1], { timeout: 10000 });
                    steps.push(`✅ 填写 ${op.args[0]}`);
                    break;

                case 'waitForLoadState':
                    console.log(`执行: 等待 ${op.args[0]}`);
                    await page.waitForLoadState(op.args[0] as any, { timeout: 30000 });
                    steps.push(`✅ 等待页面 ${op.args[0]}`);
                    break;

                case 'waitForSelector':
                    console.log(`执行: 等待选择器 ${op.args[0]}`);
                    await page.waitForSelector(op.args[0], { timeout: 10000 });
                    steps.push(`✅ 等待元素 ${op.args[0]}`);
                    break;

                case 'screenshot':
                    console.log(`执行: 截图`);
                    await page.screenshot({ path: 'screenshot.png' });
                    steps.push(`✅ 截图保存`);
                    break;

                default:
                    steps.push(`⏭️ 跳过不支持的操作: ${op.original}`);
            }

            // 每个操作后短暂等待
            await page.waitForTimeout(500);

        } catch (error: any) {
            steps.push(`❌ 操作失败: ${op.original} - ${error.message}`);
            return {
                success: false,
                message: `执行在步骤 "${op.original}" 时失败`,
                steps,
                error: error.message,
            };
        }
    }

    return {
        success: true,
        message: `成功执行 ${steps.length} 个操作`,
        steps,
    };
}
