/**
 * llm_config.ts - LLM 配置解析
 * 
 * 负责解析和标准化 LLM 配置参数
 */

import { getOpenRouterApiKey } from './env_loader';

export interface LLMConfig {
    provider: string;
    model: string;
    apiKey: string;
    baseURL?: string;
}

/**
 * 解析 LLM 配置
 * @param input 任务输入对象
 * @returns 标准化的 LLM 配置
 */
export function getLLMConfig(input: any): LLMConfig {
    const llm = input.llm || {};
    const OPENROUTER_API_KEY = getOpenRouterApiKey();

    let provider = llm.provider || input.llmProvider || 'openai';
    let apiKey = llm.apiKey || input.llmApiKey || OPENROUTER_API_KEY;
    let model = llm.model || input.llmModel || 'google/gemini-2.0-flash-exp:free';
    let baseURL = llm.baseURL || undefined;

    // TaskMaster 使用 OpenAI 兼容接口
    if (provider === 'TaskMaster') {
        provider = 'openai';
    }

    // 自动设置 OpenRouter baseURL
    if (!baseURL && (apiKey === OPENROUTER_API_KEY || (apiKey && model.includes('gemini')))) {
        baseURL = 'https://openrouter.ai/api/v1';
    }

    // OpenRouter 使用 OpenAI 兼容接口
    if (baseURL && baseURL.includes('openrouter.ai')) {
        provider = 'openai';
    }

    return { provider, model, apiKey, baseURL };
}

/**
 * 获取屏蔽后的 API Key (用于日志)
 */
export function getMaskedApiKey(apiKey: string): string {
    if (!apiKey) return 'none';
    if (apiKey.length > 8) {
        return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
    }
    return '****';
}
