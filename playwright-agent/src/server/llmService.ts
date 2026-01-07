/**
 * LLM 调用服务
 * 使用 OpenAI 兼容 API 调用大模型，支持工具调用
 */

import { LLMConfig } from './llmConfig';

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface LLMResponse {
    content: string | null;
    tool_calls?: ToolCall[];
    finish_reason?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}

/**
 * MCP 浏览器工具定义
 */
export const BROWSER_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'browser_navigate',
            description: '导航到指定的 URL',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: '要导航到的完整 URL' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_click',
            description: '点击页面上的元素',
            parameters: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS 选择器或文本选择器，如 "text=登录"' },
                },
                required: ['selector'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_type',
            description: '在输入框中输入文本',
            parameters: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: '输入框的 CSS 选择器' },
                    text: { type: 'string', description: '要输入的文本' },
                },
                required: ['selector', 'text'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_screenshot',
            description: '截取当前页面的截图',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_get_text',
            description: '获取页面元素的文本内容',
            parameters: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: '元素的 CSS 选择器' },
                },
                required: ['selector'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_wait',
            description: '等待页面元素出现',
            parameters: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: '要等待的元素的 CSS 选择器' },
                },
                required: ['selector'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'task_complete',
            description: '任务完成，返回最终结果',
            parameters: {
                type: 'object',
                properties: {
                    result: { type: 'string', description: '任务执行的最终结果或总结' },
                },
                required: ['result'],
            },
        },
    },
];

/**
 * 调用 LLM 获取响应（支持工具调用）
 */
export async function callLLM(
    config: LLMConfig,
    messages: LLMMessage[],
    options: { temperature?: number; maxTokens?: number; tools?: any[] } = {}
): Promise<LLMResponse> {
    const { temperature = 0.7, maxTokens = 2048, tools } = options;

    const body: any = {
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API 调用失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];

    return {
        content: choice?.message?.content || null,
        tool_calls: choice?.message?.tool_calls,
        finish_reason: choice?.finish_reason,
        usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
        } : undefined,
    };
}

/**
 * MCP Agent 系统提示词
 */
export const AGENT_SYSTEM_PROMPT = `你是一个浏览器自动化助手，可以通过工具控制浏览器完成用户的任务。

你有以下工具可用：
- browser_navigate: 导航到 URL
- browser_click: 点击元素
- browser_type: 输入文本
- browser_screenshot: 截图
- browser_get_text: 获取元素文本
- browser_wait: 等待元素出现
- task_complete: 任务完成时调用

执行任务时：
1. 分析用户需求
2. 使用工具一步一步执行操作
3. 每次只调用一个工具
4. 任务完成后调用 task_complete 返回结果

常用选择器示例：
- 文本选择器: "text=登录", "text=搜索"
- CSS 选择器: "#search-input", ".btn-submit"
- 属性选择器: "[placeholder='请输入']"`;

/**
 * 聊天阶段的系统提示词（不使用工具）
 */
export const CHAT_SYSTEM_PROMPT = `你是一个 Playwright 自动化助手，帮助用户规划和讨论浏览器自动化任务。

你可以帮助用户：
1. 理解和分析需求
2. 规划操作步骤
3. 解释如何实现自动化

在讨论完成后，用户可以点击"生成脚本"按钮，系统会自动使用工具执行任务。

请用简洁的中文回复。`;

