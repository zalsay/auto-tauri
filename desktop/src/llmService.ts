import { invoke } from '@tauri-apps/api/core';

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
}

export interface LLMConfig {
    anthropicApiKey?: string;
    openaiBaseUrl?: string;
    openaiApiKey?: string;
    openaiModel?: string;
}

export interface LLMResponse {
    success: boolean;
    response?: string;
    model?: string;
    id?: string;
    error?: string;
}

/**
 * Initialize the LLM service with provider configurations
 */
export async function initLLMService(config: LLMConfig): Promise<void> {
    await invoke('init_llm_service', {
        anthropicApiKey: config.anthropicApiKey || null,
        openaiBaseUrl: config.openaiBaseUrl || null,
        openaiApiKey: config.openaiApiKey || null,
        openaiModel: config.openaiModel || null,
    });
}

/**
 * Send a chat request to the LLM with Anthropic message format
 *
 * @param messages - Array of messages with role and content
 * @param model - Model ID (e.g., 'claude-sonnet-4-20250514', 'gpt-4o')
 * @param options - Optional parameters
 * @returns LLM response
 */
export async function llmChat(
    messages: LLMMessage[],
    model: string,
    options?: {
        maxTokens?: number;
        temperature?: number;
    }
): Promise<LLMResponse> {
    const messagesJson = JSON.stringify(messages);

    return await invoke('llm_chat', {
        messagesJson,
        model,
        maxTokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
    });
}

/**
 * Simple chat with system prompt (convenience function)
 *
 * @param system - System prompt
 * @param userMessage - User message
 * @param model - Model ID
 * @returns LLM response
 */
export async function llmChatWithSystem(
    system: string,
    userMessage: string,
    model: string
): Promise<LLMResponse> {
    return await invoke('llm_chat_with_system', {
        system,
        userMessage,
        model,
    });
}

/**
 * Create a system message
 */
export function createSystemMessage(content: string): LLMMessage {
    return { role: 'system', content };
}

/**
 * Create a user message
 */
export function createUserMessage(content: string, name?: string): LLMMessage {
    return { role: 'user', content, ...(name && { name }) };
}

/**
 * Create an assistant message
 */
export function createAssistantMessage(content: string): LLMMessage {
    return { role: 'assistant', content };
}

/**
 * Build conversation context for LLM
 */
export function buildConversationContext(
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    currentMessage: string
): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // Add system prompt
    messages.push(createSystemMessage(systemPrompt));

    // Add conversation history
    for (const msg of history) {
        if (msg.role === 'user') {
            messages.push(createUserMessage(msg.content));
        } else {
            messages.push(createAssistantMessage(msg.content));
        }
    }

    // Add current message
    messages.push(createUserMessage(currentMessage));

    return messages;
}

/**
 * Claude (Anthropic) specific message builder
 */
export function buildClaudeMessages(
    system: string,
    userMessages: string[]
): LLMMessage[] {
    const messages: LLMMessage[] = [];

    messages.push({ role: 'system', content: system });

    for (const msg of userMessages) {
        messages.push({ role: 'user', content: msg });
    }

    return messages;
}

/**
 * Common system prompts for different tasks
 */
export const SYSTEM_PROMPTS = {
    codingMaster: `你是 Master Agent，一个专业的 AI 开发助手。

你的职责：
1. 分析项目需求
2. 制定开发计划和测试计划
3. 执行代码开发任务
4. 调试和修复问题

工作流程：
1. 先理解用户需求
2. 根据需求选择合适的工具和技能
3. 逐步执行任务
4. 实时报告进度和结果
5. 完成任务后总结输出

重要：
- 始终使用中文回复
- 执行前先思考步骤
- 遇到错误时分析原因并重试
- 保持对话上下文连贯`,

    architect: `你是资深软件架构师。你的任务是基于用户需求分析并生成详细的开发计划。

请按照以下格式输出开发计划：

## 开发计划

### Step 1: [步骤标题]
[步骤详细说明，包含操作命令和关键代码片段]

...

### Step N: 测试与验证
[最后一步必须是测试验证]

要求：
- 第一个步骤必须是"项目初始化"或"环境准备"
- 每个步骤要包含具体的命令和代码
- 步骤数量根据项目复杂度决定`,

    qaLead: `你是 QA 负责人。基于已生成的开发计划，生成测试计划。

请按照以下格式输出测试计划：

## 测试计划

### 单元测试
- [测试项]

### 集成测试
- [测试项]

### 手动验证
- [验证步骤]

### 成功标准
- [标准]`,

    codeReviewer: `你是资深代码审查专家。审查代码并提供改进建议。

请分析：
1. 代码质量
2. 潜在问题
3. 性能优化
4. 安全性检查
5. 最佳实践建议`,
};

/**
 * Example usage
 */
export async function exampleUsage() {
    // Initialize service
    await initLLMService({
        anthropicApiKey: 'sk-ant-api03-...',
    });

    // Simple chat
    const response = await llmChatWithSystem(
        SYSTEM_PROMPTS.codingMaster,
        '请分析需求并生成开发计划：创建一个 Todo App',
        'claude-sonnet-4-20250514'
    );

    if (response.success) {
        console.log('Response:', response.response);
    }

    // Advanced usage with conversation history
    const messages = buildConversationContext(
        SYSTEM_PROMPTS.codingMaster,
        [
            { role: 'user', content: '我想要一个 Web 应用' },
            { role: 'assistant', content: '好的，请问是什么类型的 Web 应用？' },
            { role: 'user', content: '一个 Todo 待办事项管理应用' },
        ],
        '现在请生成开发计划'
    );

    const advancedResponse = await llmChat(messages, 'claude-sonnet-4-20250514', {
        maxTokens: 4096,
        temperature: 0.7,
    });
}
