import { invoke } from '@tauri-apps/api/core';

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMConfig {
    provider: string;
    api_key: string;
    model: string;
    small_model: string;
    expert_provider: string;
    expert_api_key: string;
    expert_model: string;
}

export interface LLMResponse {
    id: string;
    model: string;
    content: string;
    success: boolean;
}

class LLMService {
    private configCache: LLMConfig | null = null;

    async getConfig(): Promise<LLMConfig> {
        if (this.configCache) return this.configCache;
        
        try {
            this.configCache = await invoke<LLMConfig>('get_coding_master_config');
            return this.configCache;
        } catch (e) {
            console.error('[LLM] Failed to load config:', e);
            throw e;
        }
    }

    async callAnthropic(
        messages: LLMMessage[],
        model: string,
        onChunk?: (chunk: string) => void
    ): Promise<LLMResponse> {
        const config = await this.getConfig();
        
        let apiKey = config.api_key;
        if (!apiKey && config.provider === 'anthropic') {
            apiKey = config.expert_api_key;
        }

        if (!apiKey) {
            throw new Error('Anthropic API key not configured');
        }

        const requestBody = {
            model: model || config.model || config.small_model,
            messages: messages.map(msg => ({
                role: msg.role === 'system' ? 'user' : msg.role,
                content: msg.content
            })),
            max_tokens: 4096,
            stream: !!onChunk
        };

        console.log('[LLM] Calling Anthropic API with model:', requestBody.model);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[LLM] Anthropic API error:', errorText);
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        if (onChunk && response.body) {
            return this.streamResponse(response.body, onChunk);
        }

        const result = await response.json();
        
        const content = result.content?.[0]?.text || '';
        console.log('[LLM] Anthropic response received, length:', content.length);

        return {
            id: result.id || 'unknown',
            model: result.model || model,
            content,
            success: true
        };
    }

    async callOpenAI(
        messages: LLMMessage[],
        model: string,
        baseUrl?: string,
        onChunk?: (chunk: string) => void
    ): Promise<LLMResponse> {
        const config = await this.getConfig();
        
        const apiKey = config.api_key;
        const selectedBaseUrl = baseUrl || 'https://api.openai.com/v1';
        const selectedModel = model || config.model || 'gpt-4o';

        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const requestBody = {
            model: selectedModel,
            messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            max_tokens: 4096,
            stream: !!onChunk
        };

        console.log('[LLM] Calling OpenAI API with model:', selectedModel);

        const response = await fetch(`${selectedBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[LLM] OpenAI API error:', errorText);
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        if (onChunk && response.body) {
            return this.streamResponse(response.body, onChunk);
        }

        const result = await response.json();
        
        const content = result.choices?.[0]?.message?.content || '';
        console.log('[LLM] OpenAI response received, length:', content.length);

        return {
            id: result.id || 'unknown',
            model: result.model || selectedModel,
            content,
            success: true
        };
    }

    private async streamResponse(
        body: ReadableStream,
        onChunk: (chunk: string) => void
    ): Promise<LLMResponse> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let accumulatedDelta = '';

        console.log('[LLM] Starting stream response');

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('[LLM] Stream complete, total length:', fullContent.length);
                break;
            }

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            const delta = parsed.delta.text;
                            accumulatedDelta += delta;
                            fullContent += delta;
                            onChunk(accumulatedDelta);
                        } else if (parsed.choices?.[0]?.delta?.content) {
                            const delta = parsed.choices[0].delta.content;
                            accumulatedDelta += delta;
                            fullContent += delta;
                            onChunk(accumulatedDelta);
                        }
                    } catch (e) {
                        // Ignore parse errors for non-JSON lines
                    }
                }
            }
        }

        return {
            id: 'stream-' + Date.now(),
            model: 'streaming',
            content: fullContent,
            success: true
        };
    }

    async chat(
        messages: LLMMessage[],
        model?: string,
        provider?: string,
        onChunk?: (chunk: string) => void
    ): Promise<LLMResponse> {
        const config = await this.getConfig();
        const selectedProvider = provider || config.provider;

        if (selectedProvider === 'anthropic') {
            return this.callAnthropic(messages, model || config.model || config.small_model, onChunk);
        } else {
            return this.callOpenAI(messages, model || config.model, undefined, onChunk);
        }
    }
}

export const llmService = new LLMService();
