import React, { useState, useRef, useEffect } from 'react';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    codeSnippet?: string;
}

type AgentPhase = 'discussing' | 'ready_to_generate' | 'generating' | 'generated' | 'executing' | 'completed';

interface ChatPanelProps {
    messages: Message[];
    onSendMessage: (content: string) => void;
    isConnected: boolean;
    isLoading?: boolean;
    loadingMessage?: string;
    phase?: AgentPhase;
    onConfirmGenerate?: () => void;
    onConfirmExecute?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
    messages,
    onSendMessage,
    isConnected,
    isLoading = false,
    loadingMessage = '',
    phase = 'discussing',
    onConfirmGenerate,
    onConfirmExecute,
}) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && isConnected) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    const quickCommands = [
        '打开淘宝',
        '搜索 iPhone',
        '点击搜索按钮',
        '截图',
    ];

    return (
        <div className="chat-panel">
            <div className="chat-header">
                <h3>🤖 Playwright Agent</h3>
                <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}>
                    {isConnected ? '已连接' : '未连接'}
                </span>
            </div>

            <div className="messages-container">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <p>👋 你好！我是 Playwright Agent</p>
                        <p>告诉我你想要自动化的操作，例如：</p>
                        <ul>
                            <li>"打开淘宝"</li>
                            <li>"搜索 iPhone 15"</li>
                            <li>"点击第一个商品"</li>
                        </ul>
                    </div>
                )}

                {messages.map((msg) => {
                    // 检测是否为错误消息
                    const isError = msg.role === 'system' && msg.content.includes('❌');
                    const errorContent = isError ? msg.content.replace('❌ 错误: ', '').trim() : '';

                    // 一键解决bug的处理函数
                    const handleFixBug = () => {
                        const fixPrompt = `我遇到了以下错误，请帮我分析原因并给出解决方案：

错误信息：${errorContent}

请：
1. 分析可能的错误原因
2. 提供具体的解决步骤
3. 如果需要执行操作，请生成对应的 Playwright 代码`;
                        onSendMessage(fixPrompt);
                    };

                    return (
                        <div key={msg.id} className={`message ${msg.role}`}>
                            <div className="message-content">
                                {msg.content}
                                {msg.codeSnippet && (
                                    <pre className="code-snippet">
                                        <code>{msg.codeSnippet}</code>
                                    </pre>
                                )}
                                {isError && errorContent && (
                                    <button
                                        className="fix-bug-btn"
                                        onClick={handleFixBug}
                                        title="发送错误信息给AI分析并解决"
                                    >
                                        🔧 一键解决Bug
                                    </button>
                                )}
                            </div>
                            <div className="message-footer">
                                <span className="message-time">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                                <button
                                    className="copy-btn"
                                    onClick={() => {
                                        navigator.clipboard.writeText(msg.content);
                                    }}
                                    title="复制内容"
                                >
                                    📋
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Loading 指示器 */}
                {isLoading && (
                    <div className="message assistant loading">
                        <div className="message-content">
                            <div className="loading-indicator">
                                <span className="loading-dot"></span>
                                <span className="loading-dot"></span>
                                <span className="loading-dot"></span>
                            </div>
                            <span className="loading-text">{loadingMessage || '正在思考中...'}</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* 确认按钮区域 */}
            {(phase === 'ready_to_generate' || phase === 'generated') && (
                <div className="confirm-buttons">
                    {phase === 'ready_to_generate' && (
                        <button
                            className="confirm-btn generate-btn"
                            onClick={onConfirmGenerate}
                            disabled={isLoading}
                        >
                            ✅ 生成脚本
                        </button>
                    )}
                    {phase === 'generated' && (
                        <>
                            <button
                                className="confirm-btn execute-btn"
                                onClick={onConfirmExecute}
                                disabled={isLoading}
                            >
                                ▶️ 开始执行
                            </button>
                            <button
                                className="confirm-btn regenerate-btn"
                                onClick={onConfirmGenerate}
                                disabled={isLoading}
                            >
                                🔄 重新生成
                            </button>
                        </>
                    )}
                </div>
            )}

            <div className="quick-commands">
                {quickCommands.map((cmd) => (
                    <button
                        key={cmd}
                        onClick={() => onSendMessage(cmd)}
                        disabled={!isConnected}
                    >
                        {cmd}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="input-form">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isConnected ? '输入指令...' : '等待连接...'}
                    disabled={!isConnected}
                />
                <button type="submit" disabled={!isConnected || !input.trim()}>
                    发送
                </button>
            </form>
        </div>
    );
};

export default ChatPanel;
