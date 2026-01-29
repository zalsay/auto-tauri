import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';

interface TerminalLine {
    id: string;
    type: 'input' | 'output' | 'error' | 'system' | 'command';
    content: string;
}

interface AutoTerminalPanelProps {
    sessionId: string;
    projectPath: string;
    prompt: string;
    title?: string;
    onComplete?: () => void;
    onClose?: () => void;
}

export default function AutoTerminalPanel({ sessionId, projectPath, prompt, title, onComplete, onClose }: AutoTerminalPanelProps) {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [isRunning, setIsRunning] = useState(true);
    const terminalEndRef = useRef<HTMLDivElement>(null);
    const eventUnlistenRef = useRef<(() => void) | null>(null);
    const hasStartedRef = useRef(false);

    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        const eventId = `terminal-${sessionId}`;

        const setupTerminal = async () => {
            try {
                const window = await getCurrentWindow();

                // 监听命令输出事件
                await listen(eventId, (event: any) => {
                    const { type, content, exit_code } = event.payload;

                    if (type === 'output') {
                        setLines(prev => {
                            const newLines = (content || '').split('\n').filter((l: string) => l.trim());
                            return [...prev, ...newLines.map((l: string) => ({
                                id: `out-${Date.now()}-${Math.random()}`,
                                type: 'output' as const,
                                content: l.trim()
                            }))];
                        });
                    } else if (type === 'complete') {
                        setIsRunning(false);
                        setLines(prev => [...prev, {
                            id: `complete-${Date.now()}`,
                            type: 'system',
                            content: exit_code === 0 ? '✅ 任务执行完成' : `❌ 命令执行失败，退出码: ${exit_code}`
                        }]);
                        if (onComplete) onComplete();
                        if (eventUnlistenRef.current) {
                            eventUnlistenRef.current();
                            eventUnlistenRef.current = null;
                        }
                    }
                }).then(unlisten => {
                    eventUnlistenRef.current = unlisten;
                });

                // 直接执行 opencode 命令
                const command = `opencode --prompt "${prompt.replace(/"/g, '\\"')}"`;
                
                setLines([{
                    id: `cmd-${Date.now()}`,
                    type: 'command',
                    content: `$ cd ${projectPath} && ${command}`
                }]);

                await invoke('execute_opencode_command', {
                    window,
                    prompt,
                    workingDir: projectPath,
                    eventId
                });
            } catch (err) {
                setLines(prev => [...prev, {
                    id: `error-${Date.now()}`,
                    type: 'error',
                    content: `启动失败: ${JSON.stringify(err)}`
                }]);
                setIsRunning(false);
            }
        };

        setupTerminal();

        return () => {
            if (eventUnlistenRef.current) {
                eventUnlistenRef.current();
            }
        };
    }, [sessionId, projectPath, prompt]);

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines]);

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] text-slate-300 font-mono text-sm">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-[#252526]">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></span>
                    <span className="text-sm">{title || `Terminal - ${sessionId?.slice(0, 8)}...`}</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
                    <span className="material-symbols-outlined text-sm">close</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {lines.map(line => (
                    <div key={line.id} className={`${
                        line.type === 'error' ? 'text-red-400' :
                        line.type === 'command' ? 'text-blue-400' :
                        line.type === 'system' ? 'text-yellow-400' :
                        'text-slate-300'
                    } whitespace-pre-wrap`}>
                        {line.type === 'command' ? '> ' : ''}{line.content}
                    </div>
                ))}
                {isRunning && (
                    <div className="flex items-center gap-2 text-slate-500">
                        <span className="animate-pulse">●</span>
                        <span>AI 思考中...</span>
                    </div>
                )}
                <div ref={terminalEndRef} />
            </div>
        </div>
    );
}
