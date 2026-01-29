import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { apiRequest } from '../api';
import { downloadFromOSS, uploadTextToOSS } from '../ossUpload';
import * as opencode from "../opencodeService";


interface Project {
    id: string;
    name: string;
    url: string;
    prompt: string;
    type: string;
}

interface RemoteProjectPlan {
    devPlan?: string;
    testPlan?: string;
}

interface DevelopmentStep {
    id: number;
    title: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

interface DevelopmentProgress {
    total_steps: number;
    completed_steps: number;
    skipped_steps: number;
    percent: number;
    steps: DevelopmentStep[];
}

interface TaskStatus {
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    message: string;
    dev_plan: string;
    test_plan: string;
}

interface CodingProjectWorkspaceProps {
    project: Project;
    onBack: () => void;
}

export default function CodingProjectWorkspace({ project, onBack }: CodingProjectWorkspaceProps) {
    const [activeTab, setActiveTab] = useState<'plan' | 'code' | 'progress'>('plan');
    const [analyzing, setAnalyzing] = useState(false);
    const [supplementing, setSupplementing] = useState(false);
    const [devPlan, setDevPlan] = useState("");
    const [testPlan, setTestPlan] = useState("");
    const [prdContent, setPrdContent] = useState("");
    const [prdFilePath, setPrdFilePath] = useState("");
    const [progress, setProgress] = useState<DevelopmentProgress | null>(null);
    const [devPlanModified, setDevPlanModified] = useState(false);
    const [testPlanModified, setTestPlanModified] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);

    // Execution State
    const [executing, setExecuting] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // 用于 SSE 消息去重
    const lastMessageIds = useRef<Set<string>>(new Set());

    // Load saved plans and check task status on mount
    useEffect(() => {
        if (project.prompt) {
            setPrdContent(project.prompt);
        }
        // Initialize: Load local, then try sync from OSS
        initProjectData();
        checkTaskStatus();
    }, [project]);

    const initProjectData = async () => {
        const { dev: localDev, test: localTest } = await loadSavedPlans(); // Load local first for speed
        await loadProgress();
        await syncPlansWithOSS(localDev, localTest);

        // Sync with Backend (DB/Redis)
        try {
            const remoteProject = await apiRequest(`/api/v1/projects/${project.id}`) as RemoteProjectPlan | null;
            if (remoteProject) {
                const remoteDev = remoteProject.devPlan || "";
                const remoteTest = remoteProject.testPlan || "";

                if (!localDev && remoteDev) {
                    setDevPlan(remoteDev);
                    await invoke('save_plan_file', { content: remoteDev, projectPath: project.url, fileName: 'develop_plan.md' });
                    setLogs((l: string[]) => [...l, `[同步] 已从云端(DB)恢复开发计划`]);
                } else if (localDev && remoteDev !== localDev && !remoteDev) {
                    await savePlanToBackend('develop', localDev);
                }

                if (!localTest && remoteTest) {
                    setTestPlan(remoteTest);
                    await invoke('save_plan_file', { content: remoteTest, projectPath: project.url, fileName: 'testing_plan.md' });
                    setLogs((l: string[]) => [...l, `[同步] 已从云端(DB)恢复测试计划`]);
                } else if (localTest && remoteTest !== localTest && !remoteTest) {
                    await savePlanToBackend('testing', localTest);
                }
            }
        } catch (e) {
            console.error("Failed to sync with backend:", e);
        }
    };

    const savePlanToBackend = async (type: 'develop' | 'testing', content: string) => {
        try {
            const payload: any = {};
            if (type === 'develop') payload.devPlan = content;
            if (type === 'testing') payload.testPlan = content;

            await apiRequest(`/api/v1/projects/${project.id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            console.log(`[Sync] Saved ${type} plan to backend`);
        } catch (e) {
            // console.error(`[Sync] Failed to save ${type} plan to backend:`, e);
        }
    };

    const getOSSKey = (planType: 'develop' | 'testing') => {
        // Uniform naming convention: project_id/plan_type.md
        // Sanitize project name/id to be safe for OSS keys
        const cleanName = project.name.replace(/[^a-zA-Z0-9-_]/g, '_');
        return `plans/${cleanName}/${planType}_plan.md`;
    };

    const syncPlansWithOSS = async (localDevPlan: string, localTestPlan: string) => {
        console.log('[Sync] Starting OSS sync...');

        // 1. Sync Develop Plan
        try {
            const devKey = getOSSKey('develop');
            // Try to download from OSS
            try {
                const ossDevPlan = await downloadFromOSS(devKey);
                // If local is empty but OSS has content, use OSS
                if (!localDevPlan && ossDevPlan) {
                    setDevPlan(ossDevPlan);
                    await invoke('save_plan_file', { content: ossDevPlan, projectPath: project.url, fileName: 'develop_plan.md' });
                    setLogs(l => [...l, `[同步] 已从云端恢复开发计划`]);
                }
                // If local exists, we assume it's newer (or equal) because we just loaded it from disk.
                // We overwrite OSS with local to ensure OSS is up to date (sync on load).
            } catch (e: any) {
                if (e.message !== 'File not found') console.error('[Sync] Download dev plan failed:', e);
            }

            // Upload current local to OSS (Sync to OSS on update/load if exists)
            // But we should only upload if we actually have one.
            if (localDevPlan) {
                await uploadTextToOSS(localDevPlan, devKey);
                console.log('[Sync] Uploaded dev plan to OSS');
            }
        } catch (e) {
            console.error('[Sync] Dev plan sync error:', e);
        }

        // 2. Sync Test Plan
        try {
            const testKey = getOSSKey('testing');
            try {
                const ossTestPlan = await downloadFromOSS(testKey);
                if (!localTestPlan && ossTestPlan) {
                    setTestPlan(ossTestPlan);
                    await invoke('save_plan_file', { content: ossTestPlan, projectPath: project.url, fileName: 'testing_plan.md' });
                    setLogs(l => [...l, `[同步] 已从云端恢复测试计划`]);
                }
            } catch (e: any) {
                if (e.message !== 'File not found') console.error('[Sync] Download test plan failed:', e);
            }

            if (localTestPlan) {
                await uploadTextToOSS(localTestPlan, testKey);
                console.log('[Sync] Uploaded test plan to OSS');
            }
        } catch (e) {
            console.error('[Sync] Test plan sync error:', e);
        }
    };


    // Poll task status when analyzing
    useEffect(() => {
        let interval: any;
        if (analyzing && taskStatus?.status === 'running') {
            interval = setInterval(() => {
                pollTaskStatus();
            }, 2000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [analyzing, taskStatus]);

    const checkTaskStatus = useCallback(async () => {
        try {
            const result = await invoke('get_task_status', { projectPath: project.url });
            if (result) {
                const task = result as TaskStatus;
                setTaskStatus(task);
                if (task.dev_plan) setDevPlan(task.dev_plan);
                if (task.test_plan) setTestPlan(task.test_plan);
                if (task.status === 'completed') {
                    setAnalyzing(false);
                    loadProgress();
                }
            }
        } catch (e) {
            console.log("No task status found");
        }
    }, [project.url]);

    const pollTaskStatus = useCallback(async () => {
        try {
            const result = await invoke('get_task_status', { projectPath: project.url });
            if (result) {
                const task = result as TaskStatus;
                setTaskStatus(prev => {
                    if (prev?.message !== task.message) {
                        setLogs(l => [...l, `[系统] ${task.message}`]);
                    }
                    return task;
                });
                if (task.dev_plan) setDevPlan(task.dev_plan);
                if (task.test_plan) setTestPlan(task.test_plan);
                if (task.status === 'completed' || task.status === 'failed') {
                    setAnalyzing(false);
                    loadProgress();
                }
            }
        } catch (e) {
            console.log("Poll task status failed:", e);
        }
    }, [project.url]);

    const loadSavedPlans = useCallback(async () => {
        let dev = "";
        let test = "";
        try {
            const devResult = await invoke('read_plan_file', { projectPath: project.url, fileName: 'develop_plan.md' });
            dev = devResult as string;
            setDevPlan(dev);
        } catch (e) {
            console.log("No saved dev plan found");
        }

        try {
            const testResult = await invoke('read_plan_file', { projectPath: project.url, fileName: 'testing_plan.md' });
            test = testResult as string;
            setTestPlan(test);
        } catch (e) {
            console.log("No saved test plan found");
        }
        return { dev, test };
    }, [project.url]);

    const handleSaveDevPlan = async () => {
        setIsSaving(true);
        try {
            await invoke('save_plan_file', { content: devPlan, projectPath: project.url, fileName: 'develop_plan.md' });
            setDevPlanModified(false);
            setLogs(prev => [...prev, "[系统] 开发计划已保存"]);

            // Sync to Backend
            savePlanToBackend('develop', devPlan)
                .then(() => setLogs(l => [...l, "[同步] 开发计划已同步到云端"]))
                .catch(e => console.error(e));
        } catch (e) {
            setLogs(prev => [...prev, `[错误] 保存开发计划失败: ${JSON.stringify(e)}`]);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveTestPlan = async () => {
        setIsSaving(true);
        try {
            await invoke('save_plan_file', { content: testPlan, projectPath: project.url, fileName: 'testing_plan.md' });
            setTestPlanModified(false);
            setLogs(prev => [...prev, "[系统] 测试计划已保存"]);

            // Sync to Backend
            savePlanToBackend('testing', testPlan)
                .then(() => setLogs(l => [...l, "[同步] 测试计划已同步到云端"]))
                .catch(e => console.error(e));
        } catch (e) {
            setLogs(prev => [...prev, `[错误] 保存测试计划失败: ${JSON.stringify(e)}`]);
        } finally {
            setIsSaving(false);
        }
    };

    const loadProgress = useCallback(async () => {
        try {
            const result = await invoke('parse_development_steps', { projectPath: project.url });
            setProgress(result as DevelopmentProgress);
        } catch (e) {
            console.log("No progress found:", e);
            setProgress(null);
        }
    }, [project.url]);

    const handleAnalyze = async () => {
        setAnalyzing(true);
        setLogs(prev => [...prev, "[系统] 开始在后台分析需求..."]);
        setActiveTab('code');

        try {
            // 🔴 使用 opencode CLI 直接调用并订阅 SSE 事件
            console.log('[CodingWorkspace] 🚀 Starting opencode analysis...');

            // 1. 检查 opencode 服务器健康
            const isHealthy = await opencode.checkHealth();
            if (!isHealthy) {
                throw new Error('AI 开发服务不可用，请运行: cd local-server && npm run serve');
            }
            setLogs(prev => [...prev, "[系统] ✅ 连接AI开发服务成功"]);

            // 2. 创建 session
            const session = await opencode.createSession(`需求分析: ${project.name}`);
            console.log('[CodingWorkspace] ✅ Session created:', session.id);
            setLogs(prev => [...prev, `[系统] 📋 会话已创建: ${session.id.slice(0, 8)}...`]);

            // 3. 构造分析 prompt
            const analyzePrompt = `请分析以下需求并生成开发计划和测试计划：

需求描述：${prdContent || project.prompt}

项目路径：${project.url}

请：
1. 分析需求并生成详细的开发计划 (specs/develop_plan.md)
2. 生成对应的测试计划 (specs/testing_plan.md)
3. 返回完整的计划和测试用例

请使用中文回复。`;

            // 4. 订阅 SSE 事件实时显示输出
            setLogs(prev => [...prev, "[系统] 🔄 订阅实时输出..."]);
            // 清除之前的去重记录
            lastMessageIds.current.clear();

            opencode.subscribeToSession(session.id, {
                onMessage: (message) => {
                    message.parts.forEach(part => {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        if ((part.type === 'text' || part.type === 'reasoning') && (part.text ?? "") && part.id) {
                            // 去重：检查是否已处理过此消息
                            if (lastMessageIds.current.has(part.id)) {
                                return; // 跳过重复消息
                            }
                            lastMessageIds.current.add(part.id);

                            setLogs(prev => {
                                // 过滤掉系统消息，只显示有意义的输出
                                const text = (part.text ?? "").trim();
                                if (text.length < 5) return prev;
                                if (text.includes('session') || text.includes('heartbeat')) return prev;

                                // 检查是否与最后一条消息相同（防止连续重复）
                                if (prev.length > 0 && prev[prev.length - 1]?.includes(text.slice(0, 100))) {
                                    return prev;
                                }

                                return [...prev, `[AI] ${text.slice(0, 500)}${text.length > 500 ? '...' : ''}`];
                            });
                        }
                    });
                },
                onToolUse: (_toolName, _input) => {
                    setLogs(prev => [...prev, `[🔧 工具] ${_toolName}`]);
                },
                onToolResult: (_toolName, _result) => {
                    // 工具结果已包含在消息流中
                },
                onError: (error) => {
                    console.error('[CodingWorkspace] SSE error:', error);
                    setLogs(prev => [...prev, `[错误] SSE 连接错误: ${error.message}`]);
                },
                onComplete: () => {
                    console.log('[CodingWorkspace] ✅ SSE stream completed');
                    setAnalyzing(false);
                    setLogs(prev => [...prev, "[系统] ✅ 需求分析完成！"]);

                    // 刷新计划数据
                    loadProgress();
                    initProjectData();
                }
            });

            // 5. 发送分析命令 (SSE 流已建立，即使 HTTP 请求超时也会继续)
            setLogs(prev => [...prev, "[系统] 📤 发送分析任务..."]);
            console.log('[CodingWorkspace] 📤 Sending cowork command...');

            try {
                const response = await opencode.sendCoworkCommandStreaming(
                    session.id,
                    analyzePrompt,
                    project.url
                );
                console.log('[CodingWorkspace] ✅ Command sent, response:', response);
                setLogs(prev => [...prev, "[系统] ✅ 任务已提交，等待执行完成..."]);
            } catch (e: any) {
                // HTTP 请求失败，但 SSE 流可能还在工作
                console.warn('[CodingWorkspace] ⚠️ HTTP request failed, but SSE stream continues:', e.message);
                setLogs(prev => [...prev, `[系统] ⚠️ 任务已通过 SSE 流提交，正在执行...`]);
            }

        } catch (e: any) {
            console.error("[CodingWorkspace] Analysis failed:", e);
            setLogs(prev => [...prev, `[错误] ${e.message || JSON.stringify(e)}`]);
            setAnalyzing(false);
        }
    };

    const handleSupplementFromPRD = async () => {
        if (!prdFilePath.trim()) {
            alert("请输入 PRD 文件路径");
            return;
        }

        setSupplementing(true);
        try {
            const devResult = await invoke('supplement_plan_from_prd', { prdFilePath, projectPath: project.url });
            if (devResult !== "无新增需求") {
                setDevPlan(devResult as string);
                await invoke('save_plan_file', { content: devResult, projectPath: project.url, fileName: 'develop_plan.md' });
            }

            const testResult = await invoke('supplement_test_plan_from_prd', { prdFilePath, projectPath: project.url });
            if (testResult !== "无新增测试需求") {
                setTestPlan(testResult as string);
                await invoke('save_plan_file', { content: testResult, projectPath: project.url, fileName: 'testing_plan.md' });
            }

            await loadProgress();

        } catch (e) {
            setLogs(prev => [...prev, `[错误] ${JSON.stringify(e)}`]);
        } finally {
            setSupplementing(false);
        }
    };

    const handleMarkStepCompleted = async (stepId: number) => {
        try {
            await invoke('mark_step_completed', { projectPath: project.url, stepId });
            await loadProgress();
        } catch (e) {
            console.error(e);
        }
    };

    const handleMarkStepSkipped = async (stepId: number) => {
        try {
            await invoke('mark_step_skipped', { projectPath: project.url, stepId });
            await loadProgress();
        } catch (e) {
            console.error(e);
        }
    };

    const handleResetSteps = async () => {
        try {
            await invoke('reset_steps', { projectPath: project.url });
            await loadProgress();
        } catch (e) {
            console.error(e);
        }
    };

    const handleStartCoding = async () => {
        setExecuting(true);
        setLogs(prev => [...prev, "[系统] 开始开发..."]);
        setActiveTab('code');

        try {
            // 🔴 使用 opencode CLI 直接调用并订阅 SSE 事件
            console.log('[CodingWorkspace] 🚀 Starting opencode development...');

            // 1. 检查 opencode 服务器健康
            const isHealthy = await opencode.checkHealth();
            if (!isHealthy) {
                throw new Error('AI 开发服务不可用，请运行: cd local-server && npm run serve');
            }
            setLogs(prev => [...prev, "[系统] ✅ 连接AI开发服务成功"]);

            // 2. 创建 session
            const session = await opencode.createSession(`开发: ${project.name}`);
            console.log('[CodingWorkspace] ✅ Session created:', session.id);
            setLogs(prev => [...prev, `[系统] 📋 会话已创建: ${session.id.slice(0, 8)}...`]);

            // 3. 构造开发 prompt
            const devPrompt = `请执行开发计划 specs/develop_plan.md，并使用 specs/testing_plan.md 进行验证。

项目路径：${project.url}

请：
1. 按照 develop_plan.md 中的步骤逐一执行
2. 编写代码、实现功能
3. 使用 testing_plan.md 验证实现是否正确
4. 返回开发进度和结果

请使用中文回复，实时报告进度。`;

            // 4. 订阅 SSE 事件实时显示输出
            setLogs(prev => [...prev, "[系统] 🔄 订阅实时输出..."]);
            // 清除之前的去重记录
            lastMessageIds.current.clear();

            opencode.subscribeToSession(session.id, {
                onMessage: (message) => {
                    message.parts.forEach(part => {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        if ((part.type === 'text' || part.type === 'reasoning') && (part.text ?? "") && part.id) {
                            // 去重：检查是否已处理过此消息
                            if (lastMessageIds.current.has(part.id)) {
                                return; // 跳过重复消息
                            }
                            lastMessageIds.current.add(part.id);

                            setLogs(prev => {
                                const text = (part.text ?? "").trim();
                                if (text.length < 5) return prev;
                                if (text.includes('session') || text.includes('heartbeat')) return prev;

                                // 检查是否与最后一条消息相同（防止连续重复）
                                if (prev.length > 0 && prev[prev.length - 1]?.includes(text.slice(0, 100))) {
                                    return prev;
                                }

                                return [...prev, `[AI] ${text.slice(0, 500)}${text.length > 500 ? '...' : ''}`];
                            });
                        }
                    });
                },
                onToolUse: (_toolName, _input) => {
                    setLogs(prev => [...prev, `[🔧 工具] ${_toolName}`]);
                },
                onToolResult: (_toolName, _result) => {
                    // 工具结果已包含在消息流中
                },
                onError: (error) => {
                    console.error('[CodingWorkspace] SSE error:', error);
                    setLogs(prev => [...prev, `[错误] SSE 连接错误: ${error.message}`]);
                },
                onComplete: () => {
                    console.log('[CodingWorkspace] ✅ SSE stream completed');
                    setExecuting(false);
                    setLogs(prev => [...prev, "[系统] ✅ 开发任务完成！"]);

                    // 刷新进度数据
                    loadProgress();
                }
            });

            // 5. 发送开发命令 (SSE 流已建立，即使 HTTP 请求超时也会继续)
            setLogs(prev => [...prev, "[系统] 📤 发送开发任务..."]);
            console.log('[CodingWorkspace] 📤 Sending cowork command...');

            try {
                const response = await opencode.sendCoworkCommandStreaming(
                    session.id,
                    devPrompt,
                    project.url
                );
                console.log('[CodingWorkspace] ✅ Command sent, response:', response);
                setLogs(prev => [...prev, "[系统] ✅ 任务已提交，执行中..."]);
            } catch (e: any) {
                // HTTP 请求失败，但 SSE 流可能还在工作
                console.warn('[CodingWorkspace] ⚠️ HTTP request failed, but SSE stream continues:', e.message);
                setLogs(prev => [...prev, `[系统] ⚠️ 任务已通过 SSE 流提交，正在执行...`]);
            }

        } catch (e: any) {
            console.error("[CodingWorkspace] Development failed:", e);
            setLogs(prev => [...prev, `[错误] ${e.message || JSON.stringify(e)}`]);
            setExecuting(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-500';
            case 'running': return 'bg-blue-500 animate-pulse';
            case 'failed': return 'bg-red-500';
            default: return 'bg-slate-400';
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-[#1e1e1e] text-slate-900 dark:text-slate-100">
            <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#252526] flex items-center px-4 justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="flex flex-col">
                        <h1 className="font-bold text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-orange-500 text-lg">code</span>
                            {project.name}
                        </h1>
                        <span className="text-xs text-slate-500 font-mono">{project.url}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setActiveTab('plan')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${activeTab === 'plan' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        需求与计划
                    </button>
                    <button onClick={() => setActiveTab('progress')} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${activeTab === 'progress' ? 'bg-green-100 text-green-700 dark:bg-green-900/40' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        开发进度
                        {progress && <span className="ml-1 px-1.5 py-0.5 bg-green-500 text-white rounded-full text-[10px]">{Math.round(progress.percent)}%</span>}
                    </button>
                    <button onClick={() => setActiveTab('code')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${activeTab === 'code' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        执行开发
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                {activeTab === 'plan' && (
                    <div className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
                        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#1e1e1e]">
                            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#252526] flex flex-col gap-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">需求文档 (PRD)</h3>
                                <div className="flex items-center gap-2">
                                    <button disabled={analyzing} onClick={handleAnalyze} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-orange-500 to-pink-500 text-white ${analyzing ? 'opacity-50' : ''}`}>
                                        <span className={`material-symbols-outlined ${analyzing ? 'animate-spin' : ''}`} style={{ fontSize: '18px' }}>{analyzing ? 'sync' : 'psychology'}</span>
                                        {analyzing ? '后台分析中...' : '分析需求'}
                                    </button>
                                    <button disabled={supplementing || !prdFilePath.trim()} onClick={handleSupplementFromPRD} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-blue-500 to-indigo-500 text-white ${supplementing || !prdFilePath.trim() ? 'opacity-50' : ''}`}>
                                        <span className={`material-symbols-outlined ${supplementing ? 'animate-spin' : ''}`} style={{ fontSize: '18px' }}>{supplementing ? 'sync' : 'add_circle'}</span>
                                        {supplementing ? '补充中...' : '补充计划'}
                                    </button>
                                </div>
                                {analyzing && taskStatus && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className={`w-2 h-2 rounded-full ${getStatusColor(taskStatus.status)}`}></span>
                                        <span className="text-xs text-slate-500">{taskStatus.message} ({taskStatus.progress}%)</span>
                                    </div>
                                )}
                            </div>
                            <div className="p-2 border-b border-slate-200 dark:border-slate-800">
                                <input type="text" value={prdFilePath} onChange={(e) => setPrdFilePath(e.target.value)} placeholder="PRD 文件路径..." className="w-full px-3 py-1.5 rounded-md text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-700" />
                            </div>
                            <textarea className="flex-1 w-full bg-transparent p-4 text-sm font-mono resize-none focus:outline-none" value={prdContent} onChange={(e) => setPrdContent(e.target.value)} placeholder="在此输入项目需求..." />
                        </div>
                        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#1e1e1e]">
                            <div className="flex-1 flex flex-col border-b border-slate-200 dark:border-slate-800 min-h-0">
                                <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#252526] flex justify-between items-center">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">开发计划</h3>
                                    <div className="flex items-center gap-2">
                                        {devPlanModified && <span className="text-xs text-orange-500">已修改</span>}
                                        <button onClick={handleSaveDevPlan} disabled={!devPlanModified || isSaving} className={`px-2 py-1 text-xs rounded ${devPlanModified ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                                            {isSaving ? '保存中...' : '保存'}
                                        </button>
                                    </div>
                                </div>
                                <textarea className="flex-1 w-full bg-transparent p-4 text-sm font-mono resize-none focus:outline-none" value={devPlan} onChange={(e) => { setDevPlan(e.target.value); setDevPlanModified(true); }} placeholder="开发计划..." />
                            </div>
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#252526] flex justify-between items-center">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">测试计划</h3>
                                    <div className="flex items-center gap-2">
                                        {testPlanModified && <span className="text-xs text-orange-500">已修改</span>}
                                        <button onClick={handleSaveTestPlan} disabled={!testPlanModified || isSaving} className={`px-2 py-1 text-xs rounded ${testPlanModified ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                                            {isSaving ? '保存中...' : '保存'}
                                        </button>
                                    </div>
                                </div>
                                <textarea className="flex-1 w-full bg-transparent p-4 text-sm font-mono resize-none focus:outline-none" value={testPlan} onChange={(e) => { setTestPlan(e.target.value); setTestPlanModified(true); }} placeholder="测试计划..." />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'progress' && (
                    <div className="h-full flex flex-col bg-white dark:bg-[#1e1e1e]">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#252526]">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">开发进度</h3>
                                <button onClick={handleResetSteps} className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600">重置进度</button>
                            </div>
                            {progress && (
                                <>
                                    <div className="flex items-center gap-4 mb-2">
                                        <div className="flex-1 h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500" style={{ width: `${progress.percent}%` }} />
                                        </div>
                                        <span className="text-sm font-medium">{Math.round(progress.percent)}%</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <span>总计: {progress.total_steps} 步</span>
                                        <span className="text-green-500">已完成: {progress.completed_steps}</span>
                                        <span className="text-yellow-500">已跳过: {progress.skipped_steps}</span>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {!progress || progress.steps.length === 0 ? (
                                <div className="text-center text-slate-500 py-8">
                                    <span className="material-symbols-outlined text-4xl mb-2">format_list_bulleted</span>
                                    <p>暂无开发步骤，请先生成开发计划</p>
                                </div>
                            ) : (
                                progress.steps.map((step) => (
                                    <div key={step.id} className={`p-4 rounded-lg border-2 ${step.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20 border-green-300' :
                                        step.status === 'skipped' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300' :
                                            step.status === 'in_progress' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400' :
                                                'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                        }`}>
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${step.status === 'completed' ? 'bg-green-500' :
                                                    step.status === 'skipped' ? 'bg-yellow-500' :
                                                        step.status === 'in_progress' ? 'bg-blue-500' : 'bg-slate-400'
                                                    }`}>{step.id}</span>
                                                <div>
                                                    <h4 className="font-medium text-sm">{step.title}</h4>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${step.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                        step.status === 'skipped' ? 'bg-yellow-100 text-yellow-700' :
                                                            step.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                        {step.status === 'pending' ? '待完成' : step.status === 'completed' ? '已完成' : step.status === 'skipped' ? '已跳过' : '进行中'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {step.status !== 'completed' && (
                                                    <button onClick={() => handleMarkStepCompleted(step.id)} className="p-1.5 rounded bg-green-500 text-white hover:bg-green-600" title="完成">
                                                        <span className="material-symbols-outlined text-sm">check</span>
                                                    </button>
                                                )}
                                                {step.status !== 'skipped' && step.status !== 'completed' && (
                                                    <button onClick={() => handleMarkStepSkipped(step.id)} className="p-1.5 rounded bg-yellow-500 text-white hover:bg-yellow-600" title="跳过">
                                                        <span className="material-symbols-outlined text-sm">skip_next</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {step.content && (
                                            <div className="ml-11 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono bg-slate-100 dark:bg-slate-900 p-2 rounded">
                                                {step.content.slice(0, 200)}{step.content.length > 200 && '...'}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'code' && (
                    <div className="h-full flex flex-col">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#252526] flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`size-3 rounded-full ${executing ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
                                <span className="text-sm font-medium">{executing ? 'AI 正在开发中...' : '准备就绪'}</span>
                            </div>
                            <button disabled={executing || !devPlan} onClick={handleStartCoding} className={`px-6 py-2 rounded-xl bg-purple-600 text-white font-bold text-sm ${executing || !devPlan ? 'opacity-50 grayscale' : ''}`}>
                                开始开发
                            </button>
                        </div>
                        <div className="flex-1 bg-[#1e1e1e] p-4 overflow-y-auto font-mono text-xs text-slate-300">
                            {logs.length === 0 && <span className="text-slate-600 italic">日志将显示在这里...</span>}
                            {logs.map((log, i) => <div key={i} className="mb-1 border-b border-white/5 pb-1">{log}</div>)}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
