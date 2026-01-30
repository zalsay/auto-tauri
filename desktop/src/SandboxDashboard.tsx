import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import SandboxTerminal from './components/SandboxTerminal';

interface SandboxSession {
    id: string;
    name: string;
    createdAt: Date;
    status: 'active' | 'idle' | 'completed';
    workingDir: string;
}

interface SandboxDashboardProps {
    defaultWorkingDir?: string;
    onClose?: () => void;
}

export default function SandboxDashboard({ defaultWorkingDir = '/tmp/sandbox', onClose }: SandboxDashboardProps) {
    const [sessions, setSessions] = useState<SandboxSession[]>([]);
    const [currentSession, setCurrentSession] = useState<string | null>(null);
    const [workingDir, setWorkingDir] = useState(defaultWorkingDir);
    const [newSessionName, setNewSessionName] = useState('');
    const [showNewSessionModal, setShowNewSessionModal] = useState(false);
    const [stats, setStats] = useState({
        totalCommands: 0,
        activeSessions: 0,
        totalOutput: 0
    });

    const createSession = useCallback(async () => {
        if (!newSessionName.trim()) return;

        const sessionId = `sandbox-${Date.now()}`;
        const session: SandboxSession = {
            id: sessionId,
            name: newSessionName,
            createdAt: new Date(),
            status: 'active',
            workingDir: workingDir
        };

        setSessions(prev => [...prev, session]);
        setCurrentSession(sessionId);
        setNewSessionName('');
        setShowNewSessionModal(false);

        try {
            await invoke('execute_sandbox_command', {
                sandboxId: sessionId,
                command: 'echo "Sandbox session initialized"',
                workingDir,
                sessionId
            });
        } catch (err) {
            console.error('Failed to initialize sandbox:', err);
        }
    }, [newSessionName, workingDir]);

    const handleCommandComplete = useCallback((command: string, exitCode: number) => {
        setStats(prev => ({
            ...prev,
            totalCommands: prev.totalCommands + 1,
            activeSessions: sessions.filter(s => s.status === 'active').length
        }));

        if (exitCode === 0) {
            console.log(`Command executed successfully: ${command}`);
        } else {
            console.warn(`Command failed with exit code ${exitCode}: ${command}`);
        }
    }, [sessions]);

    const switchSession = (sessionId: string) => {
        setCurrentSession(sessionId);
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            setWorkingDir(session.workingDir);
        }
    };

    const deleteSession = (sessionId: string) => {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (currentSession === sessionId) {
            setCurrentSession(null);
        }
    };

    const activeSession = sessions.find(s => s.id === currentSession);

    return (
        <div className="h-full flex flex-col bg-gray-900 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-green-500">
                        terminal
                    </span>
                    <h1 className="text-xl font-semibold text-white">
                        Sandbox Terminal
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowNewSessionModal(true)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        New Session
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <span className="material-symbols-outlined text-gray-400">close</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar - Session List */}
                <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
                    <div className="p-4 border-b border-gray-700">
                        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                            Sessions
                        </h2>
                        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                            <span>Active: {stats.activeSessions}</span>
                            <span>Commands: {stats.totalCommands}</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        {sessions.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                No sessions yet.<br />
                                Create a new session to start.
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {sessions.map(session => (
                                    <button
                                        key={session.id}
                                        onClick={() => switchSession(session.id)}
                                        className={`w-full px-3 py-2 rounded-lg text-left transition-colors ${
                                            currentSession === session.id
                                                ? 'bg-green-600/20 border border-green-600/30'
                                                : 'hover:bg-gray-700 border border-transparent'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium truncate">{session.name}</span>
                                            <span className={`w-2 h-2 rounded-full ${
                                                session.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
                                            }`}></span>
                                        </div>
                                        <div className="text-xs text-gray-500 truncate mt-1">
                                            {session.workingDir}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {sessions.length > 0 && (
                        <div className="p-2 border-t border-gray-700">
                            <button
                                onClick={() => setShowNewSessionModal(true)}
                                className="w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg flex items-center gap-2 transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">add</span>
                                Add Session
                            </button>
                        </div>
                    )}
                </div>

                {/* Main Content - Terminal */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {activeSession ? (
                        <>
                            {/* Session Info Bar */}
                            <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-white">{activeSession.name}</span>
                                    <span className="text-xs text-gray-500">|</span>
                                    <span className="text-xs text-gray-400">{activeSession.workingDir}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={workingDir}
                                        onChange={(e) => setWorkingDir(e.target.value)}
                                        className="px-3 py-1 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white w-64 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="Working directory"
                                    />
                                    <button
                                        onClick={() => {
                                            const session = sessions.find(s => s.id === currentSession);
                                            if (session) {
                                                session.workingDir = workingDir;
                                            }
                                        }}
                                        className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                                        title="Update working directory"
                                    >
                                        <span className="material-symbols-outlined text-sm">refresh</span>
                                    </button>
                                </div>
                            </div>

                            {/* Terminal */}
                            <div className="flex-1 overflow-hidden">
                                <SandboxTerminal
                                    sandboxId={currentSession || undefined}
                                    workingDir={workingDir}
                                    onCommandComplete={handleCommandComplete}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <span className="material-symbols-outlined text-6xl text-gray-600 mb-4">
                                    terminal
                                </span>
                                <h3 className="text-xl font-medium text-gray-400 mb-2">
                                    No Session Selected
                                </h3>
                                <p className="text-gray-500 text-sm mb-4">
                                    Create a new session to start using the sandbox terminal
                                </p>
                                <button
                                    onClick={() => setShowNewSessionModal(true)}
                                    className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                                >
                                    Create Session
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* New Session Modal */}
            {showNewSessionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-gray-800 rounded-xl p-6 w-96 shadow-2xl">
                        <h3 className="text-lg font-semibold text-white mb-4">Create New Session</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    Session Name
                                </label>
                                <input
                                    type="text"
                                    value={newSessionName}
                                    onChange={(e) => setNewSessionName(e.target.value)}
                                    placeholder="My Sandbox Session"
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    Working Directory
                                </label>
                                <input
                                    type="text"
                                    value={workingDir}
                                    onChange={(e) => setWorkingDir(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowNewSessionModal(false)}
                                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createSession}
                                disabled={!newSessionName.trim()}
                                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
