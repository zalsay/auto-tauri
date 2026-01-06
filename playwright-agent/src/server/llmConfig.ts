/**
 * LLM 配置服务
 * 从后端 API 获取 LLM 配置，支持 TaskMaster 和自定义配置
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

export interface LLMConfig {
    provider: string;
    model: string;
    apiKey: string;
    baseURL: string;
}

export interface UserConfig {
    id: string;
    email: string;
    balance: number;
    llmProvider: string;
    llmModel: string;
    llmApiKey: string;
    llmBaseUrl: string;
}

/**
 * 调用后端 API
 */
async function apiRequest(path: string, token: string): Promise<any> {
    const url = API_BASE_URL + path;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
}

/**
 * 获取用户信息
 */
export async function getUserConfig(token: string): Promise<UserConfig> {
    return apiRequest('/api/v1/auth/me', token);
}

/**
 * 获取系统 LLM 配置（TaskMaster 模式）
 */
export async function getSystemLLMConfig(token: string): Promise<Partial<LLMConfig>> {
    try {
        const config = await apiRequest('/api/v1/llm-config', token);
        return {
            model: config.llmModel,
            apiKey: config.llmApiKey,
            baseURL: config.llmBaseUrl,
        };
    } catch (error) {
        console.error('Failed to fetch system LLM config:', error);
        // 使用默认配置
        return {
            model: 'google/gemini-3-flash-preview',
            baseURL: 'https://openrouter.ai/api/v1',
        };
    }
}

/**
 * 获取有效的 LLM 配置
 * 遵循与 App.tsx 相同的逻辑：
 * - TaskMaster: 使用系统配置
 * - 自定义: 使用用户配置
 */
export async function getEffectiveLLMConfig(token: string): Promise<LLMConfig> {
    const userConfig = await getUserConfig(token);

    let provider = 'openai';
    let model = userConfig.llmModel;
    let apiKey = userConfig.llmApiKey || '';
    let baseURL = userConfig.llmBaseUrl;

    if (userConfig.llmProvider === 'TaskMaster') {
        // 使用系统配置
        const systemConfig = await getSystemLLMConfig(token);
        if (systemConfig.model) model = systemConfig.model;
        if (systemConfig.baseURL) baseURL = systemConfig.baseURL;
        if (systemConfig.apiKey) apiKey = systemConfig.apiKey;
    } else {
        // 自定义配置默认值
        if (!model) model = 'gpt-4o';
        if (!baseURL) baseURL = 'https://api.openai.com/v1';
    }

    return { provider, model, apiKey, baseURL };
}
