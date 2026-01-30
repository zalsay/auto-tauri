import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface TerminalLine {
    id: string;
    type: 'input' | 'output' | 'error' | 'system' | 'command';
    content: string;
    timestamp: number;
}

interface SandboxTerminalProps {
    sandboxId?: string;
    defaultWorkingDir?: string;
    initialCommand?: string | null;
    onCommandComplete?: (command: string, exitCode: number) => void;
    onCommandFailed?: (command: string) => void;
    onClose?: () => void;
}

export interface SandboxTerminalRef {
    executeCommand: (command: string) => Promise<void>;
    clear: () => void;
}

const SandboxTerminal = forwardRef<SandboxTerminalRef, SandboxTerminalProps>(({ 
    sandboxId, 
    defaultWorkingDir = '/tmp/sandbox', 
    initialCommand, 
    onCommandComplete, 
    onCommandFailed, 
    onClose 
}, ref) => {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [sandboxStatus, setSandboxStatus] = useState<'active' | 'idle' | 'error'>('idle');
    const [workingDir, setWorkingDir] = useState(defaultWorkingDir);

    const terminalEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const sessionId = useRef(`sandbox-${Date.now()}`).current;

    const addLine = useCallback((line: Omit<TerminalLine, 'id' | 'timestamp'>) => {
        setLines(prev => [...prev, {
            ...line,
            id: `${line.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now()
        }]);
    }, []);

    const scrollToBottom = useCallback(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [lines, scrollToBottom]);

    useEffect(() => {
        addLine({
            type: 'system',
            content: `🔒 Sandbox Terminal [Session: ${sessionId.slice(0, 8)}]`
        });
        addLine({
            type: 'system',
            content: `📁 Working Directory: ${workingDir}`
        });
        addLine({
            type: 'system',
            content: 'Type "help" for available commands, or "clear" to clear the terminal.'
        });
        addLine({ type: 'output', content: '' });
    }, [sessionId, workingDir, addLine]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
        async executeCommand(command: string) {
            await runCommand(command);
        },
        clear() {
            setLines([]);
            addLine({ type: 'system', content: 'Terminal cleared' });
        }
    }), [addLine]);

    const runCommand = async (command: string) => {
        if (!command.trim() || isRunning) return;

        const trimmedCmd = command.trim();
        setIsRunning(true);

        addLine({ type: 'command', content: trimmedCmd });
        setCommandHistory(prev => [...prev.filter(c => c !== trimmedCmd), trimmedCmd]);
        setHistoryIndex(-1);

        try {
            const result = await invoke<{ success: boolean; exitCode: number; output: string; error?: string }>(
                'execute_sandbox_command',
                {
                    sandboxId: sandboxId || sessionId,
                    command: trimmedCmd,
                    workingDir,
                    sessionId
                }
            );

            if (result.success) {
                if (result.output) {
                    result.output.split('\n').forEach(line => {
                        if (line.trim()) addLine({ type: 'output', content: line });
                    });
                }
                if (result.exitCode === 0) {
                    addLine({ type: 'system', content: `[Exit: ${result.exitCode}]` });
                } else {
                    addLine({ type: 'error', content: `[Exit: ${result.exitCode}]` });
                    onCommandFailed?.(trimmedCmd);
                }
            } else {
                addLine({ type: 'error', content: result.error || 'Command execution failed' });
                onCommandFailed?.(trimmedCmd);
            }

            onCommandComplete?.(trimmedCmd, result.exitCode);
        } catch (err: any) {
            addLine({ type: 'error', content: `Error: ${err.message || JSON.stringify(err)}` });
        } finally {
            setIsRunning(false);
            addLine({ type: 'output', content: '' });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (isRunning) return;
            runCommand(inputValue);
            setInputValue('');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setInputValue(commandHistory[commandHistory.length - 1 - newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setInputValue(commandHistory[commandHistory.length - 1 - newIndex]);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setInputValue('');
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            addLine({ type: 'system', content: 'Tab completion not yet implemented' });
        } else if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            setLines([]);
            addLine({ type: 'system', content: 'Terminal cleared' });
        } else if (e.key === 'c' && e.ctrlKey) {
            e.preventDefault();
            if (!isRunning) {
                addLine({ type: 'output', content: '^C' });
                setInputValue('');
            }
        } else if (e.key === 'd' && e.ctrlKey) {
            e.preventDefault();
            if (!inputValue) {
                addLine({ type: 'system', content: 'Use "exit" to close the terminal' });
            }
        }
    };

    const handleQuickCommand = (cmd: string) => {
        setInputValue(cmd);
        inputRef.current?.focus();
    };

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-slate-300 font-mono text-sm">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-[#161b22]">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : sandboxStatus === 'error' ? 'bg-red-500' : 'bg-slate-500'}`}></span>
                        <span className="text-xs text-slate-400">{isRunning ? '执行中...' : 'Sandbox'}</span>
                    </div>
                    <span className="text-xs text-slate-500">|</span>
                    <span className="text-xs text-slate-400">{workingDir}</span>
                </div>
                <div className="flex items-center gap-2">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                            title="Close Terminal"
                        >
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    )}
                    <button
                        onClick={() => setLines([])}
                        className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                        title="Clear Terminal"
                    >
                        <span className="material-symbols-outlined text-sm">auto_fix_off</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
                {lines.map((line) => (
                    <div key={line.id} className={`${
                        line.type === 'error' ? 'text-red-400' :
                        line.type === 'command' ? 'text-blue-400' :
                        line.type === 'system' ? 'text-yellow-400' :
                        line.type === 'input' ? 'text-purple-400' :
                        'text-slate-300'
                    } whitespace-pre-wrap break-words`}>
                        {line.type === 'command' ? `❯ ${line.content}` : line.content}
                    </div>
                ))}

                {isRunning && (
                    <div className="flex items-center gap-2 text-slate-500">
                        <span className="animate-spin">◐</span>
                        <span>Executing...</span>
                    </div>
                )}

                <div ref={terminalEndRef} />
            </div>

            <div className="border-t border-slate-700 bg-[#161b22] p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <span>Quick Commands:</span>
                    <button onClick={() => handleQuickCommand('ls -la')} className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">ls</button>
                    <button onClick={() => handleQuickCommand('pwd')} className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">pwd</button>
                    <button onClick={() => handleQuickCommand('ps aux')} className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">ps</button>
                    <button onClick={() => handleQuickCommand('top -bn1 | head -5')} className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">top</button>
                    <button onClick={() => handleQuickCommand('env | head -10')} className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">env</button>
                    <button onClick={() => handleQuickCommand('help')} className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">help</button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-mono">❯</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isRunning ? "Executing..." : "Enter command..."}
                        disabled={isRunning}
                        className="flex-1 bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 focus:ring-0"
                        autoFocus
                    />
                </div>
            </div>
        </div>
    );
});

SandboxTerminal.displayName = 'SandboxTerminal';

export default SandboxTerminal;
