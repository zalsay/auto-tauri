/**
 * opencodeService.ts - Opencode CLI HTTP Server Integration
 * 
 * This module interacts with the opencode CLI's built-in HTTP server
 * (started via `opencode serve --port 4096`).
 * 
 * API Reference: http://127.0.0.1:4096/doc
 * GitHub: https://github.com/anomalyco/opencode
 */

// Opencode CLI server URL (started via local-server)
const OPENCODE_SERVER_URL = import.meta.env.VITE_OPENCODE_SERVER_URL || 'http://127.0.0.1:54096';

// ============ Types ============

export interface OpencodeSession {
    id: string;
    title: string;
    modelId?: string;
    providerId?: string;
    createdAt?: string;
}

export interface OpencodeMessage {
    parts: MessagePart[];
    info?: {
        role: 'user' | 'assistant';
    };
}

export interface MessagePart {
    type: 'text' | 'tool_use' | 'tool_result' | 'reasoning';
    text?: string;
    toolName?: string;
    toolInput?: any;
    toolResult?: any;
    thinking?: string;
}

export interface OpencodeAgent {
    id: string;
    name: string;
    description?: string;
}

export interface OpencodeProvider {
    id: string;
    name: string;
    connected?: boolean;
}

export interface SSEEventCallbacks {
    onMessage?: (message: OpencodeMessage) => void;
    onToolUse?: (toolName: string, input: any) => void;
    onToolResult?: (toolName: string, result: any) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

// ============ API Helper ============

async function opencodeRequest<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${OPENCODE_SERVER_URL}${path}`;
    console.log(`[Opencode] ${options.method || 'GET'} ${url}`);

    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch {
            errorData = { error: errorText };
        }
        throw new Error(errorData.error || errorData.message || `Request failed: ${response.status}`);
    }

    return response.json();
}

// ============ Health & Info ============

/**
 * Check server health
 */
export async function checkHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${OPENCODE_SERVER_URL}/global/health`);
        const data = await response.json();
        console.log('[Opencode] Health check:', data);
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Get server version info
 */
export async function getHealthInfo(): Promise<{ version?: string; status?: string }> {
    try {
        return await opencodeRequest<{ version?: string; status?: string }>('/global/health');
    } catch {
        return {};
    }
}

/**
 * Get API documentation URL
 */
export function getDocUrl(): string {
    return `${OPENCODE_SERVER_URL}/doc`;
}

// ============ Sessions ============

/**
 * Create a new session
 */
export async function createSession(title: string): Promise<OpencodeSession> {
    return opencodeRequest<OpencodeSession>('/session', {
        method: 'POST',
        body: JSON.stringify({ title }),
    });
}

/**
 * List all sessions
 */
export async function listSessions(): Promise<OpencodeSession[]> {
    return opencodeRequest<OpencodeSession[]>('/session');
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<OpencodeSession> {
    return opencodeRequest<OpencodeSession>(`/session/${sessionId}`);
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
    await opencodeRequest<void>(`/session/${sessionId}`, {
        method: 'DELETE',
    });
}

// ============ Messages ============

/**
 * Send a message to a session
 */
export async function sendMessage(
    sessionId: string,
    text: string,
    agent?: string
): Promise<OpencodeMessage> {
    const parts: MessagePart[] = [{ type: 'text', text }];

    // If agent specified, prepend @agent mention
    if (agent) {
        parts[0].text = `@${agent} ${text}`;
    }

    return opencodeRequest<OpencodeMessage>(`/session/${sessionId}/message`, {
        method: 'POST',
        body: JSON.stringify({ parts }),
    });
}

/**
 * Send a task for autonomous execution using /cowork command
 */
export async function sendCoworkCommand(
    sessionId: string,
    task: string
): Promise<OpencodeMessage> {
    return sendMessage(sessionId, `/cowork ${task}`);
}
/**
 * Send a message with streaming response - captures real-time output
 */
export async function sendMessageStreaming(
    sessionId: string,
    text: string,
    onChunk: (chunk: string) => void
): Promise<OpencodeMessage | null> {
    const url = `${getOpencodeServerUrl()}/session/${sessionId}/message`;
    console.log(`[Opencode] POST (streaming wrapper) ${url}`);

    // Set a long timeout (30 minutes) for AI tasks
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);

    try {
        // Just use standard sendMessage logic but with long timeout
        // We rely on SSE for the actual chunks
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts: [{ type: 'text', text }] }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

function handleParsedData(data: any, onChunk: (chunk: string) => void) {
    console.log('[Opencode] handleParsedData called with:', JSON.stringify(data).slice(0, 200));

    // Handle opencode message format with info + parts
    if (data.parts && Array.isArray(data.parts)) {
        console.log('[Opencode] Found parts array, length:', data.parts.length);
        data.parts.forEach((part: MessagePart, index: number) => {
            console.log(`[Opencode] Processing part ${index}:`, part.type, part.text?.slice(0, 50));
            if (part.type === 'text' && part.text) {
                console.log('[Opencode] Calling onChunk with text');
                onChunk(part.text);
            }
        });
        return;
    }

    // Handle simple text response
    if (data.type === 'text' || data.text) {
        const text = data.text || data.content || '';
        if (text) {
            console.log('[Opencode] Calling onChunk with simple text');
            onChunk(text);
        }
        return;
    }

    // Check for thinking/reasoning content
    if (data.thinking || data.reasoning || data.thought) {
        const thinking = data.thinking || data.reasoning || data.thought;
        console.log('[Opencode] Found thinking content:', thinking.slice(0, 50));
        onChunk(`[Thinking] ${thinking}`);
        return;
    }

    // Log unknown format
    console.log('[Opencode] Unknown data keys:', Object.keys(data));

    // Handle tool events
    if (data.type === 'tool_use') {
        onChunk(`[Tool] 调用 ${data.name || data.toolName}`);
        return;
    }
    if (data.type === 'tool_result') {
        onChunk(`[Tool] 完成`);
        return;
    }

    console.log('[Opencode] No matching format found for data');
}

/**
 * Send cowork command with streaming output
 */
export async function sendCoworkCommandStreaming(
    sessionId: string,
    task: string,
    onChunk: (chunk: string) => void,
    rootPath?: string
): Promise<OpencodeMessage | null> {
    let finalTask = `/cowork ${task}`;

    // Supplement the prompt with folder restriction if rootPath is provided
    if (rootPath) {
        finalTask = `/cowork Important: You are strictly restricted to working within the directory: ${rootPath}. Do not access or modify files outside this directory.\n\n${task}`;
    }

    return sendMessageStreaming(sessionId, finalTask, onChunk);
}

// ============ Agents ============

/**
 * List available agents
 */
export async function listAgents(): Promise<OpencodeAgent[]> {
    return opencodeRequest<OpencodeAgent[]>('/agent');
}

/**
 * Check if specific oh-my-opencode agents are available
 */
export async function checkOmoAgents(): Promise<string[]> {
    const agents = await listAgents();
    const omoAgentNames = ['sisyphus', 'oracle', 'librarian', 'explore', 'cowork', 'frontend-ui-ux-engineer'];
    return omoAgentNames.filter(name =>
        agents.some(a => (a.name || a.id).toLowerCase().includes(name.toLowerCase()))
    );
}

// ============ Providers ============

/**
 * Get provider info
 */
export async function getProviders(): Promise<{ all?: OpencodeProvider[]; connected?: OpencodeProvider[] }> {
    return opencodeRequest<{ all?: OpencodeProvider[]; connected?: OpencodeProvider[] }>('/provider');
}

// ============ Commands ============

/**
 * List available commands
 */
export async function listCommands(): Promise<{ id: string; name: string }[]> {
    return opencodeRequest<{ id: string; name: string }[]>('/command');
}

// ============ MCP Servers ============

/**
 * Get MCP servers info
 */
export async function getMcpServers(): Promise<Record<string, any>> {
    return opencodeRequest<Record<string, any>>('/mcp');
}

// ============ SSE Events ============

/**
 * Subscribe to SSE events for a session
 * Use this for real-time streaming responses
 */
/**
 * Subscribe to SSE events for a session
 * Use this for real-time streaming responses
 */
export function subscribeToSession(
    sessionId: string,
    callbacks: SSEEventCallbacks
): EventSource {
    const url = `${OPENCODE_SERVER_URL}/global/event`;
    console.log('[Opencode] Subscribing to SSE:', url);

    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
        console.log('[Opencode] SSE Connected');
    };

    eventSource.onmessage = (event) => {
        try {
            // Note: opencode server might wrap data in double JSON stringify
            let payload = JSON.parse(event.data);
            if (typeof payload === 'string') {
                payload = JSON.parse(payload);
            }
            // Or if it's the standard format: { type: "...", properties: { ... } }
            // In server.ts: stream.writeSSE({ data: JSON.stringify(event) })
            // event is { type: "...", properties: { ... } }

            // Handle connection event
            if (payload.type === 'server.connected') {
                console.log('[Opencode] Server connected event received');
                return;
            }

            // Handle heartbeat
            if (payload.type === 'server.heartbeat') {
                return;
            }

            // Filter events for this session
            const props = payload.properties || {};
            // Check sessionID in various places inside properties
            const eventSessionId = props.sessionID || props.info?.sessionID || props.part?.sessionID;

            if (eventSessionId && eventSessionId !== sessionId) {
                return; // Ignore events from other sessions
            }

            // Log filtered events for debugging
            if (eventSessionId) {
                console.log('[Opencode] SSE Event:', payload.type, props);
            }

            // Handle message part updates (Scanning for parts)
            if (payload.type === 'message.part.updated') {
                const part = props.part;
                if (!part) return;

                // Handle text
                if (part.type === 'text' && part.text) {
                    if (callbacks.onMessage) {
                        callbacks.onMessage({ parts: [part] });
                    }
                }

                // Handle reasoning/thinking
                else if (part.type === 'reasoning') {
                    const text = part.text || part.thinking;
                    if (text && callbacks.onMessage) {
                        callbacks.onMessage({
                            parts: [{
                                type: 'reasoning',
                                text: text
                            }]
                        });
                    }
                }

                // Handle tool use
                else if (part.type === 'tool') {
                    if (part.state?.status === 'running') {
                        if (callbacks.onToolUse) {
                            callbacks.onToolUse(part.tool, part.state.input);
                        }
                    } else if (part.state?.status === 'completed') {
                        if (callbacks.onToolResult) {
                            callbacks.onToolResult(part.tool, part.state.output);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[Opencode] Failed to parse SSE event:', e);
        }
    };

    eventSource.onerror = (error) => {
        console.error('[Opencode] SSE error:', error);
        if (callbacks.onError) {
            // Don't error immediately on connection issues, let it retry or let caller handle timeout
            // callbacks.onError(new Error('SSE connection error'));
        }
    };

    return eventSource;
}

// ============ High-Level Helpers ============

/**
 * Execute a task using the cowork agent
 * This is a high-level helper that creates a session and sends a cowork command
 */
export async function executeTask(
    taskDescription: string,
    onUpdate?: (log: string) => void
): Promise<{ sessionId: string; result: OpencodeMessage }> {
    // 1. Check health
    const isHealthy = await checkHealth();
    if (!isHealthy) {
        throw new Error('Opencode 服务器不可用，请运行 `cd local-server && npm run serve`');
    }
    if (onUpdate) onUpdate('✓ 服务器连接成功');

    // 2. Create session
    const session = await createSession(`Task: ${taskDescription.slice(0, 50)}...`);
    if (onUpdate) onUpdate(`✓ 会话已创建: ${session.id.slice(0, 8)}...`);

    // 3. Send cowork command
    if (onUpdate) onUpdate('正在执行任务...');
    const result = await sendCoworkCommand(session.id, taskDescription);
    if (onUpdate) onUpdate('✓ 任务执行完成');

    return { sessionId: session.id, result };
}

/**
 * Get opencode server URL
 */
export function getOpencodeServerUrl(): string {
    return OPENCODE_SERVER_URL;
}
