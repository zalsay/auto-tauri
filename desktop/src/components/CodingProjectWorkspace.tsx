import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from "@tauri-apps/api/core";


interface Project {
    id: string;
    name: string;
    url: string;
    prompt: string;
    type: string;
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

    // Load saved plans and check task status on mount
    useEffect(() => {
        if (project.prompt) {
            setPrdContent(project.prompt);
        }
        loadSavedPlans();
        loadProgress();
        checkTaskStatus();
    }, [project]);

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
        try {
            const devResult = await invoke('read_plan_file', { projectPath: project.url, fileName: 'develop_plan.md' });
            setDevPlan(devResult as string);
        } catch (e) {
            console.log("No saved dev plan found");
        }

        try {
            const testResult = await invoke('read_plan_file', { projectPath: project.url, fileName: 'testing_plan.md' });
            setTestPlan(testResult as string);
        } catch (e) {
            console.log("No saved test plan found");
        }
    }, [project.url]);

    const handleSaveDevPlan = async () => {
        setIsSaving(true);
        try {
            await invoke('save_plan_file', { content: devPlan, projectPath: project.url, fileName: 'develop_plan.md' });
            setDevPlanModified(false);
            setLogs(prev => [...prev, "[系统] 开发计划已保存"]);
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
            await invoke('start_analysis_task', {
                projectName: project.name,
                projectPath: project.url,
                taskDescription: prdContent || project.prompt
            });
            setLogs(prev => [...prev, "[系统] 任务已在后台启动，离开页面后继续执行"]);
        } catch (e) {
            console.error("Analysis failed:", e);
            setLogs(prev => [...prev, `[错误] ${JSON.stringify(e)}`]);
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
            const prompt = `Execute the development plan at specs/develop_plan.md. Verify using specs/testing_plan.md. Context: ${project.url}`;
            await invoke('smart_dispatch_task', { taskDescription: prompt, projectPath: project.url });
            setLogs(prev => [...prev, "[系统] 任务已分发"]);
        } catch (e) {
            setLogs(prev => [...prev, `[错误] ${JSON.stringify(e)}`]);
        } finally {
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
                                    <div key={step.id} className={`p-4 rounded-lg border-2 ${
                                        step.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20 border-green-300' :
                                        step.status === 'skipped' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300' :
                                        step.status === 'in_progress' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400' :
                                        'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                    }`}>
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                                    step.status === 'completed' ? 'bg-green-500' :
                                                    step.status === 'skipped' ? 'bg-yellow-500' :
                                                    step.status === 'in_progress' ? 'bg-blue-500' : 'bg-slate-400'
                                                }`}>{step.id}</span>
                                                <div>
                                                    <h4 className="font-medium text-sm">{step.title}</h4>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                        step.status === 'completed' ? 'bg-green-100 text-green-700' :
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
