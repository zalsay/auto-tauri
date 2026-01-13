/**
 * ai_call.ts - 大模型调用封装
 * 
 * 提供直接调用大模型的统一接口，支持 OpenAI 兼容 API
 */

import { LLMConfig } from './llm_config';
import { log } from './utils';

export interface AICallOptions {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
}

export interface AICallResponse {
    success: boolean;
    content?: string;
    error?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * 直接调用大模型
 * @param config LLM 配置
 * @param userPrompt 用户提示词
 * @param options 可选参数
 * @returns AI 响应
 */
export async function aiCall(
    config: LLMConfig,
    userPrompt: string,
    options: AICallOptions = {}
): Promise<AICallResponse> {
    const {
        systemPrompt = '你是一个有帮助的AI助手。',
        maxTokens = 4096,
        temperature = 0.7
    } = options;

    const baseURL = config.baseURL || 'https://openrouter.ai/api/v1';
    const url = `${baseURL}/chat/completions`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    try {
        log(`[AICall] 正在调用大模型: ${config.model}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'HTTP-Referer': 'https://auto-tauri.local',
                'X-Title': 'Auto-Tauri Sidecar'
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                max_tokens: maxTokens,
                temperature
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            log(`[AICall] API 错误: ${response.status} - ${errorText}`);
            return {
                success: false,
                error: `API错误: ${response.status} - ${errorText}`
            };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        log(`[AICall] 调用成功，响应长度: ${content.length}`);

        return {
            success: true,
            content,
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined
        };
    } catch (e: any) {
        log(`[AICall] 调用失败: ${e.message}`);
        return {
            success: false,
            error: e.message
        };
    }
}

/**
 * 用 JSON 模式调用大模型
 * @param config LLM 配置
 * @param userPrompt 用户提示词
 * @param options 可选参数
 * @returns AI 响应 (尝试解析为 JSON)
 */
export async function aiCallJSON<T = any>(
    config: LLMConfig,
    userPrompt: string,
    options: AICallOptions = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
    const response = await aiCall(config, userPrompt, {
        ...options,
        systemPrompt: (options.systemPrompt || '') + '\n\n请以 JSON 格式回复，不要包含 markdown 代码块。'
    });

    if (!response.success) {
        return { success: false, error: response.error };
    }

    try {
        // 尝试提取 JSON
        let jsonStr = response.content || '';

        // 移除可能的 markdown 代码块
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }

        const data = JSON.parse(jsonStr.trim());
        return { success: true, data };
    } catch (e: any) {
        log(`[AICall] JSON 解析失败: ${e.message}`);
        return { success: false, error: `JSON解析失败: ${e.message}` };
    }
}
