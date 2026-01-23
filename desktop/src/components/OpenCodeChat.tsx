import { useEffect, useState, useRef } from "react";
import * as opencode from "../opencodeService";
import { MessagePart } from "../opencodeService";

interface Props {
    sessionId: string;
    initialPrompt?: string;
    onClose?: () => void;
}

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    parts: MessagePart[];
    timestamp: number;
}

export default function OpenCodeChat({ sessionId, initialPrompt, onClose }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [status, setStatus] = useState<"connecting" | "idle" | "working" | "error">("connecting");
    const [userInput, setUserInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial load
    useEffect(() => {
        if (initialPrompt) {
            // Add user message immediately
            addMessage({
                role: "user",
                parts: [{ type: "text", text: initialPrompt }]
            });
            setStatus("working");
        } else {
            setStatus("idle");
        }
    }, [initialPrompt]);

    // Subscribe to SSE
    useEffect(() => {
        let currentAssistantMessageId: string | null = null;

        const eventSource = opencode.subscribeToSession(sessionId, {
            onMessage: (message) => {
                setStatus("working");

                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];

                    // If last message is assistant, append to it
                    if (currentAssistantMessageId && lastMsg && lastMsg.id === currentAssistantMessageId) {
                        const newParts = [...lastMsg.parts];

                        message.parts.forEach(newPart => {
                            // Try to merge with last part if same type (for text streaming)
                            const lastPart = newParts[newParts.length - 1];
                            if (lastPart && lastPart.type === newPart.type && lastPart.type === 'text') {
                                lastPart.text = (lastPart.text || '') + (newPart.text || '');
                            } else if (lastPart && lastPart.type === newPart.type && lastPart.type === 'reasoning') {
                                lastPart.text = (lastPart.text || '') + (newPart.text || ''); // Use text field for accumulated reasoning
                            } else {
                                newParts.push(newPart);
                            }
                        });

                        return [
                            ...prev.slice(0, -1),
                            { ...lastMsg, parts: newParts }
                        ];
                    }
                    // New assistant message
                    else {
                        const newId = Date.now().toString();
                        currentAssistantMessageId = newId;
                        return [...prev, {
                            id: newId,
                            role: "assistant",
                            parts: message.parts,
                            timestamp: Date.now()
                        }];
                    }
                });
            },
            onToolUse: (toolName, input) => {
                setStatus("working");
                // Tools are handled as parts in the message stream usually, 
                // but if we get explicit events, we can show them too.
                // For now, let's rely on message parts if possible, or add a special part.
                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (currentAssistantMessageId && lastMsg && lastMsg.id === currentAssistantMessageId) {
                        const newParts = [...lastMsg.parts, {
                            type: "tool_use",
                            toolName,
                            toolInput: input
                        } as MessagePart];
                        return [...prev.slice(0, -1), { ...lastMsg, parts: newParts }];
                    }
                    return prev;
                });
            },
            onToolResult: (toolName, result) => {
                // Similarly handle tool results
                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (currentAssistantMessageId && lastMsg && lastMsg.id === currentAssistantMessageId) {
                        const newParts = [...lastMsg.parts, {
                            type: "tool_result",
                            toolName,
                            toolResult: result
                        } as MessagePart];
                        return [...prev.slice(0, -1), { ...lastMsg, parts: newParts }];
                    }
                    return prev;
                });
            },
            onError: (err) => {
                console.error("SSE Error:", err);
                // Don't set error status immediately as it might be transient
            }
        });

        return () => {
            eventSource.close();
        };
    }, [sessionId]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const addMessage = (msg: Omit<ChatMessage, "id" | "timestamp">) => {
        setMessages(prev => [...prev, {
            ...msg,
            id: Date.now().toString(),
            timestamp: Date.now()
        }]);
    };

    const handleSend = async () => {
        if (!userInput.trim()) return;

        const text = userInput;
        setUserInput("");
        addMessage({ role: "user", parts: [{ type: "text", text }] });
        setStatus("working");

        try {
            await opencode.sendMessage(sessionId, text);
        } catch (err) {
            console.error("Failed to send message:", err);
            setStatus("error");
        }
    };

    // Renderers
    const renderPart = (part: MessagePart, index: number) => {
        switch (part.type) {
            case 'text':
                return <div key={index} className="whitespace-pre-wrap">{part.text}</div>;
            case 'reasoning':
                return (
                    <details key={index} className="mb-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 open:bg-white dark:open:bg-gray-800">
                        <summary className="px-3 py-2 text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
                            思维过程 (Thinking)
                        </summary>
                        <div className="px-3 pb-3 pt-1 text-xs text-gray-600 dark:text-gray-400 font-mono whitespace-pre-wrap border-t border-dashed border-gray-100 dark:border-gray-700">
                            {part.text || part.thinking}
                        </div>
                    </details>
                );
            case 'tool_use':
                return (
                    <div key={index} className="mb-2 text-xs flex items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                        <span className="material-symbols-outlined text-sm animate-spin">settings</span>
                        <span>调用工具: <span className="font-mono font-bold">{part.toolName}</span></span>
                    </div>
                );
            case 'tool_result':
                return (
                    <div key={index} className="mb-2 text-xs flex items-center gap-2 p-2 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-800">
                        <span className="material-symbols-outlined text-sm">check</span>
                        <span>工具调用完成: <span className="font-mono font-bold">{part.toolName}</span></span>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 absolute inset-0 z-10">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-orange-500">terminal</span>
                    <div>
                        <h3 className="text-sm font-bold text-gray-800 dark:text-white">任务执行中</h3>
                        <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${status === 'working' ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`}></span>
                            <span className="text-xs text-gray-500">
                                {status === 'working' ? 'AI 正在思考...' : '等待输入'}
                            </span>
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-none'
                            }`}>
                            {msg.parts.map((part, idx) => renderPart(part, idx))}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder="输入指令..."
                        className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!userInput.trim() || status === 'working'}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <span className="material-symbols-outlined">send</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
