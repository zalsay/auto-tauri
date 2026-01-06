import React, { useState, useEffect, useCallback, useRef } from 'react';
import ChatPanel from '../components/ChatPanel';
import BrowserPreview from '../components/BrowserPreview';
import './AgentStudio.css';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    codeSnippet?: string;
}

interface BrowserState {
    url: string;
    title: string;
    isLoading: boolean;
    screenshot?: string;
}

const WS_URL = 'ws://localhost:8765';

export const AgentStudio: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [generatedCode, setGeneratedCode] = useState('');
    const [browserState, setBrowserState] = useState<BrowserState>({
        url: '',
        title: '',
        isLoading: false,
    });
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [phase, setPhase] = useState<'discussing' | 'ready_to_generate' | 'generating' | 'generated' | 'executing' | 'completed'>('discussing');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 连接 WebSocket
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log('WebSocket 已连接');
            setIsConnected(true);

            // 发送认证 token
            const token = localStorage.getItem('auth_token') || '';
            if (token) {
                ws.send(JSON.stringify({
                    type: 'auth',
                    payload: { token },
                    timestamp: Date.now(),
                }));
                console.log('已发送认证信息');
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWSMessage(data);
            } catch (error) {
                console.error('解析消息失败:', error);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket 已断开');
            setIsConnected(false);
            // 自动重连
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
        };

        wsRef.current = ws;
    }, []);

    // 处理 WebSocket 消息
    const handleWSMessage = (data: any) => {
        switch (data.type) {
            case 'session_init':
                setSessionId(data.payload.sessionId);
                break;

            case 'agent_action':
                if (data.payload.message) {
                    setMessages((prev) => [...prev, data.payload.message]);
                }
                if (data.payload.browserState) {
                    setBrowserState(data.payload.browserState);
                }
                if (data.payload.generatedCode) {
                    setGeneratedCode(data.payload.generatedCode);
                }
                if (data.payload.phase) {
                    setPhase(data.payload.phase);
                }
                break;

            case 'error':
                setMessages((prev) => [
                    ...prev,
                    {
                        id: Date.now().toString(),
                        role: 'system',
                        content: `❌ 错误: ${data.payload.error}`,
                        timestamp: Date.now(),
                    },
                ]);
                break;

            case 'loading':
                setIsLoading(data.payload.isLoading);
                setLoadingMessage(data.payload.message || '');
                break;
        }
    };

    // 发送消息
    const handleSendMessage = (content: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
        }

        // 添加用户消息到列表
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content,
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // 发送到服务器
        wsRef.current.send(
            JSON.stringify({
                type: 'user_input',
                payload: { content },
                timestamp: Date.now(),
            })
        );
    };

    // 确认生成代码
    const handleConfirmGenerate = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'confirm_generate',
            payload: {},
            timestamp: Date.now(),
        }));
    };

    // 确认执行代码
    const handleConfirmExecute = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'confirm_execute',
            payload: {},
            timestamp: Date.now(),
        }));
    };

    // 保存脚本
    const handleSaveScript = async () => {
        if (!sessionId || !generatedCode) return;

        const name = prompt('请输入脚本名称:');
        if (!name) return;

        try {
            const response = await fetch('http://localhost:8766/api/scripts/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    name,
                    description: `自动生成的脚本 - ${new Date().toLocaleDateString()}`,
                    storageType: 'database',
                }),
            });

            const result = await response.json();
            if (result.success) {
                alert(`✅ ${result.message}`);
            } else {
                alert(`❌ 保存失败: ${result.error}`);
            }
        } catch (error) {
            alert('❌ 保存失败，请检查服务是否运行');
        }
    };

    // 初始化连接
    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            wsRef.current?.close();
        };
    }, [connect]);

    return (
        <div className="agent-studio">
            <div className="studio-header">
                <h2>🎭 Playwright Agent Studio</h2>
                <p>通过对话生成自动化脚本</p>
            </div>

            <div className="studio-content">
                <div className="left-panel">
                    <ChatPanel
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        isConnected={isConnected}
                        isLoading={isLoading}
                        loadingMessage={loadingMessage}
                        phase={phase}
                        onConfirmGenerate={handleConfirmGenerate}
                        onConfirmExecute={handleConfirmExecute}
                    />
                </div>

                <div className="right-panel">
                    <BrowserPreview
                        browserState={browserState}
                        generatedCode={generatedCode}
                        onSaveScript={handleSaveScript}
                        onExecuteScript={handleConfirmExecute}
                    />
                </div>
            </div>
        </div>
    );
};

export default AgentStudio;
