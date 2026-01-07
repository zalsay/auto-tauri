import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { WSMessage, ChatMessage, AgentSession, ActionIntent, AgentPhase } from '../types';
import { parser } from '../agent/parser';
import { codeGenerator, CodeGenerator } from '../agent/codeGenerator';
import { browserManager } from './browserManager';
import { getEffectiveLLMConfig, LLMConfig } from './llmConfig';
import { callLLM, AGENT_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, BROWSER_TOOLS, LLMMessage, ToolCall } from './llmService';
import * as flowRecorder from './flowRecorder';

/**
 * WebSocket 服务器
 * 处理前端与 Agent 的实时通信
 */
export class AgentWSServer {
    private wss: WebSocketServer | null = null;
    private sessions: Map<string, AgentSession> = new Map();
    private clients: Map<string, WebSocket> = new Map();

    /**
     * 启动 WebSocket 服务器
     */
    start(port: number = 8765): void {
        this.wss = new WebSocketServer({ port });
        console.log(`WebSocket 服务器已启动，端口: ${port}`);

        this.wss.on('connection', (ws) => {
            const sessionId = uuidv4();
            console.log(`新连接: ${sessionId}`);

            // 创建会话
            const session: AgentSession = {
                id: sessionId,
                userId: '',
                authToken: '',
                phase: 'discussing',
                flowRecord: null,
                lastGeneratedCode: '',
                messages: [],
                actions: [],
                generatedCode: '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            this.sessions.set(sessionId, session);
            this.clients.set(sessionId, ws);

            // 发送会话初始化消息
            this.send(ws, {
                type: 'session_init',
                payload: { sessionId },
                timestamp: Date.now(),
            });

            // 处理消息
            ws.on('message', async (data) => {
                try {
                    const message: WSMessage = JSON.parse(data.toString());
                    await this.handleMessage(sessionId, message, ws);
                } catch (error) {
                    this.sendError(ws, '消息解析失败');
                }
            });

            // 处理断开连接
            ws.on('close', () => {
                console.log(`连接断开: ${sessionId}`);
                this.sessions.delete(sessionId);
                this.clients.delete(sessionId);
            });
        });
    }

    /**
     * 处理接收到的消息
     */
    private async handleMessage(sessionId: string, message: WSMessage, ws: WebSocket): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        switch (message.type) {
            case 'auth':
                // 接收认证 token
                session.authToken = message.payload.token || '';
                console.log(`会话 ${sessionId} 已认证`);
                break;

            case 'user_input':
                await this.handleUserInput(session, message.payload.content, ws);
                break;

            case 'confirm_generate':
                // 用户确认生成代码
                await this.handleConfirmGenerate(session, ws);
                break;

            case 'confirm_execute':
                // 用户确认执行代码
                await this.handleConfirmExecute(session, ws);
                break;

            case 'browser_event':
                // 处理浏览器事件（录制模式）
                break;
        }
    }

    /**
     * 处理用户输入
     */
    private async handleUserInput(session: AgentSession, content: string, ws: WebSocket): Promise<void> {
        // 记录用户消息
        const userMessage: ChatMessage = {
            id: uuidv4(),
            role: 'user',
            content,
            timestamp: Date.now(),
        };
        session.messages.push(userMessage);

        // 解析用户意图
        const intent = parser.parse(content);

        if (intent) {
            // 执行浏览器操作
            try {
                let page = browserManager.getPage();
                if (!page) {
                    page = await browserManager.launch();
                }

                const state = await browserManager.executeAction(intent.action, {
                    url: intent.url,
                    selector: intent.selector,
                    value: intent.value,
                });

                // 生成代码片段
                const code = codeGenerator.addAction(intent);
                session.actions.push(intent);
                session.generatedCode = codeGenerator.generateFullScript();

                // 发送 Agent 响应
                const agentMessage: ChatMessage = {
                    id: uuidv4(),
                    role: 'assistant',
                    content: `✅ ${intent.description}`,
                    timestamp: Date.now(),
                    codeSnippet: code,
                };
                session.messages.push(agentMessage);

                // 发送操作结果
                this.send(ws, {
                    type: 'agent_action',
                    payload: {
                        message: agentMessage,
                        browserState: state,
                        generatedCode: session.generatedCode,
                    },
                    timestamp: Date.now(),
                });

            } catch (error: any) {
                this.sendError(ws, `操作执行失败: ${error.message}`);
            }
        } else {
            // 无法通过模式匹配识别，尝试调用 LLM
            await this.handleWithLLM(session, content, ws);
        }

        session.updatedAt = Date.now();
    }

    /**
     * 使用 LLM 处理用户输入
     */
    private async handleWithLLM(session: AgentSession, content: string, ws: WebSocket): Promise<void> {
        // 检查是否有认证 token
        if (!session.authToken) {
            const agentMessage: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: '请先登录后再使用 AI 对话功能。',
                timestamp: Date.now(),
            };
            session.messages.push(agentMessage);
            this.send(ws, {
                type: 'agent_action',
                payload: { message: agentMessage },
                timestamp: Date.now(),
            });
            return;
        }

        // 发送 loading 状态
        this.send(ws, {
            type: 'loading',
            payload: { isLoading: true, message: '正在思考中...' },
            timestamp: Date.now(),
        });

        try {
            // 获取 LLM 配置
            const llmConfig = await getEffectiveLLMConfig(session.authToken);
            console.log('LLM 配置:', { model: llmConfig.model, baseURL: llmConfig.baseURL });

            // 构建消息历史
            const llmMessages: LLMMessage[] = [
                { role: 'system', content: AGENT_SYSTEM_PROMPT },
                ...session.messages.slice(-10).map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            ];

            // 调用 LLM
            const response = await callLLM(llmConfig, llmMessages);
            console.log('LLM 响应:', (response.content || '').substring(0, 100));

            // 创建或更新流程记录
            if (!session.flowRecord) {
                session.flowRecord = await flowRecorder.createFlowRecord(
                    session.userId || 'anonymous',
                    content
                );
            }
            await flowRecorder.addDiscussion(session.flowRecord, `AI: ${response.content || ''}`);

            // 设置阶段为可生成代码
            session.phase = 'ready_to_generate';

            // 创建响应消息
            const agentMessage: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: response.content + '\n\n---\n💡 如果需求已明确，请点击下方「生成脚本」按钮。',
                timestamp: Date.now(),
            };
            session.messages.push(agentMessage);

            // 发送响应（同时关闭 loading）
            this.send(ws, {
                type: 'loading',
                payload: { isLoading: false },
                timestamp: Date.now(),
            });

            this.send(ws, {
                type: 'agent_action',
                payload: {
                    message: agentMessage,
                    phase: 'ready_to_generate',
                },
                timestamp: Date.now(),
            });

        } catch (error: any) {
            console.error('LLM 调用失败:', error);

            // 关闭 loading
            this.send(ws, {
                type: 'loading',
                payload: { isLoading: false },
                timestamp: Date.now(),
            });

            // 发送错误消息
            this.sendError(ws, `AI 响应失败: ${error.message}`);
        }
    }

    /**
     * 发送阶段变更通知
     */
    private sendPhaseChange(ws: WebSocket, phase: AgentPhase, message?: string): void {
        this.send(ws, {
            type: 'agent_action',
            payload: {
                phase,
                phaseMessage: message,
            },
            timestamp: Date.now(),
        });
    }

    /**
     * 处理确认生成代码
     */
    private async handleConfirmGenerate(session: AgentSession, ws: WebSocket): Promise<void> {
        if (!session.authToken) {
            this.sendError(ws, '请先登录');
            return;
        }

        session.phase = 'generating';
        this.sendPhaseChange(ws, 'generating', '正在生成代码...');

        // 发送 loading
        this.send(ws, {
            type: 'loading',
            payload: { isLoading: true, message: '正在生成 Playwright 代码...' },
            timestamp: Date.now(),
        });

        try {
            const llmConfig = await getEffectiveLLMConfig(session.authToken);

            // 构建代码生成提示
            const codeGenPrompt = `基于我们之前的讨论，请生成完整的 Playwright TypeScript 代码。

要求：
1. 使用 Node.js/TypeScript 语法
2. 代码应该是可直接执行的完整脚本
3. 包含错误处理
4. 添加必要的注释

请只返回代码，不要其他解释。代码用 \`\`\`typescript 和 \`\`\` 包裹。`;

            const messages: LLMMessage[] = [
                { role: 'system', content: AGENT_SYSTEM_PROMPT },
                ...session.messages.slice(-15).map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
                { role: 'user', content: codeGenPrompt },
            ];

            const response = await callLLM(llmConfig, messages, { maxTokens: 4096 });

            // 提取代码
            const responseContent = response.content || '';
            const codeMatch = responseContent.match(/```typescript\n([\s\S]*?)```/);
            const code = codeMatch ? codeMatch[1].trim() : responseContent;

            session.lastGeneratedCode = code || '';
            session.phase = 'generated';

            // 保存到流程记录
            if (session.flowRecord) {
                await flowRecorder.saveGeneratedCode(session.flowRecord, code);
            }

            // 关闭 loading
            this.send(ws, {
                type: 'loading',
                payload: { isLoading: false },
                timestamp: Date.now(),
            });

            // 发送生成的代码
            const codeMessage: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: '✅ 代码已生成！请查看右侧代码面板，确认后点击「开始执行」按钮。',
                timestamp: Date.now(),
                codeSnippet: code || undefined,
            };
            session.messages.push(codeMessage);

            this.send(ws, {
                type: 'agent_action',
                payload: {
                    message: codeMessage,
                    phase: 'generated',
                    generatedCode: code,
                },
                timestamp: Date.now(),
            });

        } catch (error: any) {
            session.phase = 'ready_to_generate';
            this.send(ws, {
                type: 'loading',
                payload: { isLoading: false },
                timestamp: Date.now(),
            });
            this.sendError(ws, `代码生成失败: ${error.message}`);
        }
    }

    /**
     * 处理确认执行代码 - 使用 LLM 工具调用循环
     */
    private async handleConfirmExecute(session: AgentSession, ws: WebSocket): Promise<void> {
        if (!session.authToken) {
            this.sendError(ws, '请先登录');
            return;
        }

        session.phase = 'executing';
        this.sendPhaseChange(ws, 'executing', '正在执行...');

        this.send(ws, {
            type: 'loading',
            payload: { isLoading: true, message: '正在启动浏览器自动化...' },
            timestamp: Date.now(),
        });

        try {
            // 启动浏览器
            let page = browserManager.getPage();
            if (!page) {
                page = await browserManager.launch();
            }

            // 获取 LLM 配置
            const llmConfig = await getEffectiveLLMConfig(session.authToken);

            // 构建任务描述
            const taskDescription = session.messages
                .filter(m => m.role === 'user')
                .map(m => m.content)
                .join('\n');

            // 初始化消息
            const messages: LLMMessage[] = [
                { role: 'system', content: AGENT_SYSTEM_PROMPT },
                { role: 'user', content: `请完成以下任务：\n${taskDescription}` },
            ];

            const steps: string[] = [];
            let maxIterations = 20;
            let taskCompleted = false;
            let finalResult = '';

            // Agent 循环
            while (maxIterations > 0 && !taskCompleted) {
                maxIterations--;

                // 调用 LLM
                const response = await callLLM(llmConfig, messages, {
                    tools: BROWSER_TOOLS,
                    maxTokens: 2048,
                });

                // 如果有工具调用
                if (response.tool_calls && response.tool_calls.length > 0) {
                    for (const toolCall of response.tool_calls) {
                        const toolName = toolCall.function.name;
                        const toolArgs = JSON.parse(toolCall.function.arguments);

                        console.log(`执行工具: ${toolName}`, toolArgs);

                        // 发送步骤更新
                        this.send(ws, {
                            type: 'loading',
                            payload: { isLoading: true, message: `执行: ${toolName}...` },
                            timestamp: Date.now(),
                        });

                        let toolResult = '';

                        try {
                            // 执行浏览器操作
                            switch (toolName) {
                                case 'browser_navigate':
                                    await page.goto(toolArgs.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                    toolResult = `已导航到 ${toolArgs.url}`;
                                    steps.push(`✅ 导航到 ${toolArgs.url}`);
                                    break;

                                case 'browser_click':
                                    await page.click(toolArgs.selector, { timeout: 10000 });
                                    toolResult = `已点击 ${toolArgs.selector}`;
                                    steps.push(`✅ 点击 ${toolArgs.selector}`);
                                    break;

                                case 'browser_type':
                                    await page.fill(toolArgs.selector, toolArgs.text, { timeout: 10000 });
                                    toolResult = `已输入文本到 ${toolArgs.selector}`;
                                    steps.push(`✅ 输入 "${toolArgs.text}" 到 ${toolArgs.selector}`);
                                    break;

                                case 'browser_screenshot':
                                    const screenshot = await page.screenshot({ type: 'png' });
                                    toolResult = '截图已完成';
                                    steps.push(`✅ 截图完成`);
                                    break;

                                case 'browser_get_text':
                                    const element = await page.locator(toolArgs.selector).first();
                                    const text = await element.textContent();
                                    toolResult = `获取到文本: ${text}`;
                                    steps.push(`✅ 获取文本: ${text?.substring(0, 100)}...`);
                                    break;

                                case 'browser_wait':
                                    await page.waitForSelector(toolArgs.selector, { timeout: 10000 });
                                    toolResult = `元素已出现: ${toolArgs.selector}`;
                                    steps.push(`✅ 等待元素 ${toolArgs.selector}`);
                                    break;

                                case 'task_complete':
                                    taskCompleted = true;
                                    finalResult = toolArgs.result;
                                    toolResult = toolArgs.result;
                                    steps.push(`🎉 任务完成: ${toolArgs.result}`);
                                    break;

                                default:
                                    toolResult = `未知工具: ${toolName}`;
                                    steps.push(`⚠️ 未知工具: ${toolName}`);
                            }
                        } catch (error: any) {
                            toolResult = `操作失败: ${error.message}`;
                            steps.push(`❌ ${toolName} 失败: ${error.message}`);
                        }

                        // 添加助手消息和工具结果到历史
                        messages.push({
                            role: 'assistant',
                            content: null,
                            tool_calls: [toolCall],
                        });
                        messages.push({
                            role: 'tool',
                            content: toolResult,
                            tool_call_id: toolCall.id,
                        });

                        // 短暂等待
                        await page.waitForTimeout(500);
                    }
                } else if (response.content) {
                    // LLM 返回文本响应，可能是完成或需要更多信息
                    finalResult = response.content;
                    break;
                } else {
                    break;
                }
            }

            session.phase = 'completed';

            // 构建结果消息
            const stepsText = steps.join('\n');
            const result = `执行完成!\n\n执行步骤:\n${stepsText}${finalResult ? '\n\n结果: ' + finalResult : ''}`;

            // 保存执行结果
            if (session.flowRecord) {
                await flowRecorder.saveExecutionResult(session.flowRecord, result);
            }

            this.send(ws, {
                type: 'loading',
                payload: { isLoading: false },
                timestamp: Date.now(),
            });

            const resultMessage: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: `✅ ${result}`,
                timestamp: Date.now(),
            };
            session.messages.push(resultMessage);

            // 获取浏览器状态
            const browserState = await browserManager.getState();

            this.send(ws, {
                type: 'agent_action',
                payload: {
                    message: resultMessage,
                    phase: 'completed',
                    browserState,
                },
                timestamp: Date.now(),
            });

        } catch (error: any) {
            session.phase = 'generated';
            this.send(ws, {
                type: 'loading',
                payload: { isLoading: false },
                timestamp: Date.now(),
            });
            this.sendError(ws, `执行失败: ${error.message}`);
        }
    }

    /**
     * 发送消息
     */
    private send(ws: WebSocket, message: WSMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    /**
     * 发送错误消息
     */
    private sendError(ws: WebSocket, error: string): void {
        this.send(ws, {
            type: 'error',
            payload: { error },
            timestamp: Date.now(),
        });
    }

    /**
     * 获取会话
     */
    getSession(sessionId: string): AgentSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * 获取生成的完整代码
     */
    getGeneratedCode(sessionId: string): string | null {
        const session = this.sessions.get(sessionId);
        return session?.generatedCode || null;
    }

    /**
     * 停止服务器
     */
    stop(): void {
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
    }
}

export const wsServer = new AgentWSServer();
