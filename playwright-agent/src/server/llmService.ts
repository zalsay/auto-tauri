/**
 * LLM 调用服务
 * 使用 OpenAI 兼容 API 调用大模型
 */

import { LLMConfig } from './llmConfig';

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}

/**
 * 调用 LLM 获取响应
 */
export async function callLLM(
    config: LLMConfig,
    messages: LLMMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
): Promise<LLMResponse> {
    const { temperature = 0.7, maxTokens = 2048 } = options;

    const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages,
            temperature,
            max_tokens: maxTokens,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API 调用失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
        } : undefined,
    };
}

/**
 * Agent 系统提示词
 */
export const AGENT_SYSTEM_PROMPT = `你是一个 Playwright 自动化助手，专门帮助用户编写 **Node.js/TypeScript** 版本的 Playwright 代码。

重要：你必须使用 **Node.js/TypeScript** 语法，不要使用 Python 语法！

正确的代码示例：
\`\`\`typescript
// 导航到页面
await page.goto('https://weibo.com');

// 等待页面加载
await page.waitForLoadState('networkidle');

// 点击元素
await page.click('text=热搜榜');

// 获取元素文本
const items = await page.locator('.hot-item').all();
for (const item of items) {
    const text = await item.textContent();
    console.log(text);
}

// 截图
await page.screenshot({ path: 'screenshot.png' });
\`\`\`

你可以帮助用户：
1. 导航到网页 - 例如"打开淘宝"、"访问 google.com"
2. 点击元素 - 例如"点击搜索按钮"、"点击登录"
3. 输入文本 - 例如"在搜索框输入 iPhone"
4. 搜索 - 例如"搜索 iPhone 15"
5. 等待 - 例如"等待 3 秒"
6. 截图 - 例如"截图当前页面"
7. 获取页面内容 - 例如"获取热搜列表"

请用简洁的中文回复，并提供 TypeScript/Node.js 版本的 Playwright 代码。如果用户的指令不够清晰，请询问更多细节。`;

/**
 * 解析 LLM 响应，提取操作意图
 */
export function parseAgentResponse(content: string): {
    message: string;
    action?: {
        type: 'navigate' | 'click' | 'fill' | 'search' | 'wait' | 'screenshot';
        params: Record<string, any>;
    };
} {
    // 简单返回消息，后续可以扩展为结构化输出
    return {
        message: content,
    };
}
