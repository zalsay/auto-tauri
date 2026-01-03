import { useEffect, useState, useRef } from "react";
import { apiRequest, clearStoredToken, getStoredToken, setStoredToken } from "./api";
import { Command } from "@tauri-apps/plugin-shell";
import { convertFileSrc } from "@tauri-apps/api/path";
import MaterialCenter from "./MaterialCenter";
function HyperAgentResultDisplay({ data }: { data: any }) {
    console.log("[HyperAgentResultDisplay] Received raw data:", data);

    let structuredData: any = null;
    const rawString = data?.output || (typeof data === 'string' ? data : null);

    // If the input data contains a messy string in the 'output' field, parse it.
    if (rawString && typeof rawString === 'string') {
        const lines = rawString.split('\n');
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                // Heuristic: The main result object has `taskId` and a `data` object.
                if (parsed && parsed.taskId && parsed.status === 'success' && parsed.data) {
                    structuredData = parsed;
                    console.log("[HyperAgentResultDisplay] Found and parsed structured data line:", structuredData);
                    break; // Found the main result, stop searching.
                }
            } catch (e) {
                // This line is not a valid JSON, so we ignore it.
            }
        }
    }

    const finalData = structuredData || data;
    console.log("[HyperAgentResultDisplay] Using final data for rendering:", finalData);

    const result = finalData?.data || finalData;
    const output = result?.output;
    const steps = result?.steps || [];
    const screenshotUrl = result?.screenshotUrl;

    const isStructured = output || (steps && steps.length > 0);

    if (!isStructured) {
        return (
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 font-mono text-xs overflow-x-auto text-slate-900 dark:text-emerald-400">
                <pre>{JSON.stringify(finalData, null, 2)}</pre>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {screenshotUrl && (
                 <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">screenshot</span>
                        任务截图
                    </h4>
                    <img src={screenshotUrl} alt="Task Screenshot" className="rounded-lg border-2 border-slate-200 dark:border-slate-700 max-w-full h-auto cursor-pointer transition-all hover:scale-[1.02]" onClick={() => window.open(screenshotUrl)} />
                </div>
            )}

            {output && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">description</span>
                        最终结论
                    </h4>
                    <div className="text-slate-900 dark:text-slate-100 text-sm whitespace-pre-wrap leading-relaxed">
                        {output}
                    </div>
                </div>
            )}

            {steps && steps.length > 0 && (
                <div className="flex flex-col gap-4">
                    <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2 px-1">
                        <span className="material-symbols-outlined text-lg">format_list_numbered</span>
                        执行步骤 ({steps.length})
                    </h4>
                    <div className="space-y-3">
                        {steps.map((step: any, idx: number) => (
                            <div key={idx} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/40 transition-all hover:border-slate-300 dark:hover:border-slate-700">
                                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center size-5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                                            {idx + 1}
                                        </span>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize">
                                            {step.agentOutput?.action?.type?.replace(/_/g, ' ') || 'Action'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {step.actionOutput?.success ? (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                                                <span className="material-symbols-outlined text-[12px]">check_circle</span>成功
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                                                <span className="material-symbols-outlined text-[12px]">error</span>失败
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 space-y-3">
                                    {step.agentOutput?.thoughts && (
                                        <div className="flex gap-3 items-start">
                                            <span className="material-symbols-outlined text-slate-400 mt-0.5" style={{
                                                fontSize: '18px'
                                            }}>psychology</span>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                                                {step.agentOutput.thoughts}
                                            </p>
                                        </div>
                                    )}

                                    {step.agentOutput?.action?.params && Object.keys(step.agentOutput.action.params).length > 0 && (
                                        <div className="ml-7 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/50">
                                            <div className="grid grid-cols-1 gap-2">
                                                {Object.entries(step.agentOutput.action.params).map(([key, val]: [string, any]) => (
                                                    <div key={key} className="text-[11px] flex flex-col sm:flex-row sm:gap-2">
                                                        <span className="text-slate-500 dark:text-slate-500 font-medium sm:min-w-[80px]">{key}:</span>
                                                        <span className="text-slate-800 dark:text-slate-200 break-all font-mono">
                                                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {step.actionOutput?.message && step.actionOutput.message !== "Task Complete" && (
                                        <div className="ml-7 flex gap-2 items-center text-[10px] text-slate-500 dark:text-slate-500">
                                            <span className="material-symbols-outlined text-[14px]">info</span>
                                            <span>{step.actionOutput.message}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <details className="group">
                <summary className="text-[10px] text-slate-400 dark:text-slate-600 cursor-pointer hover:text-slate-500 transition-colors list-none flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] group-open:rotate-90 transition-transform">chevron_right</span>
                    查看原始数据 (JSON)
                </summary>
                <div className="mt-2 bg-slate-50 dark:bg-slate-900 rounded-lg p-4 font-mono text-[10px] overflow-x-auto text-slate-900 dark:text-emerald-400/80 border border-slate-100 dark:border-slate-800">
                    <pre>{JSON.stringify(finalData, null, 2)}</pre>
                </div>
            </details>
        </div>
    );
}
function App() {
    const [view, setView] = useState<View>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [rememberMe, setRememberMe] = useState(false);

    // Project inputs
    const [projectName, setProjectName] = useState("");
    const [projectPrompt, setProjectPrompt] = useState("");
    const [projectUrl, setProjectUrl] = useState("");
    const [projectType, setProjectType] = useState<"workflow" | "scrape">("workflow");
    const [projectScreenshot, setProjectScreenshot] = useState(false);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editProjectId, setEditProjectId] = useState<string | null>(null);

    // Settings inputs
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [llmProvider, setLlmProvider] = useState("TaskMaster");
    const [llmModel, setLlmModel] = useState("");
    const [llmApiKey, setLlmApiKey] = useState("");
    const [llmBaseUrl, setLlmBaseUrl] = useState("");

    // Lists
    const [projectsList, setProjectsList] = useState<Project[]>([]);
    const [tasksList, setTasksList] = useState<Task[]>([]);

    // UI State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [globalModal, setGlobalModal] = useState<GlobalModalConfig>({
        isOpen: false,
        title: "",
        message: "",
        type: "alert"
    });

    // Recharge
    const [rechargeAmount, setRechargeAmount] = useState("100");

    // Execution State
    const [dashView, setDashView] = useState<DashView>("dashboard");
    const [activeTaskId, setActiveTaskId] = useState<string>("");
    const [activeProject, setActiveProject] = useState<Project | null>(null);
    const [taskStatus, setTaskStatus] = useState<TaskStatus>("pending");
    const [taskLogs, setTaskLogs] = useState<string[]>([])
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [lastResultData, setLastResultData] = useState<string>("");

    useEffect(() => {
        const storedToken = getStoredToken();
        if (!storedToken) {
            return;
        }
        setToken(storedToken);
        loadMe(storedToken);
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [taskLogs]);

    // Load lists
    useEffect(() => {
        if (token) {
            if (dashView === 'projects' || dashView === 'dashboard') loadProjects();
            if (dashView === 'tasks') loadTasks();
            if (dashView === 'settings') {
                if (user) {
                    setLlmProvider(user.llmProvider || "TaskMaster");
                    setLlmModel(user.llmModel || "");
                    setLlmApiKey(user.llmApiKey || "");
                    setLlmBaseUrl(user.llmBaseUrl || "");
                }
            }
        }
    }, [dashView, token]);

    // Modal Helpers
    const showAlert = (title: string, message: string) => {
        setGlobalModal({ isOpen: true, title, message, type: "alert" });
    };

    const showConfirm = (title: string, message: string, onConfirm: () => void, confirmText = "确定", confirmColor = "bg-blue-600") => {
        setGlobalModal({ isOpen: true, title, message, type: "confirm", onConfirm, confirmText, confirmColor });
    };

    const closeModal = () => setGlobalModal(prev => ({ ...prev, isOpen: false }));

    async function loadProjects() {
        try {
            const data = await apiRequest("/api/v1/projects", {
                headers: { Authorization: "Bearer " + token },
            });
            setProjectsList(data as Project[]);
        } catch (e) { }
    }

    async function loadTasks() {
        setLoading(true);
        try {
            const data = await apiRequest("/api/v1/tasks", {
                headers: { Authorization: "Bearer " + token },
            });
            setTasksList(data as Task[]);
        } catch (e) { } finally {
            setLoading(false);
        }
    }

    async function loadMe(authToken: string) {
        setLoading(true);
        setError("");
        try {
            const data = (await apiRequest("/api/v1/auth/me", {
                headers: {
                    Authorization: "Bearer " + authToken,
                },
            })) as AuthResponseUser;
            setUser({
                id: data.id,
                email: data.email,
                balance: data.balance,
                llmProvider: data.llmProvider,
                llmModel: data.llmModel,
                llmApiKey: data.llmApiKey,
                llmBaseUrl: data.llmBaseUrl
            });
            setView("main");
        } catch (e: any) {
            clearStoredToken();
            setToken("");
            setUser(null);
            setView("login");
        } finally {
            setLoading(false);
        }
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            await apiRequest("/api/v1/auth/register", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            setView("login");
            showAlert("注册成功", "请使用您的邮箱和密码登录。");
        } catch (e: any) {
            setError("注册失败");
        } finally {
            setLoading(false);
        }
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const data = (await apiRequest("/api/v1/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            })) as AuthResponse;
            if (rememberMe) {
                setStoredToken(data.token);
            } else {
                clearStoredToken();
            }
            setToken(data.token);
            setUser({
                id: data.user.id,
                email: data.user.email,
                balance: data.user.balance,
                llmProvider: data.user.llmProvider,
                llmModel: data.user.llmModel,
                llmApiKey: data.user.llmApiKey,
                llmBaseUrl: data.user.llmBaseUrl
            });
            setView("main");
        } catch (e: any) {
            setError("登录失败");
        } finally {
            setLoading(false);
        }
    }

    async function handleRecharge(e: React.FormEvent) {
        e.preventDefault();
        if (!token || !user) return;
        setLoading(true);
        try {
            const amountValue = parseInt(rechargeAmount, 10);
            const data = (await apiRequest("/api/v1/credits/recharge", {
                method: "POST",
                body: JSON.stringify({ amount: amountValue, description: "desktop" }),
                headers: { Authorization: "Bearer " + token },
            })) as { balance: number };
            setUser({ ...user, balance: data.balance });
            setRechargeAmount("");
            showAlert("充值成功", `您的余额已更新为 ${data.balance} 积分。`);
        } catch (e: any) {
            showAlert("充值失败", "无法完成充值请求，请稍后重试。");
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmitProject(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const body = JSON.stringify({ name: projectName, url: projectUrl, prompt: projectPrompt, type: projectType, screenshot: projectScreenshot });
            if (isEditing && editProjectId) {
                await apiRequest(`/api/v1/projects/${editProjectId}`, {
                    method: "PUT",
                    body,
                    headers: { Authorization: "Bearer " + token },
                });
                showAlert("修改成功", "项目配置已更新。");
            } else {
                await apiRequest("/api/v1/projects", {
                    method: "POST",
                    body,
                    headers: { Authorization: "Bearer " + token },
                });
                showAlert("项目创建成功", "您现在可以启动该项目的自动化流程。");
            }
            setIsProjectModalOpen(false);
            setIsEditing(false);
            setEditProjectId(null);
            setProjectName("");
            setProjectUrl("");
            setProjectPrompt("");
            setProjectScreenshot(false);
            loadProjects();
        } catch (e) {
            showAlert("操作失败", "无法保存项目配置。");
        } finally {
            setLoading(false);
        }
    }

    function handleOpenCreateModal() {
        setIsEditing(false);
        setEditProjectId(null);
        setProjectName("");
        setProjectUrl("");
        setProjectPrompt("");
        setProjectType("workflow");
        setProjectScreenshot(false);
        setIsProjectModalOpen(true);
    }

    function handleOpenEditModal(p: Project) {
        setIsEditing(true);
        setEditProjectId(p.id);
        setProjectName(p.name);
        setProjectUrl(p.url);
        setProjectPrompt(p.prompt);
        setProjectType(p.type as any);
        setProjectScreenshot(p.screenshot);
        setIsProjectModalOpen(true);
    }

    async function handleDeleteProject(id: string) {
        showConfirm("确认删除项目", "删除项目将无法恢复，确定继续吗？", async () => {
            try {
                await apiRequest(`/api/v1/projects/${id}`, {
                    method: "DELETE",
                    headers: { Authorization: "Bearer " + token },
                });
                loadProjects();
                closeModal();
            } catch (e) {
                showAlert("删除失败", "无法删除该项目。");
            }
        }, "立即删除", "bg-red-600");
    }

    async function updateTaskStatus(taskId: string, status: string, result?: string) {
        try {
            await apiRequest(`/api/v1/tasks/${taskId}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status, result: result || "" }),
                headers: { Authorization: "Bearer " + token },
            });
        } catch (e) {
            console.error("Failed to sync task status to server", e);
        }
    }

    async function handleExecuteProject(project: Project) {
        if (!token || !user) return;
        setLoading(true);
        setTaskLogs([]);
        setTaskStatus("pending");
        setLastResultData("");
        setActiveProject(project);

        try {
            // Persistent refs to use in event handlers
            let finalStructuredResult = ""; // Stores the last detected structured JSON result
            let finalPlainTextResult = ""; // Stores all plain text output/logs

            // 1. Start execution on backend
            const data = (await apiRequest(`/api/v1/projects/${project.id}/execute`, {
                method: "POST",
                headers: { Authorization: "Bearer " + token },
            })) as { taskId: string; project: Project; message: string };

            // Refresh balance and latest config
            const me = (await apiRequest("/api/v1/auth/me", {
                headers: { Authorization: "Bearer " + token },
            })) as AuthResponseUser;
            setUser({
                id: me.id,
                email: me.email,
                balance: me.balance,
                llmProvider: me.llmProvider,
                llmModel: me.llmModel,
                llmApiKey: me.llmApiKey,
                llmBaseUrl: me.llmBaseUrl
            });

            // 2. Transition UI
            setActiveTaskId(data.taskId);
            setDashView("task_detail");
            setTaskStatus("running");
            setTaskLogs(logs => [...logs, `[System] 启动项目: ${project.name}`, `[System] 任务 ID: ${data.taskId}`, `[System] 正在启动引擎...`]);

            // 3. Resolve Effective Config using the latest user data from DB
            let provider = 'openai';
            let model = me.llmModel;
            let apiKey = me.llmApiKey || '';
            let baseURL = me.llmBaseUrl;

            if (me.llmProvider === 'TaskMaster') {
                try {
                    const systemConfig = await apiRequest("/api/v1/llm-config", {
                        headers: { Authorization: "Bearer " + token },
                    }) as any;
                    
                    if (systemConfig.llmModel) model = systemConfig.llmModel;
                    if (systemConfig.llmBaseUrl) baseURL = systemConfig.llmBaseUrl;
                    if (systemConfig.llmApiKey) apiKey = systemConfig.llmApiKey;
                } catch (e) {
                    console.error("Failed to fetch system config, using defaults", e);
                    model = 'google/gemini-2.0-flash-exp:free';
                    baseURL = 'https://openrouter.ai/api/v1';
                }
            } else {
                // Custom defaults if missing
                if (!model) model = 'gpt-4o';
                if (!baseURL) baseURL = 'https://api.openai.com/v1';
            }

            // 4. Spawn Sidecar
            const command = Command.sidecar("binaries/hyperagent");

            // Attach listeners
            console.log('[handleExecuteProject] Attaching sidecar event listeners...');
            
            command.on('close', async (d) => {
                console.log(`[handleExecuteProject] 'close' event fired with code: ${d.code}`);
                const finalStatus = d.code === 0 ? "completed" : "failed";
                setTaskLogs(logs => [...logs, `[System] 执行结束，退出码: ${d.code}`]);
                setTaskStatus(finalStatus);
                setLoading(false);

                // Decide which result to send/display
                const resultToSend = finalStructuredResult || finalPlainTextResult;
                console.log('[handleExecuteProject] Final result determined for sending:', resultToSend);

                // Parse stepsCount from sidecar result (attempt to use structured result if available)
                let stepsCount = 0;
                try {
                    const resultObj = JSON.parse(finalStructuredResult || finalPlainTextResult); // Try parsing structured first
                    stepsCount = resultObj.stepsCount || resultObj.data?.steps?.length || 0;
                } catch (e) { 
                    // This is expected to fail for non-JSON results, which is fine.
                }
                
                const payload = { status: finalStatus, result: resultToSend, stepsCount };
                console.log('[handleExecuteProject] Calling completeTask API with payload:', payload);

                // Call complete API to deduct balance
                try {
                    const completeRes = await apiRequest(`/api/v1/tasks/${data.taskId}/complete`, {
                        method: "POST",
                        body: JSON.stringify(payload),
                        headers: { Authorization: "Bearer " + token },
                    }) as { cost: number; balance: number };
                    setTaskLogs(logs => [...logs, `[System] 费用: ${completeRes.cost} credits, 余额: ${completeRes.balance}`]);
                    if (user) setUser({ ...user, balance: completeRes.balance });
                    console.log('[handleExecuteProject] completeTask API call successful.');
                } catch (e) {
                    console.error("[handleExecuteProject] Failed to call completeTask API", e);
                    // Fallback to update status if complete fails
                    updateTaskStatus(data.taskId, finalStatus, resultToSend);
                }
            });

            command.on('error', err => {
                console.error(`[handleExecuteProject] 'error' event fired:`, err);
                setTaskLogs(logs => [...logs, `[System] 错误: ${err}`]);
                setTaskStatus("failed");
                setLoading(false);
                // Also send the final captured result/logs to backend
                const resultToSend = finalStructuredResult || finalPlainTextResult;
                updateTaskStatus(data.taskId, "failed", resultToSend);
            });

            let stdoutAttached = false;
            command.stdout.on('data', line => {
                if (!stdoutAttached) {
                    console.log('[handleExecuteProject] Sidecar stdout handler receiving data.');
                    stdoutAttached = true;
                }
                // Attempt to parse as JSON. If it's structured, prioritize it.
                try {
                    const parsed = JSON.parse(line);
                    // Heuristic: check if it looks like a structured result (e.g., has 'output' or 'steps' or 'message' and 'type')
                    if (parsed && (parsed.output !== undefined || parsed.steps !== undefined || (parsed.message !== undefined && parsed.type !== undefined))) {
                        finalStructuredResult = line; // Overwrite, assume this is the latest and most relevant structured result
                        setLastResultData(line); // Immediately show this formatted result in UI
                    } else {
                        // Not a structured JSON result, treat as plain log
                        finalPlainTextResult += line + "\n";
                    }
                } catch (e) {
                    // Not JSON, append to plain text
                    finalPlainTextResult += line + "\n";
                }
                setTaskLogs(logs => [...logs, `[OUT] ${line}`]);
            });

            let stderrAttached = false;
            command.stderr.on('data', line => {
                if (!stderrAttached) {
                    console.log('[handleExecuteProject] Sidecar stderr handler receiving data.');
                    stderrAttached = true;
                }
                // For stderr, just accumulate as plain text/logs
                finalPlainTextResult += line + "\n";
                setTaskLogs(logs => [...logs, `[LOG] ${line}`]);
            });
            
            console.log('[handleExecuteProject] Spawning sidecar...');
            const child = await command.spawn();
            console.log('[handleExecuteProject] Sidecar process spawned with PID:', child.pid);
            const payload = {
                taskId: data.taskId,
                type: project.type,
                prompt: project.prompt,
                url: project.url,
                screenshot: project.screenshot,
                llm: {
                    provider,
                    model,
                    apiKey,
                    baseURL
                }
            };
            await child.write(JSON.stringify(payload) + "\n");
            setTaskLogs(logs => [...logs, `[System] 指令已下发，执行模型: ${model}`]);
        } catch (e: any) {
            console.error('[handleExecuteProject] Error during task setup:', e);
            showAlert("任务启动失败", e.message || "无法连接到执行引擎。");
            setLoading(false);
        }
    }

    async function handleDeleteTask(taskId: string) {
        showConfirm("确认删除记录", "删除任务执行历史记录，确定继续吗？", async () => {
            try {
                await apiRequest(`/api/v1/tasks/${taskId}`, {
                    method: "DELETE",
                    headers: { Authorization: "Bearer " + token },
                });
                loadTasks();
                closeModal();
            } catch (e) {
                showAlert("删除失败", "无法删除该记录。");
            }
        }, "确认删除", "bg-red-600");
    }

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            showAlert("错误", "两次输入的新密码不一致。");
            return;
        }
        setLoading(true);
        try {
            await apiRequest("/api/v1/users/change-password", {
                method: "POST",
                body: JSON.stringify({ oldPassword, newPassword }),
                headers: { Authorization: "Bearer " + token },
            });
            setOldPassword("");
            setNewPassword("");
            setConfirmPassword("");
            showAlert("修改成功", "您的密码已成功更新。");
        } catch (e: any) {
            showAlert("修改失败", e.data?.error === "invalid_old_password" ? "旧密码错误。" : "无法更新密码。");
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdateSettings(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                llmProvider,
                llmModel: llmProvider === 'TaskMaster' ? 'auto' : llmModel,
                llmApiKey: llmProvider === 'TaskMaster' ? '' : llmApiKey,
                llmBaseUrl: llmProvider === 'TaskMaster' ? '' : llmBaseUrl
            };
            await apiRequest("/api/v1/users/settings", {
                method: "PATCH",
                body: JSON.stringify(payload),
                headers: { Authorization: "Bearer " + token },
            });

            // Refresh user data from server to sync the hidden fields too
            await loadMe(token);

            showAlert("保存成功", "您的 AI 模型配置已更新。");
        } catch (e) {
            showAlert("保存失败", "无法更新设置。");
        } finally {
            setLoading(false);
        }
    }

    function handleLogout() {
        clearStoredToken();
        setToken("");
        setUser(null);
        setView("login");
        setDashView("dashboard");
        setIsMobileMenuOpen(false);
    }

    const getPageTitle = () => {
        switch (dashView) {
            case 'dashboard': return '仪表盘';
            case 'task_detail': return '执行详情';
            case 'projects': return '项目管理';
            case 'tasks': return '任务历史';
            case 'teams': return '团队协作';
            case 'settings': return '系统设置';
            case 'materials': return '素材中心';
            default: return '任务大师';
        }
    };

    const SidebarContent = () => (
        <>
            <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
                <div className="size-8 rounded bg-gradient-primary flex items-center justify-center text-white shadow-md shadow-blue-600/20">
                    <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>check_circle</span>
                </div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-700 to-purple-700 dark:from-blue-500 dark:to-purple-500 bg-clip-text text-transparent">任务大师</h1>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 py-6">
                <ul className="flex flex-col gap-2">
                    <li><button onClick={() => { setDashView('dashboard'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'dashboard' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">dashboard</span><span className="text-sm font-medium">仪表盘</span></button></li>
                    <li><button onClick={() => { setDashView('projects'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'projects' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">view_kanban</span><span className="text-sm font-medium">项目管理</span></button></li>
                    <li><button onClick={() => { setDashView('tasks'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'tasks' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">history</span><span className="text-sm font-medium">任务历史</span></button></li>
                    <li><button onClick={() => { setDashView('materials'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'materials' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">topic</span><span className="text-sm font-medium">素材中心</span></button></li>
                    <li><button onClick={() => { setDashView('teams'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'teams' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">group</span><span className="text-sm font-medium">团队协作</span></button></li>
                    <li><button onClick={() => { setDashView('settings'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors group text-left ${dashView === 'settings' ? 'bg-gradient-primary shadow-lg shadow-purple-600/20 text-white' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className={`material-symbols-outlined ${dashView === 'settings' ? 'fill' : 'group-hover:text-accent-blue'}`}>settings</span><span className="text-sm font-medium">设置</span></button></li>
                </ul>
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg p-2 text-slate-500 hover:text-red-500 transition-colors"><span className="material-symbols-outlined">logout</span><span className="text-sm font-medium">退出登录</span></button>
            </div>
        </>
    );

    if (view === "login" || view === "register") {
        const isLogin = view === "login";
        return (
            <div className="flex min-h-screen items-center justify-center bg-background-light dark:bg-background-dark p-4">
                <div className="w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark p-8 shadow-lg border border-slate-200 dark:border-slate-800">
                    <div className="mb-6 flex items-center justify-center gap-3">
                        <div className="size-10 rounded bg-gradient-primary flex items-center justify-center text-white shadow-md shadow-blue-600/20">
                            <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>check_circle</span>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-700 to-purple-700 dark:from-blue-500 dark:to-purple-500 bg-clip-text text-transparent">任务大师</h1>
                    </div>
                    <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-white text-center">{isLogin ? "欢迎回来" : "创建账户"}</h2>
                    {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-500 dark:bg-red-900/20 dark:text-red-400">{error}</div>}
                    <form onSubmit={isLogin ? handleLogin : handleRegister} className="flex flex-col gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">邮箱</label>
                            <input type="email" className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 focus:ring-accent-blue dark:border-slate-700 dark:bg-slate-800 dark:text-white" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">密码</label>
                            <input type="password" className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 focus:ring-accent-blue dark:border-slate-700 dark:bg-slate-800 dark:text-white" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                        {isLogin && (
                            <div className="flex items-center">
                                <input id="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900 dark:text-slate-300 select-none cursor-pointer">自动登录</label>
                            </div>
                        )}
                        <button type="submit" disabled={loading} className="mt-2 w-full rounded-lg bg-gradient-primary px-5 py-2.5 text-center text-sm font-medium text-white hover:shadow-purple-600/40">{loading ? "处理中..." : (isLogin ? "登录" : "注册")}</button>
                    </form>
                    <div className="mt-6 text-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{isLogin ? "还没有账号？" : "已有账号？"}</span>
                        <button onClick={() => setView(isLogin ? "register" : "login")} className="font-medium text-accent-blue hover:underline dark:text-blue-500 ml-1">{isLogin ? "注册" : "登录"}</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-display">
            {/* Desktop Sidebar */}
            <aside className="hidden w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-background-dark lg:flex">
                <SidebarContent />
            </aside>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden flex">
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsMobileMenuOpen(false)}></div>
                    <aside className="relative w-64 h-full bg-surface-light dark:bg-background-dark shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
                        <div className="absolute top-4 right-4 lg:hidden">
                            <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 text-slate-500"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <SidebarContent />
                    </aside>
                </div>
            )}

            <main className="flex flex-1 flex-col overflow-hidden relative">
                <header className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-background-dark px-6 lg:px-10 z-10">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="p-1 -ml-1 mr-2 rounded-md lg:hidden text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors">
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        {dashView !== 'dashboard' && <button onClick={() => setDashView('dashboard')} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"><span className="material-symbols-outlined">arrow_back</span></button>}
                        <span className="text-lg font-bold text-slate-900 dark:text-white">{getPageTitle()}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">{user?.email}</span>
                            <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">{user?.email.substring(0, 2).toUpperCase()}</div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth bg-slate-50 dark:bg-[#0b1120]">
                    {dashView === 'dashboard' && (
                        <div className="mx-auto max-w-7xl flex flex-col gap-8">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 transition-all hover:border-accent-blue/30">
                                        <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">总余额</p><span className="material-symbols-outlined text-accent-blue">account_balance_wallet</span></div>
                                        <p className="text-3xl font-bold mb-4">{user?.balance}</p>
                                        <form onSubmit={handleRecharge} className="flex flex-wrap items-center gap-3">
                                            <input type="number" className="grow-[100] basis-[100px] rounded-lg border p-2 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} placeholder="金额" />
                                            <button type="submit" disabled={loading} className="grow basis-auto bg-gradient-primary text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">充值</button>
                                        </form>
                                    </div>
                                    <div className="rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 transition-all hover:border-accent-blue/30">
                                        <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">已定义项目</p><span className="material-symbols-outlined text-purple-500">task_alt</span></div>
                                        <p className="text-3xl font-bold">{projectsList.length}</p>
                                        <p className="text-sm text-slate-500">当前已定义工作流</p>
                                    </div>
                                </div>
                                <div className="lg:col-span-1">
                                    <button onClick={handleOpenCreateModal} className="w-full h-full min-h-[160px] rounded-xl bg-surface-light dark:bg-surface-dark border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-3 hover:border-accent-blue transition-all group">
                                        <div className="size-12 rounded-full bg-gradient-primary flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform"><span className="material-symbols-outlined" style={{ fontSize: "28px" }}>add</span></div>
                                        <span className="text-lg font-bold text-slate-700 dark:text-slate-300 group-hover:text-accent-blue">新建项目</span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4">
                                <h3 className="text-xl font-bold flex items-center gap-2"><span className="material-symbols-outlined text-accent-blue">quick_reference</span>最近项目</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {projectsList.slice(0, 6).map(p => (
                                        <div key={p.id} className="rounded-xl bg-surface-light p-5 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
                                            <div className="flex justify-between items-start">
                                                <h4 className="font-bold text-slate-900 dark:text-white truncate">{p.name}</h4>
                                                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500">{p.type}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 line-clamp-2 h-8">{p.prompt}</p>
                                            <div className="flex gap-2 mt-2">
                                                <button onClick={() => handleExecuteProject(p)} className="flex-1 bg-blue-50 dark:bg-blue-900/20 text-accent-blue px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">执行</button>
                                                <button onClick={() => { handleOpenEditModal(p); setDashView('projects'); }} className="px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors">管理</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {dashView === 'projects' && (
                        <div className="mx-auto max-w-7xl flex flex-col gap-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold">项目列表</h3>
                                <button onClick={handleOpenCreateModal} className="bg-gradient-primary text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>add</span>新建项目</button>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {projectsList.length === 0 ? <div className="text-center py-20 text-slate-500 bg-surface-light dark:bg-surface-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">尚未创建项目</div> : projectsList.map(p => (
                                    <div key={p.id} className="rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1"><h4 className="text-lg font-bold text-slate-900 dark:text-white">{p.name}</h4><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.type === 'workflow' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{p.type}</span></div>
                                            <p className="text-sm text-slate-500 line-clamp-1">{p.url || '无起始 URL'} | {p.prompt}</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => handleExecuteProject(p)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>play_arrow</span>启动</button>
                                            <button onClick={() => handleOpenEditModal(p)} className="p-2 rounded-lg text-slate-400 hover:text-accent-blue hover:bg-blue-50 dark:hover:bg-red-900/20 transition-colors"><span className="material-symbols-outlined">edit</span></button>
                                            <button onClick={() => handleDeleteProject(p.id)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><span className="material-symbols-outlined">delete</span></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {dashView === 'task_detail' && (
                        <div className="mx-auto max-w-7xl h-full flex flex-col gap-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-accent-blue">info</span>任务信息</h3>
                                    <div className="flex flex-col gap-4 text-sm">
                                        <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400">所属项目</span><span className="font-bold text-slate-900 dark:text-white">{activeProject?.name}</span></div>
                                        <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400">任务 ID</span><span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 p-1.5 rounded text-slate-900 dark:text-white">{activeTaskId}</span></div>
                                        <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400">任务指令</span><p className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 whitespace-pre-wrap text-slate-900 dark:text-white">{activeProject?.prompt}</p></div>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 flex flex-col">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold flex items-center gap-2"><span className="material-symbols-outlined text-orange-500">pending_actions</span>执行状态</h3>
                                        {taskStatus !== 'running' && activeProject && (
                                            <button
                                                onClick={() => handleExecuteProject(activeProject)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors text-xs font-medium"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>play_arrow</span>
                                                再次执行
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex-1 flex items-center justify-center flex-col gap-3">
                                        {taskStatus === 'running' && <><div className="size-12 rounded-full border-4 border-slate-200 border-t-accent-blue animate-spin"></div><p className="text-slate-500">任务正在执行中...</p></>}
                                        {taskStatus === 'completed' && <><div className="size-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center"><span className="material-symbols-outlined" style={{ fontSize: "32px" }}>check</span></div><p className="text-green-600 font-bold">任务执行完成</p></>}
                                        {taskStatus === 'failed' && <><div className="size-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center"><span className="material-symbols-outlined" style={{ fontSize: "32px" }}>error</span></div><p className="text-red-600 font-bold">任务执行失败</p></>}
                                    </div>
                                </div>
                            </div>
                            {/* Result Section */}
                            {lastResultData && (
                                <div className="rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
                                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-500">verified_user</span>
                                        执行结果
                                    </h3>
                                    <HyperAgentResultDisplay data={(() => {
                                        try {
                                            return JSON.parse(lastResultData);
                                        } catch (e) {
                                            return { output: lastResultData };
                                        }
                                    })()} />
                                </div>
                            )}
                            <div className="flex-1 rounded-xl bg-[#1e1e1e] shadow-sm border border-slate-800 flex flex-col overflow-hidden min-h-[300px]">
                                <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333]"><div className="flex items-center gap-2 text-slate-300 text-xs font-medium uppercase tracking-wider"><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>terminal</span>实时日志</div><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${taskStatus === 'running' ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></span><span className="text-xs text-slate-400">{taskStatus === 'running' ? 'Live' : 'Stopped'}</span></div></div>
                                <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-slate-300 leading-relaxed scroll-smooth">{taskLogs.length === 0 && <span className="text-slate-500 italic">Waiting for logs...</span>}{taskLogs.map((log, i) => (<div key={i} className="mb-1 break-words whitespace-pre-wrap">{log}</div>))}<div ref={logsEndRef} /></div>
                            </div>
                        </div>
                    )}

                    {dashView === 'tasks' && (
                        <div className="mx-auto max-w-7xl flex flex-col gap-6">
                            <div className="flex justify-end"><button onClick={loadTasks} className="flex items-center gap-2 rounded-lg bg-surface-light px-3 py-2 text-sm font-medium border border-slate-200 dark:border-slate-800 dark:bg-surface-dark transition-colors hover:bg-slate-50 text-slate-900 dark:text-white"><span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`} style={{ fontSize: "20px" }}>refresh</span>刷新</button></div>
                            <div className="rounded-xl bg-surface-light shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <table className="w-full text-left text-sm text-slate-500">
                                    <thead className="bg-slate-50 text-xs uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-400"><tr><th className="px-6 py-3">类型</th><th className="px-6 py-3">Prompt</th><th className="px-6 py-3">状态</th><th className="px-6 py-3">消耗</th><th className="px-6 py-3">创建时间</th><th className="px-6 py-3 text-right">操作</th></tr></thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                        {tasksList.map((task) => (
                                            <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-4"><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${task.type === 'workflow' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{task.type === 'workflow' ? '工作流' : '抓取'}</span></td>
                                                <td className="px-6 py-4 max-w-xs truncate text-slate-900 dark:text-white" title={task.prompt}>{task.prompt}</td>
                                                <td className="px-6 py-4">
                                                    {task.status === 'running' && <span className="text-blue-600 flex items-center gap-1"><span className="size-1.5 rounded-full bg-blue-500 animate-pulse"></span>运行中</span>}
                                                    {task.status === 'completed' && <span className="text-green-600 flex items-center gap-1">完成</span>}
                                                    {task.status === 'failed' && <span className="text-red-600 flex items-center gap-1">失败</span>}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{Math.abs(task.cost)}</td>
                                                <td className="px-6 py-4 text-xs text-slate-500">{new Date(task.createdAt).toLocaleString()}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {task.result && (
                                                            <button onClick={() => {
                                                                const project = projectsList.find(p => p.id === task.projectId);
                                                                if (project) setActiveProject(project);
                                                                setActiveTaskId(task.id);
                                                                setTaskStatus(task.status as TaskStatus);
                                                                setLastResultData(task.result);
                                                                setDashView('task_detail');
                                                            }} className="p-1.5 rounded-md text-slate-400 hover:text-emerald-500" title="查看结果"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>description</span></button>
                                                        )}
                                                        <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 rounded-md text-slate-400 hover:text-red-500 transition-colors" title="删除记录"><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>delete</span></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {dashView === 'settings' && (
                        <div className="mx-auto max-w-4xl flex flex-col gap-8">
                            {/* Account Settings */}
                            <div className="rounded-2xl bg-surface-light p-8 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
                                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-accent-blue">lock</span>
                                    修改密码
                                </h3>
                                <form onSubmit={handleChangePassword} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2">
                                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">当前密码</label>
                                        <input
                                            type="password"
                                            className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-blue/20"
                                            value={oldPassword}
                                            onChange={(e) => setOldPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">新密码</label>
                                        <input
                                            type="password"
                                            className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-blue/20"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">确认新密码</label>
                                        <input
                                            type="password"
                                            className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-blue/20"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="md:col-span-2 flex justify-end">
                                        <button type="submit" disabled={loading} className="bg-gradient-primary text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:scale-[1.02] transition-transform">保存新密码</button>
                                    </div>
                                </form>
                            </div>

                            {/* AI Settings */}
                            <div className="rounded-2xl bg-surface-light p-8 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
                                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-purple-500">smart_toy</span>
                                    AI 模型配置
                                </h3>
                                <form onSubmit={handleUpdateSettings} className="flex flex-col gap-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="md:col-span-2">
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">模型服务商</label>
                                            <select
                                                className="custom-select w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-blue/20"
                                                value={llmProvider}
                                                onChange={(e) => setLlmProvider(e.target.value)}
                                            >
                                                <option value="TaskMaster">TaskMaster (强烈推荐)</option>
                                                <option value="custom">自定义 (OpenAI 兼容)</option>
                                            </select>
                                        </div>

                                        {llmProvider !== 'TaskMaster' && (
                                            <>
                                                <div className="md:col-span-2">
                                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Base URL</label>
                                                    <input
                                                        type="text"
                                                        className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-blue/20"
                                                        placeholder="https://api.openai.com/v1"
                                                        value={llmBaseUrl}
                                                        onChange={(e) => setLlmBaseUrl(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                                                    <input
                                                        type="password"
                                                        className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-blue/20"
                                                        placeholder="sk-..."
                                                        value={llmApiKey}
                                                        onChange={(e) => setLlmApiKey(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">模型 ID</label>
                                                    <input
                                                        type="text"
                                                        className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-blue/20"
                                                        placeholder="gpt-4o"
                                                        value={llmModel}
                                                        onChange={(e) => setLlmModel(e.target.value)}
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {llmProvider === 'TaskMaster' && (
                                            <div className="md:col-span-2">
                                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">指定模型</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-xl border border-slate-300 bg-slate-200 p-3 text-sm dark:bg-slate-700 dark:border-slate-600 text-slate-500 dark:text-slate-400 focus:outline-none cursor-not-allowed"
                                                    value="auto (由系统自动选择最佳模型)"
                                                    readOnly
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-end">
                                        <button type="submit" disabled={loading} className="bg-gradient-primary text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:scale-[1.02] transition-transform">保存配置</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {dashView === 'teams' && (
                        <div className="mx-auto max-w-7xl flex flex-col items-center justify-center min-h-[400px] gap-4">
                            <div className="size-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400"><span className="material-symbols-outlined" style={{ fontSize: "48px" }}>group</span></div>
                            <h2 className="text-2xl font-bold">{getPageTitle()}</h2>
                            <p className="text-slate-500 text-center max-w-md">此模块正在开发中，敬请期待。</p>
                            <button onClick={() => setDashView('dashboard')} className="mt-4 rounded-lg bg-slate-200 dark:bg-slate-800 px-6 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">返回仪表盘</button>
                        </div>
                    )}
                    {dashView === 'materials' && (
                        <MaterialCenter projectsList={projectsList} />
                    )}
                </div>
            </main>

            {/* Project Modal */}
            {isProjectModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="mb-6 flex items-center justify-between"><h3 className="text-xl font-bold text-slate-900 dark:text-white">{isEditing ? "修改自动化项目" : "新建自动化项目"}</h3><button onClick={() => setIsProjectModalOpen(false)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><span className="material-symbols-outlined">close</span></button></div>
                        <form onSubmit={handleSubmitProject} className="flex flex-col gap-4">
                            <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">项目名称</label><input type="text" className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" placeholder="例如：每日竞品抓取" value={projectName} onChange={(e) => setProjectName(e.target.value)} required /></div>
                            <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">任务类型</label><div className="flex gap-4"><button type="button" onClick={() => setProjectType('workflow')} className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${projectType === 'workflow' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                            ><span className="text-sm font-bold text-slate-900 dark:text-white">自动工作流</span><span className="text-[10px] text-slate-500">执行复杂交互自动化</span></button><button type="button" onClick={() => setProjectType('scrape')} className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${projectType === 'scrape' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                            ><span className="text-sm font-bold text-slate-900 dark:text-white">网页抓取</span><span className="text-[10px] text-slate-500">提取结构化数据</span></button></div></div>
                            <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">起始 URL</label><input type="url" className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" placeholder="https://..." value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} /></div>
                            <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">AI 提示词 (Prompt)</label><textarea className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" rows={4} placeholder="描述需要自动完成的操作步骤..." value={projectPrompt} onChange={(e) => setProjectPrompt(e.target.value)} required /></div>
                            <div className="flex items-center">
                                <input id="screenshot-checkbox" type="checkbox" checked={projectScreenshot} onChange={(e) => setProjectScreenshot(e.target.checked)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" />
                                <label htmlFor="screenshot-checkbox" className="ml-2 block text-sm text-slate-900 dark:text-slate-300 select-none cursor-pointer">任务结束后截图</label>
                            </div>
                            <div className="mt-4 flex justify-end gap-3"><button type="button" onClick={() => setIsProjectModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-500">取消</button><button type="submit" disabled={loading} className="bg-gradient-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg">{loading ? "处理中..." : (isEditing ? "保存修改" : "保存项目")}</button></div>
                        </form>
                    </div>
                </div>
            )}

            {/* Global Alert/Confirm Modal */}
            {globalModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-sm:max-w-xs max-w-sm rounded-2xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className={`size-12 rounded-full flex items-center justify-center ${globalModal.type === 'confirm' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>
                                    {globalModal.type === 'confirm' ? 'help' : 'info'}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{globalModal.title}</h3>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{globalModal.message}</p>
                            </div>
                            <div className="mt-2 flex w-full gap-3">
                                {globalModal.type === 'confirm' && (
                                    <button
                                        onClick={closeModal}
                                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        取消
                                    </button>
                                )}
                                <button
                                    onClick={globalModal.type === 'confirm' ? globalModal.onConfirm : closeModal}
                                    className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-lg transition-all active:scale-95 ${globalModal.type === 'confirm' ? globalModal.confirmColor : 'bg-blue-600'}`}
                                >
                                    {globalModal.type === 'confirm' ? globalModal.confirmText : "好的"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;