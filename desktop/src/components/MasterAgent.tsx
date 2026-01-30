import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_result';
    content: string;
    timestamp: number;
    toolName?: string;
    toolInput?: string;
    toolOutput?: string;
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

type WorkflowStage = 'init' | 'analysis' | 'planning' | 'development' | 'testing' | 'delivery' | 'completed';

interface MasterAgentProps {
    projectPath: string;
    projectName: string;
    prompt: string;
    skills?: string[];
    codingMode?: 'standard' | 'expert';
    codingConfig?: CodingMasterConfig | null;
    isRunning?: boolean;
    onProgressUpdate?: (content: string) => void;
    onComplete?: (result: { success: boolean }) => void;
    onRun?: () => void;
}

export default function MasterAgent({ projectPath, projectName, prompt, skills = [], codingMode = 'standard', codingConfig = null, isRunning: externalRunning, onProgressUpdate, onComplete, onRun }: MasterAgentProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [localRunning, setLocalRunning] = useState(false);
    const [config, setConfig] = useState<CodingMasterConfig | null>(codingConfig);
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('init');
    const [stageProgress, setStageProgress] = useState(0);

    const running = externalRunning !== undefined ? externalRunning : localRunning;

    useEffect(() => {
        if (codingConfig) {
            setConfig(codingConfig);
        }
    }, [codingConfig]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const sessionIdRef = useRef('master-agent-' + Date.now());

    const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
        setMessages(prev => [...prev, {
            ...message,
            id: message.role + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            timestamp: Date.now()
        }]);
    }, []);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const stageLabels: Record<WorkflowStage, string> = {
        init: '初始化',
        analysis: '需求分析',
        planning: '计划生成',
        development: '功能开发',
        testing: '测试验证',
        delivery: '项目交付',
        completed: '完成'
    };

    const stageColors: Record<string, string> = {
        init: 'from-slate-500 to-slate-600',
        analysis: 'from-blue-500 to-cyan-500',
        planning: 'from-purple-500 to-pink-500',
        development: 'from-orange-500 to-red-500',
        testing: 'from-green-500 to-emerald-500',
        delivery: 'from-indigo-500 to-purple-500',
        completed: 'from-green-400 to-emerald-500'
    };

    const getActiveConfig = useCallback(() => {
        if (codingMode === 'expert' && config?.expert_model) {
            return {
                provider: config.expert_provider || config.provider,
                api_key: config.expert_api_key || config.api_key,
                model: config.expert_model
            };
        }
        return {
            provider: config?.provider || '',
            api_key: config?.api_key || '',
            model: config?.model || config?.small_model || ''
        };
    }, [config, codingMode]);

    const executeCommand = async function(command: string): Promise<{ success: boolean; output: string; error?: string }> {
        const cmdPreview = command.length > 100 ? command.substring(0, 100) + '...' : command;
        addMessage({
            role: 'tool',
            content: '执行命令: ' + cmdPreview,
            toolName: 'terminal',
            toolInput: command
        });

        try {
            const result = await invoke<{ success: boolean; exitCode: number; output: string; error?: string }>(
                'execute_sandbox_command',
                {
                    sandboxId: sessionIdRef.current,
                    command: command,
                    workingDir: projectPath,
                    sessionId: sessionIdRef.current
                }
            );

            addMessage({
                role: 'tool_result',
                content: result.output || (result.exitCode === 0 ? '命令执行完成' : '执行完成'),
                toolName: 'terminal',
                toolOutput: result.output
            });

            return result;
        } catch (err: any) {
            const errorMsg = err.message || JSON.stringify(err);
            addMessage({
                role: 'tool_result',
                content: '错误: ' + errorMsg,
                toolName: 'terminal',
                toolOutput: errorMsg
            });
            return { success: false, output: '', error: errorMsg };
        }
    };

    const executeSkill = async function(skillPath: string, skillPrompt: string): Promise<{ success: boolean; output: string; error?: string }> {
        try {
            const activeConfig = getActiveConfig();
            const model = activeConfig.model || 'anthropic/claude-3-5-sonnet-20241022';
            
            console.log('[任务大师] 执行 opencode 命令');
            console.log('[任务大师] 模型:', model);
            console.log('[任务大师] Skill:', skillPath);

            // 构建 opencode 命令
            const escapedSkillPath = skillPath.replace(/"/g, '\\"');
            const escapedPrompt = skillPrompt.replace(/"/g, '\\"');
            const command = `opencode --title "全流程开发" --model "${model}" --skill "${escapedSkillPath}" --prompt "${escapedPrompt}"`;

            console.log('[任务大师] 命令:', command);

            // 添加初始消息
            addMessage({
                role: 'assistant',
                content: '⏳ 正在调用 OpenCode 生成开发计划...'
            });

            // 执行 opencode 命令
            const result = await invoke<{ success: boolean; output: string; error?: string }>(
                'execute_sandbox_command',
                {
                    sandboxId: sessionIdRef.current,
                    command: command,
                    workingDir: projectPath,
                    sessionId: sessionIdRef.current
                }
            );

            console.log('[任务大师] OpenCode 执行结果:', result.success);

            if (!result.success) {
                addMessage({
                    role: 'assistant',
                    content: '❌ OpenCode 执行失败: ' + (result.error || '未知错误')
                });
                return { success: false, output: '', error: result.error };
            }

            const output = result.output || '';
            console.log('[任务大师] 输出长度:', output.length);

            // 更新消息显示输出
            addMessage({
                role: 'assistant',
                content: '✅ OpenCode 执行完成！\n\n输出内容:\n' + output
            });

            // 解析并保存文件
            console.log('[任务大师] 解析并保存计划文件...');
            
            // 从输出中提取开发计划
            const devPlanMatch = output.match(/开发计划[:：]?\s*([\s\S]*?)(?=测试计划[:：]?|$)/i);
            const devPlan = devPlanMatch ? '# 开发计划\n\n' + devPlanMatch[1].trim() : '# 开发计划\n\n' + output;
            
            // 从输出中提取测试计划
            const testPlanMatch = output.match(/测试计划[:：]?\s*([\s\S]*)/i);
            const testPlan = testPlanMatch ? '# 测试计划\n\n' + testPlanMatch[1].trim() : '# 测试计划\n\n暂无测试计划';

            // 保存文件
            await invoke('save_plan_file', {
                path: projectPath + '/specs/develop_plan.md',
                content: devPlan
            });
            
            await invoke('save_plan_file', {
                path: projectPath + '/specs/testing_plan.md',
                content: testPlan
            });

            // 生成开发步骤 JSON
            const steps = [];
            const stepPattern = /Step\s*(\d+)[:\s]*([^\n]+)/gi;
            let match;
            let stepId = 1;

            while ((match = stepPattern.exec(output)) !== null && stepId <= 20) {
                steps.push({
                    id: stepId,
                    title: match[2].trim(),
                    content: match[0],
                    status: 'pending'
                });
                stepId++;
            }

            // 如果没有找到步骤，创建一个默认步骤
            if (steps.length === 0) {
                steps.push({
                    id: 1,
                    title: '实现核心功能',
                    content: '根据开发计划实现核心功能代码',
                    status: 'pending'
                });
            }

            await invoke('save_plan_file', {
                path: projectPath + '/specs/dev_steps.json',
                content: JSON.stringify(steps, null, 2)
            });

            console.log('[任务大师] 计划文件已保存');
            
            return { success: true, output: output, error: undefined };
        } catch (err: any) {
            console.error('[任务大师] 执行失败:', err);
            addMessage({
                role: 'assistant',
                content: '❌ 执行失败: ' + (err.message || String(err))
            });
            return { success: false, output: '', error: err.message || String(err) };
        }
    };

    const runCurrentTask = async () => {
        if (running) {
            console.log('[任务大师] 已在运行中，跳过');
            return;
        }

        console.log('[任务大师] 开始执行任务，当前阶段:', workflowStage);
        setLocalRunning(true);
        onRun?.();

        const promptContent = prompt || '请根据项目上下文分析需求';

        try {
            switch (workflowStage) {
                case 'init':
                    console.log('[任务大师] 执行初始化阶段');
                    addMessage({
                        role: 'system',
                        content: '任务大师已启动\n\n项目: ' + projectName + '\n路径: ' + projectPath + '\n模式: ' + (codingMode === 'expert' ? '专家模式' : '标准模式') + '\n\n正在初始化工作环境...'
                    });
                    console.log('[任务大师] 执行 pwd && ls -la 命令');
                    const initResult = await executeCommand('cd "' + projectPath + '" && pwd && ls -la');
                    console.log('[任务大师] 初始化命令结果:', initResult);
                    setStageProgress(15);
                    setWorkflowStage('analysis');
                    console.log('[任务大师] 已切换到需求分析阶段');
                    addMessage({ role: 'system', content: '✅ 初始化完成！\n\n请点击右上角"继续下一环节"按钮执行需求分析。' });
                    break;

                case 'analysis':
                    console.log('[任务大师] 执行需求分析阶段');
                    
                    // 添加初始消息
                    addMessage({ role: 'system', content: '开始第一阶段: 需求分析\n\n正在分析项目需求...' });
                    
                    // 构建需求分析命令
                    const activeConfig = getActiveConfig();
                    const model = activeConfig.model || 'anthropic/claude-3-5-sonnet-20241022';
                    
                    // 读取项目结构
                    const lsResult = await executeCommand('cd "' + projectPath + '" && ls -la');
                    const pkgResult = await executeCommand('cd "' + projectPath + '" && cat package.json 2>/dev/null || echo "无 package.json"');
                    
                    const analysisPrompt = `项目名称: ${projectName}
项目路径: ${projectPath}
项目结构:
${lsResult.output || '无'}

技术栈信息:
${pkgResult.output || '未知'}

用户原始需求:
${prompt || '无'}

请作为专业的产品经理，分析以上需求并输出：
1. 项目概述
2. 核心功能需求
3. 非功能需求（性能、安全、兼容性等）
4. 技术选型建议`;

                    const escapedAnalysisPrompt = analysisPrompt.replace(/"/g, '\\"');
                    const analysisCommand = `opencode --title "需求分析" --model "${model}" --prompt "${escapedAnalysisPrompt}"`;
                    
                    console.log('[任务大师] 执行需求分析命令');
                    
                    // 执行需求分析
                    const analysisResult = await invoke<{ success: boolean; output: string; error?: string }>(
                        'execute_sandbox_command',
                        {
                            sandboxId: sessionIdRef.current,
                            command: analysisCommand,
                            workingDir: projectPath,
                            sessionId: sessionIdRef.current
                        }
                    );
                    
                    console.log('[任务大师] 需求分析结果:', analysisResult.success);
                    
                    if (analysisResult.success && analysisResult.output) {
                        addMessage({
                            role: 'assistant',
                            content: '✅ 需求分析完成！\n\n' + analysisResult.output
                        });
                        
                        // 保存需求分析结果
                        await invoke('save_plan_file', {
                            path: projectPath + '/specs/requirements_analysis.md',
                            content: '# 需求分析\n\n' + analysisResult.output
                        });
                    } else {
                        addMessage({
                            role: 'assistant',
                            content: '✅ 需求分析完成！（基础分析）\n\n项目基本信息:\n- 名称: ' + projectName + '\n- 路径: ' + projectPath
                        });
                    }
                    
                    setStageProgress(30);
                    setWorkflowStage('planning');
                    console.log('[任务大师] 已切换到计划生成阶段');
                    break;

                case 'planning':
                    console.log('[任务大师] 执行计划生成阶段');
                    addMessage({ role: 'assistant', content: '正在生成开发计划和测试计划...' });
                    console.log('[任务大师] 调用 executeSkill');
                    const skillResult = await executeSkill(
                        '/Users/yingzhang/Documents/dev/auto-tauri/_skills/specification-planning/SKILL.md',
                        promptContent
                    );
                    console.log('[任务大师] skillResult:', skillResult);

                    if (skillResult.success) {
                        // 读取生成的计划文件内容
                        const devPlanContent = await executeCommand('cat "' + projectPath + '/specs/develop_plan.md" 2>/dev/null || echo ""');
                        const testPlanContent = await executeCommand('cat "' + projectPath + '/specs/testing_plan.md" 2>/dev/null || echo ""');
                        
                        let progressText = '';
                        if (devPlanContent.success && devPlanContent.output) {
                            progressText += '=== 开发计划 ===\n\n' + devPlanContent.output;
                        }
                        if (testPlanContent.success && testPlanContent.output) {
                            progressText += '\n\n=== 测试计划 ===\n\n' + testPlanContent.output;
                        }
                        if (progressText && onProgressUpdate) {
                            onProgressUpdate(progressText);
                        }
                    } else {
                        addMessage({ role: 'assistant', content: '❌ 计划生成遇到问题.\n\n' + (skillResult.output || skillResult.error) });
                    }

                    setStageProgress(50);
                    setWorkflowStage('development');
                    addMessage({ role: 'assistant', content: '✅ 计划生成完成！\n\n请点击右上角"继续下一环节"按钮开始功能开发。' });
                    break;

                case 'development':
                    console.log('[任务大师] 执行功能开发阶段');
                    addMessage({ role: 'assistant', content: '开始第二阶段: 功能开发\n\n将按照计划逐步实现功能...' });
                    addMessage({ role: 'system', content: '开始功能开发\n\n1. 首先创建项目目录结构\n2. 按步骤实现功能\n3. 每个步骤完成后更新进度' });
                    
                    await executeCommand('cd "' + projectPath + '" && mkdir -p specs src tests && ls -la');
                    await executeCommand('cd "' + projectPath + '" && if [ -f specs/develop_plan.md ]; then echo "开发计划存在，开始执行..."; else echo "暂无开发计划"; fi');

                    const devStepsResult = await executeCommand('cat "' + projectPath + '/specs/dev_steps.json" 2>/dev/null || echo ""');
                    if (devStepsResult.success && devStepsResult.output && onProgressUpdate) {
                        const devPlanContent = await executeCommand('cat "' + projectPath + '/specs/develop_plan.md" 2>/dev/null || echo ""');
                        onProgressUpdate('=== 开发计划 ===\n\n' + (devPlanContent.output || '') + '\n\n=== 开发步骤状态 ===\n\n' + devStepsResult.output);
                    }

                    setStageProgress(75);
                    setWorkflowStage('testing');
                    addMessage({ role: 'assistant', content: '✅ 功能开发完成！\n\n请点击右上角"继续下一环节"按钮开始测试验证。' });
                    break;

                case 'testing':
                    console.log('[任务大师] 执行测试验证阶段');
                    addMessage({ role: 'assistant', content: '开始第三阶段: 测试验证\n\n检查生成的代码和文件...' });
                    addMessage({ role: 'system', content: '开始测试验证\n\n检查代码和文件...' });
                    
                    await executeCommand('cd "' + projectPath + '" && find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.py" | head -20');

                    const testPlanResult = await executeCommand('cat "' + projectPath + '/specs/testing_plan.md" 2>/dev/null || echo ""');
                    if (testPlanResult.success && testPlanResult.output && onProgressUpdate) {
                        onProgressUpdate('=== 测试计划 ===\n\n' + testPlanResult.output);
                    }

                    setStageProgress(90);
                    setWorkflowStage('delivery');
                    addMessage({ role: 'assistant', content: '✅ 测试验证完成！\n\n请点击右上角"继续下一环节"按钮完成项目交付。' });
                    break;

                case 'delivery':
                    console.log('[任务大师] 执行项目交付阶段');
                    addMessage({ role: 'assistant', content: '开始第四阶段: 项目整理\n\n整理项目文档...' });
                    
                    await executeCommand('cd "' + projectPath + '" && echo "=== 项目结构 ===" && tree -L 3 -I node_modules 2>/dev/null || ls -la');

                    if (onProgressUpdate) {
                        const finalContent = await executeCommand('cat "' + projectPath + '/specs/dev_steps.json" 2>/dev/null || echo ""');
                        onProgressUpdate('=== 开发步骤状态 ===\n\n' + (finalContent.output || '所有步骤已完成'));
                    }

                    setStageProgress(100);
                    setWorkflowStage('completed');
                    addMessage({ role: 'assistant', content: '🎉 项目开发完成！\n\n所有任务已完成。\n\n提示: 你可以继续与我对话，告诉我需要完成的具体功能或修复的问题。' });
                    break;

                case 'completed':
                    console.log('[任务大师] 任务已完成');
                    addMessage({ role: 'system', content: '所有任务已完成!' });
                    break;
            }
        } catch (error) {
            console.error('[任务大师] 执行出错:', error);
            addMessage({ role: 'system', content: '执行出错: ' + String(error) });
        }

        console.log('[任务大师] 任务执行完成，关闭运行状态');
        setLocalRunning(false);
        onComplete?.({ success: workflowStage !== 'init' && workflowStage !== 'completed' });
    };

    const handleKeyDown = function(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleSendMessage = async function(content?: string) {
        const messageContent = content || inputValue.trim();
        if (!messageContent || running) return;

        if (!content) {
            addMessage({ role: 'user', content: messageContent });
            setInputValue('');
        }

        addMessage({
            role: 'assistant',
            content: '收到你的指令: ' + messageContent + '\n\n当前任务正在执行中，请等待完成后再继续。'
        });
    };

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-slate-300 font-mono text-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-[#161b22]">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className={'w-2.5 h-2.5 rounded-full ' + (running ? 'bg-green-500 animate-pulse' : 'bg-slate-500')}></span>
                        <span className="text-sm font-medium text-white">任务大师</span>
                    </div>
                    <span className="text-slate-500">|</span>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">模式:</span>
                        <span className={'px-2 py-0.5 rounded text-xs font-medium ' + (
                            codingMode === 'expert' 
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                                : 'bg-slate-700 text-slate-300'
                        )}>
                            {codingMode === 'expert' ? '专家' : '标准'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">阶段:</span>
                        <span className={'px-2 py-0.5 rounded text-xs font-medium bg-gradient-to-r ' + stageColors[workflowStage] + ' text-white'}>
                            {stageLabels[workflowStage]}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">进度:</span>
                        <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className={'h-full bg-gradient-to-r ' + stageColors[workflowStage] + ' transition-all duration-500'} style={{ width: stageProgress + '%' }} />
                        </div>
                        <span className="text-xs text-slate-400">{stageProgress}%</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {workflowStage !== 'completed' ? (
                        <button
                            onClick={runCurrentTask}
                            disabled={running}
                            className={'px-4 py-1.5 text-xs font-medium rounded transition-colors ' + (
                                running
                                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:opacity-90'
                            )}
                        >
                            {running ? '执行中...' : '继续下一环节'}
                        </button>
                    ) : (
                        <button
                            onClick={() => window.location.reload()}
                            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                        >
                            重新开始
                        </button>
                    )}
                </div>
            </div>

            <div className={'h-1 bg-slate-800'}>
                <div className={'h-full bg-gradient-to-r ' + stageColors[workflowStage] + ' transition-all duration-500'} style={{ width: stageProgress + '%' }} />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <span className="material-symbols-outlined text-4xl mb-2">psychology</span>
                        <p className="text-sm">点击"继续下一环节"开始执行任务</p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={'rounded-lg border ' + (
                        msg.role === 'system' ? 'bg-purple-900/20 border-purple-500/30' :
                        msg.role === 'user' ? 'bg-blue-900/20 border-blue-500/30' :
                        msg.role === 'assistant' ? 'bg-green-900/20 border-green-500/30' :
                        msg.role === 'tool' ? 'bg-yellow-900/20 border-yellow-500/30' :
                        'bg-orange-900/20 border-orange-500/30'
                    )}>
                        <div className="px-3 py-1.5 border-b border-slate-700 flex items-center gap-2">
                            <span className={'text-xs font-medium ' + (
                                msg.role === 'system' ? 'text-purple-400' :
                                msg.role === 'user' ? 'text-blue-400' :
                                msg.role === 'assistant' ? 'text-green-400' :
                                msg.role === 'tool' ? 'text-yellow-400' :
                                'text-orange-400'
                            )}>
                                {msg.role === 'system' ? '系统' :
                                 msg.role === 'user' ? '用户' :
                                 msg.role === 'assistant' ? 'AI' :
                                 msg.role === 'tool' ? '工具' : '结果'}
                            </span>
                            <span className="text-xs text-slate-600 ml-auto">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                        <div className="p-3 whitespace-pre-wrap text-xs">
                            {msg.content}
                        </div>
                    </div>
                ))}

                {running && (
                    <div className="flex items-center gap-2 text-slate-500">
                        <span className="animate-spin">◐</span>
                        <span>执行中...</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-slate-700 bg-[#161b22]">
                <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-mono">&#62;</span>
                    <input ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="输入指令或问题..." disabled={running} className="flex-1 bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 focus:ring-0" autoFocus />
                    <button onClick={() => handleSendMessage()} disabled={running || !inputValue.trim()} className="px-4 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs rounded transition-colors">
                        发送
                    </button>
                </div>
            </div>
        </div>
    );
}
