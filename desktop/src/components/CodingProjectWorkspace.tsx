import React, { useState, useEffect, useRef } from 'react';
import { invoke } from "@tauri-apps/api/core";
import SandboxTerminal, { SandboxTerminalRef } from './SandboxTerminal';

interface Project {
    id: string;
    name: string;
    url: string;
    prompt: string;
    type: string;
}

interface WorkflowStep {
    id: number;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    description: string;
}

interface CodingMasterConfig {
    provider: string;
    api_key: string;
    model: string;
    small_model: string;
    expert_provider: string;
    expert_api_key: string;
    expert_model: string;
}

interface CodingProjectWorkspaceProps {
    project: Project;
    onBack: () => void;
}

const WORKFLOW_STEPS: Omit<WorkflowStep, 'status'>[] = [
    { id: 1, name: '初始化', description: '初始化开发环境' },
    { id: 2, name: '需求分析', description: '分析项目需求' },
    { id: 3, name: '计划生成', description: '生成开发计划' },
    { id: 4, name: '功能开发', description: '按计划开发功能' },
    { id: 5, name: '项目交付', description: '整理文档完成项目' },
];

export default function CodingProjectWorkspace({ project, onBack }: CodingProjectWorkspaceProps) {
    const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>(
        WORKFLOW_STEPS.map(s => ({ ...s, status: 'pending' }))
    );
    const [currentStep, setCurrentStep] = useState(1);
    const [projectProgress, setProjectProgress] = useState(0);
    const [codingMode, setCodingMode] = useState<'standard' | 'expert'>('standard');
    const [codingConfig, setCodingConfig] = useState<CodingMasterConfig | null>(null);
    const [currentProgressContent, setCurrentProgressContent] = useState<string>('');
    const [isRunning, setIsRunning] = useState(false);
    const [currentCommand, setCurrentCommand] = useState<string>('');
    const [failedCommands, setFailedCommands] = useState<Set<string>>(new Set());
    const terminalRef = useRef<SandboxTerminalRef>(null);

    useEffect(() => {
        loadCodingConfig();
    }, []);

    const loadCodingConfig = async () => {
        try {
            const configData = await invoke<CodingMasterConfig>('get_coding_master_config');
            setCodingConfig(configData);
        } catch (e) {
            console.error('Failed to load coding config:', e);
        }
    };

    const switchCodingMode = (mode: 'standard' | 'expert') => {
        setCodingMode(mode);
    };

    const getActiveModel = () => {
        if (!codingConfig) return 'anthropic/claude-3-5-sonnet-20241022';
        if (codingMode === 'expert' && codingConfig.expert_model) {
            return codingConfig.expert_model;
        }
        return codingConfig.model || codingConfig.small_model || 'anthropic/claude-3-5-sonnet-20241022';
    };

    const loadCurrentProgress = async () => {
        try {
            const devPlan = await invoke<string>('read_file_content', { 
                path: project.url + '/specs/develop_plan.md' 
            }).catch(() => '');
            const testPlan = await invoke<string>('read_file_content', { 
                path: project.url + '/specs/testing_plan.md' 
            }).catch(() => '');
            const devSteps = await invoke<string>('read_file_content', { 
                path: project.url + '/specs/dev_steps.json' 
            }).catch(() => '');

            let content = '';
            if (devPlan) content += '=== 开发计划 ===\n\n' + devPlan;
            if (testPlan) content += '\n\n=== 测试计划 ===\n\n' + testPlan;
            if (devSteps) content += '\n\n=== 开发步骤 ===\n\n' + devSteps;
            setCurrentProgressContent(content || '暂无进度内容');
        } catch (e) {
            setCurrentProgressContent('加载进度内容失败');
        }
    };

    const executeCommand = async (command: string): Promise<boolean> => {
        setCurrentCommand(command);
        if (terminalRef.current) {
            await terminalRef.current.executeCommand(command);
            // 等待命令执行完成
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        // 返回命令是否成功（检查 failedCommands）
        return !failedCommands.has(command);
    };

    const markCommandFailed = (command: string) => {
        setFailedCommands(prev => new Set([...prev, command]));
    };

    const clearFailedStatus = () => {
        setFailedCommands(new Set());
    };

    const runCurrentStep = async () => {
        if (isRunning) return;
        setIsRunning(true);
        clearFailedStatus();

        if (currentStep === 1) {
            // 初始化步骤：生成 opencode 配置
            await executeCommand(`cd "${project.url}" && pwd && ls -la`);
            
            try {
                const result = await invoke<string>('generate_opencode_config');
                await executeCommand(`echo "${result}"`);
                await executeCommand('cat ~/.config/opencode/config.json');
            } catch (e) {
                await executeCommand(`echo "生成配置失败: ${e}"`);
            }
            
            await executeCommand('echo "=== 初始化完成 ==="');
            await executeCommand('echo "点击右上角按钮开始需求分析"');
            
            // 更新步骤状态
            setWorkflowSteps(prev => prev.map(s => {
                if (s.id === 1) return { ...s, status: 'completed' };
                if (s.id === 2) return { ...s, status: 'running' };
                return s;
            }));
            setCurrentStep(2);
            setIsRunning(false);
            return;
        }

        const stepCommands: Record<number, string[]> = {
            2: [
                'echo "=== 开始需求分析 ==="',
                `opencode run '分析以下项目需求：${project.name}，${project.prompt || "无"}'`,
                'echo "=== 需求分析完成 ==="'
            ],
            3: [
                'echo "=== 开始生成开发计划 ==="',
                `opencode run '为项目${project.name}生成开发计划和测试计划'`,
                'echo "=== 计划生成完成 ==="'
            ],
            4: [
                'echo "=== 开始功能开发 ==="',
                `mkdir -p ${project.url}/src ${project.url}/tests ${project.url}/specs`,
                `opencode run '实现项目${project.url}的第一个功能'`,
                'echo "=== 功能开发完成 ==="'
            ],
            5: [
                'echo "=== 项目整理 ==="',
                `tree -L 3 -I node_modules ${project.url} 2>/dev/null || ls -la ${project.url}`,
                'echo "=== 项目开发完成 ==="'
            ]
        };

        const commands = stepCommands[currentStep] || [];

        for (const cmd of commands) {
            const success = await executeCommand(cmd);
            if (!success) {
                setWorkflowSteps(prev => prev.map(s => {
                    if (s.id === currentStep) return { ...s, status: 'failed' };
                    return s;
                }));
                setIsRunning(false);
                return;
            }
        }

        setWorkflowSteps(prev => prev.map(s => {
            if (s.id === currentStep) return { ...s, status: 'completed' };
            if (s.id === currentStep + 1) return { ...s, status: 'running' };
            return s;
        }));

        if (currentStep < 5) {
            setCurrentStep(prev => prev + 1);
        } else {
            setWorkflowSteps(prev => prev.map(s => ({ ...s, status: 'completed' })));
        }

        setIsRunning(false);
    };

    const resetWorkflow = async () => {
        try {
            await invoke('reset_steps', { projectPath: project.url });
            setWorkflowSteps(WORKFLOW_STEPS.map(s => ({ ...s, status: 'pending' })));
            setCurrentStep(1);
            setProjectProgress(0);
            setCurrentProgressContent('');
        } catch (e) {
            console.error('Failed to reset workflow:', e);
        }
    };

    const stepIcons = {
        pending: 'radio_button_unchecked',
        running: 'sync',
        completed: 'check_circle',
        failed: 'error',
    };

    const stepColors = {
        pending: 'border-slate-300 dark:border-slate-600',
        running: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
        completed: 'border-green-400 bg-green-50 dark:bg-green-900/20',
        failed: 'border-orange-400 bg-orange-50 dark:bg-orange-900/20',
    };

    const stepTextColors = {
        pending: 'text-slate-700 dark:text-slate-300',
        running: 'text-blue-600 dark:text-blue-400',
        completed: 'text-green-600 dark:text-green-400',
        failed: 'text-orange-600 dark:text-orange-400',
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-[#1e1e1e]">
            {/* Header */}
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
                <div className="flex items-center gap-4">
                    {/* 模式切换 */}
                    <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-800 rounded-lg p-1">
                        <button
                            onClick={() => switchCodingMode('standard')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                codingMode === 'standard' 
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            标准模式
                        </button>
                        <button
                            onClick={() => switchCodingMode('expert')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                codingMode === 'expert' 
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            专家模式
                        </button>
                    </div>

                    {/* 当前模型 */}
                    <span className="text-xs text-slate-500 font-mono">模型: {getActiveModel()}</span>

                    {/* 重置按钮 */}
                    <button
                        onClick={resetWorkflow}
                        className="px-3 py-1.5 text-xs rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                        重置流程
                    </button>

                    {/* 继续下一环节按钮 */}
                    {currentStep <= 5 && (
                        <button
                            onClick={runCurrentStep}
                            disabled={isRunning}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isRunning
                                    ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:opacity-90'
                            }`}
                        >
                            <span className="material-symbols-outlined text-sm">
                                {isRunning ? 'hourglass_empty' : 'play_arrow'}
                            </span>
                            {isRunning ? '执行中...' : '继续下一环节'}
                        </button>
                    )}
                </div>
            </div>

            {/* 主内容区 */}
            <div className="flex-1 flex overflow-hidden">
                {/* 左侧：工作流状态 */}
                <div className="w-80 bg-white dark:bg-[#1a1f26] border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
                    <div className="p-6">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                            开发流程
                        </h2>
                        <p className="text-xs text-slate-500 mb-6">
                            点击"继续下一环节"执行当前步骤
                        </p>

                        <div className="space-y-4">
                            {workflowSteps.map((step) => (
                                <div
                                    key={step.id}
                                    className={`p-4 rounded-lg border-2 ${stepColors[step.status]} transition-all ${
                                        step.id === currentStep && step.status !== 'failed' ? 'ring-2 ring-orange-500/50' : ''
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className={`material-symbols-outlined mt-0.5 ${
                                            step.status === 'running' ? 'animate-spin text-blue-500' :
                                            step.status === 'completed' ? 'text-green-500' :
                                            step.status === 'failed' ? 'text-orange-500' : 'text-slate-400'
                                        }`}>
                                            {stepIcons[step.status]}
                                        </span>
                                        <div className="flex-1">
                                            <h3 className={`text-sm font-medium ${stepTextColors[step.status]}`}>
                                                {step.id}. {step.name}
                                                {step.status === 'failed' && (
                                                    <span className="ml-2 text-xs text-orange-500 font-normal">执行失败，点击重试</span>
                                                )}
                                                {step.id === currentStep && step.status === 'pending' && (
                                                    <span className="ml-2 text-xs text-orange-500 font-normal">← 点击执行</span>
                                                )}
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {step.description}
                                            </p>
                                        </div>
                                        {step.status === 'completed' && (
                                            <span className="text-xs text-green-500 font-medium">完成</span>
                                        )}
                                        {step.status === 'running' && (
                                            <span className="text-xs text-blue-500 font-medium">执行中</span>
                                        )}
                                        {step.status === 'failed' && (
                                            <span className="text-xs text-orange-500 font-medium">失败</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 当前状态提示 */}
                        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-start gap-2">
                                <span className="material-symbols-outlined text-blue-500 mt-0.5">info</span>
                                <div>
                                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                        当前阶段: {WORKFLOW_STEPS[currentStep - 1]?.name}
                                    </h4>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                        点击上方按钮执行，或直接在右侧终端输入命令
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右侧：进度内容 + 终端 */}
                <div className="flex-1 flex flex-col bg-slate-100 dark:bg-[#0d1117] overflow-hidden">
                    {/* 当前进度内容 */}
                    <div className="h-1/3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1f26] flex flex-col shrink-0">
                        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161b22] flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">当前进度内容</span>
                            <button
                                onClick={() => loadCurrentProgress()}
                                className="text-xs text-blue-500 hover:text-blue-400"
                            >
                                刷新
                            </button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            {currentProgressContent ? (
                                <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">{currentProgressContent}</pre>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                                    点击"继续下一环节"按钮后显示进度内容
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 终端区域 */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <SandboxTerminal
                            defaultWorkingDir={project.url}
                            ref={terminalRef}
                            onCommandFailed={markCommandFailed}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
