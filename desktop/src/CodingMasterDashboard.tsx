/**
 * CodingMasterDashboard.tsx - Mission Control Dashboard for Coding全能大师
 * 
 * Displays:
 * - System health status (OpenCode, tools availability)
 * - OpenCode Worker Grid with task states
 * - Quick Fix panel for single-file tasks
 */

import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as opencode from "./opencodeService";
import OpenCodeChat from "./components/OpenCodeChat";

// Types
interface SystemHealth {
    gitInstalled: boolean;
    nodeInstalled: boolean;
    ralphInstalled: boolean;
    opencodeInstalled: boolean;
}

interface OpenCodeStatus {
    activeTasks: number;
    maxConcurrent: number;
    lockedFiles: string[];
}

interface WorkerState {
    id: number;
    status: "idle" | "working" | "done" | "error";
    filePath?: string;
    prompt?: string;
    error?: string;
}

interface Props {
    projectPath?: string;
    onClose?: () => void;
}

export default function CodingMasterDashboard({ projectPath, onClose }: Props) {
    // State
    const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
    const [opencodeStatus, setOpencodeStatus] = useState<OpenCodeStatus | null>(null);
    const [opencodeServerHealthy, setOpencodeServerHealthy] = useState<boolean | null>(null);
    const [workers, setWorkers] = useState<WorkerState[]>([
        { id: 1, status: "idle" },
        { id: 2, status: "idle" },
        { id: 3, status: "idle" },
    ]);

    // Quick Fix form state
    const [quickFixFile, setQuickFixFile] = useState("");
    const [quickFixPrompt, setQuickFixPrompt] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Chat state
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // Load system health
    const loadSystemHealth = useCallback(async () => {
        try {
            const health = await invoke<SystemHealth>("check_system_health");
            setSystemHealth(health);
        } catch (err) {
            console.error("Failed to check system health:", err);
        }
    }, []);

    // Load OpenCode status
    const loadOpencodeStatus = useCallback(async () => {
        try {
            const status = await invoke<OpenCodeStatus>("get_opencode_status");
            setOpencodeStatus(status);

            // Update worker states based on locked files
            setWorkers(prev => {
                const newWorkers = [...prev];
                const lockedFiles = status.lockedFiles || [];

                // Reset all to idle first
                newWorkers.forEach(w => {
                    if (w.status !== "done" && w.status !== "error") {
                        w.status = "idle";
                        w.filePath = undefined;
                    }
                });

                // Mark workers as working for locked files
                lockedFiles.forEach((file, index) => {
                    if (index < newWorkers.length) {
                        newWorkers[index].status = "working";
                        newWorkers[index].filePath = file;
                    }
                });

                return newWorkers;
            });
        } catch (err) {
            console.error("Failed to get opencode status:", err);
        }
    }, []);

    // Check OpenCode server health
    const checkOpencodeServer = useCallback(async () => {
        try {
            const healthy = await opencode.checkHealth();
            setOpencodeServerHealthy(healthy);
        } catch {
            setOpencodeServerHealthy(false);
        }
    }, []);

    // Initial load and polling
    useEffect(() => {
        loadSystemHealth();
        loadOpencodeStatus();
        checkOpencodeServer();

        // Poll status every 2 seconds
        const interval = setInterval(() => {
            loadOpencodeStatus();
        }, 2000);

        return () => clearInterval(interval);
    }, [loadSystemHealth, loadOpencodeStatus, checkOpencodeServer]);

    // Handle Chat Close
    const handleCloseChat = () => {
        setActiveSessionId(null);
        // Clean up form
        setQuickFixFile("");
        setQuickFixPrompt("");
        // Refresh status
        loadOpencodeStatus();
    };

    // Handle Quick Fix submission (Now opens Chat)
    const handleQuickFix = async () => {
        if (!quickFixPrompt.trim()) {
            return;
        }

        setIsSubmitting(true);
        try {
            console.log('[CodingMaster] 🚀 Starting QuickFix task...');
            console.log('[CodingMaster] 📝 Prompt:', quickFixPrompt);
            console.log('[CodingMaster] 📁 Project path:', projectPath);

            // 1. Create Session
            console.log('[CodingMaster] 📋 Creating session...');
            const session = await opencode.createSession(`QuickFix: ${quickFixFile ? quickFixFile : 'General Task'}`);
            console.log('[CodingMaster] ✅ Session created:', session.id);
            setActiveSessionId(session.id);

            // 2. Construct Prompt
            let finalPrompt = quickFixPrompt;
            if (quickFixFile) {
                finalPrompt = `Context: ${quickFixFile}\nTask: ${quickFixPrompt}`;
            }
            console.log('[CodingMaster] 🎯 Final prompt:', finalPrompt.slice(0, 200) + (finalPrompt.length > 200 ? '...' : ''));

            // 3. Send Cowork Command (Streaming is handled by Chat component via SSE)
            // But we need to trigger the initial command.
            // Wait a brief moment for Chat component to mount and subscribe
            console.log('[CodingMaster] ⏳ Waiting 500ms for SSE subscription before sending command...');
            setTimeout(() => {
                console.log('[CodingMaster] 📤 Sending cowork command...');
                opencode.sendCoworkCommandStreaming(
                    session.id,
                    finalPrompt,
                    projectPath
                ).then(result => {
                    console.log('[CodingMaster] ✅ Command sent successfully, result:', result);
                }).catch(err => {
                    console.error('[CodingMaster] ❌ Command failed:', err);
                });
            }, 500);

        } catch (err: any) {
            console.error("[CodingMaster] ❌ Quick fix failed:", err);
            alert(`Failed to start task: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Status indicator component
    const StatusDot = ({ ok }: { ok: boolean | null }) => (
        <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${ok === null ? "bg-gray-400" : ok ? "bg-green-500" : "bg-red-500"
                }`}
        />
    );

    // Worker card component
    const WorkerCard = ({ worker }: { worker: WorkerState }) => {
        const statusColors = {
            idle: "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600",
            working: "bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600",
            done: "bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600",
            error: "bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600",
        };

        const statusIcons = {
            idle: "hourglass_empty",
            working: "sync",
            done: "check_circle",
            error: "error",
        };

        return (
            <div
                className={`p-4 rounded-lg border-2 ${statusColors[worker.status]} transition-all duration-300`}
            >
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        Worker #{worker.id}
                    </span>
                    <span
                        className={`material-symbols-outlined text-lg ${worker.status === "working" ? "animate-spin text-green-600" :
                            worker.status === "done" ? "text-blue-600" :
                                worker.status === "error" ? "text-red-600" : "text-gray-400"
                            }`}
                    >
                        {statusIcons[worker.status]}
                    </span>
                </div>

                {worker.filePath && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={worker.filePath}>
                        {worker.filePath.split("/").pop()}
                    </p>
                )}

                {worker.error && (
                    <p className="text-xs text-red-500 truncate" title={worker.error}>
                        {worker.error}
                    </p>
                )}

                {worker.status === "idle" && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">等待任务...</p>
                )}
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-3">
                    <span className="material-symbols-outlined text-2xl text-orange-500">
                        rocket_launch
                    </span>
                    <h1 className="text-xl font-semibold text-gray-800 dark:text-white">
                        Mission Control
                    </h1>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="material-symbols-outlined text-gray-500">close</span>
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* System Status Panel */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-4">
                        系统状态
                    </h2>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center space-x-2">
                            <StatusDot ok={systemHealth?.gitInstalled ?? null} />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Git</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <StatusDot ok={systemHealth?.nodeInstalled ?? null} />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Node.js</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <StatusDot ok={systemHealth?.opencodeInstalled ?? null} />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Coding CLI</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <StatusDot ok={opencodeServerHealthy} />
                            <span className="text-sm text-gray-700 dark:text-gray-300">AI Core Server</span>
                        </div>
                    </div>

                    {opencodeStatus && (
                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">活跃任务</span>
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                    {opencodeStatus.activeTasks} / {opencodeStatus.maxConcurrent}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* OpenCode Worker Grid */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-4">
                        AI Workers
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {workers.map(worker => (
                            <WorkerCard key={worker.id} worker={worker} />
                        ))}
                    </div>
                </div>

                {/* Quick Fix Panel */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-4">
                        Quick Fix
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                文件路径
                            </label>
                            <input
                                type="text"
                                value={quickFixFile}
                                onChange={(e) => setQuickFixFile(e.target.value)}
                                placeholder="/path/to/file.ts (可选，留空则为通用任务)"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                任务描述
                            </label>
                            <textarea
                                value={quickFixPrompt}
                                onChange={(e) => setQuickFixPrompt(e.target.value)}
                                placeholder="添加注释、修复 bug、重构代码..."
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                            />
                        </div>

                        <button
                            onClick={handleQuickFix}
                            disabled={isSubmitting || !quickFixPrompt.trim()}
                            className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                                    <span>执行中...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-lg">play_arrow</span>
                                    <span>执行 Quick Fix</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Project Path Info */}
                {projectPath && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        项目路径: {projectPath}
                    </div>
                )}
            </div>

            {/* Chat Modal */}
            {activeSessionId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-4xl h-[85vh] rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <OpenCodeChat
                            sessionId={activeSessionId}
                            initialPrompt={quickFixPrompt}
                            onClose={handleCloseChat}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
