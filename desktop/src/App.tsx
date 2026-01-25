import { useEffect, useState, useRef } from "react";
import { apiRequest, clearStoredToken, getStoredToken, setStoredToken } from "./api";
import { Command } from "@tauri-apps/plugin-shell";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import MaterialCenter from "./MaterialCenter";
import AgentStudio from "./pages/AgentStudio";
import CodingMasterDashboard from "./CodingMasterDashboard";
import CodingProjectWorkspace from "./components/CodingProjectWorkspace";
import * as opencode from "./opencodeService";

type View = "login" | "register" | "main";
type DashView = "dashboard" | "projects" | "tasks" | "teams" | "settings" | "materials" | "task_detail" | "agent_studio" | "mission_control" | "project_detail";
type TaskStatus = "pending" | "running" | "completed" | "failed" | "ai_rewriting";

interface User {
    id: string;
    email: string;
    balance: number;
    organizationId?: string;
    role: string;
    isBlacklisted: boolean;
    llmProvider: string;
    llmModel: string;
    llmApiKey: string;
    llmBaseUrl: string;
}

interface Organization {
    id: string;
    name: string;
    balance: number;
    billingAdminId?: string;
    createdAt: string;
    updatedAt: string;
}

interface OrgMember {
    id: string;
    email: string;
    organizationId?: string;
    role: string;
    balance: number;
    isBlacklisted: boolean;
}

interface OrgBlacklistEntry {
    id: string;
    organizationId: string;
    userId: string;
    blockedBy: string;
    reason: string;
    createdAt: string;
}

interface Project {
    id: string;
    name: string;
    url: string;
    prompt: string;
    type: string;
    screenshot: boolean;
    platform?: string;
    useAIRewrite?: boolean;
}

interface Task {
    id: string;
    projectId: string;
    type: string;
    prompt: string;
    status: string;
    cost: number;
    createdAt: string;
    result?: string;
}

interface AuthResponseUser {
    id: string;
    email: string;
    balance: number;
    organizationId?: string;
    role: string;
    isBlacklisted: boolean;
    llmProvider: string;
    llmModel: string;
    llmApiKey: string;
    llmBaseUrl: string;
}

interface AuthResponse {
    token: string;
    user: AuthResponseUser;
}

interface GlobalModalConfig {
    isOpen: boolean;
    title: string;
    message: string;
    type: "alert" | "confirm";
    onConfirm?: () => void;
    confirmText?: string;
    confirmColor?: string;
}

// Project Type Configuration
const PROJECT_TYPE_CONFIG: Record<string, { label: string; color: string; darkColor: string; icon: string }> = {
    coding_master: { label: 'Coding全能大师', color: 'bg-orange-100 text-orange-700', darkColor: 'dark:bg-orange-900/30 dark:text-orange-300', icon: 'code' },
    workflow: { label: '自动工作流', color: 'bg-purple-100 text-purple-700', darkColor: 'dark:bg-purple-900/30 dark:text-purple-300', icon: 'bolt' },
    local_workflow: { label: '本地工作流', color: 'bg-green-100 text-green-700', darkColor: 'dark:bg-green-900/30 dark:text-green-300', icon: 'terminal' },
    scrape: { label: '抓取', color: 'bg-blue-100 text-blue-700', darkColor: 'dark:bg-blue-900/30 dark:text-blue-300', icon: 'download' },
};

// Project type order for grouped display
const PROJECT_TYPE_ORDER = ['coding_master', 'workflow', 'local_workflow', 'scrape'];

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

    // Theme State
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined" && localStorage.getItem("theme")) {
            return localStorage.getItem("theme") as "light" | "dark";
        }
        if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            return "dark";
        }
        return "light";
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
        localStorage.setItem("theme", theme);
    }, [theme]);

    function toggleTheme() {
        setTheme(prev => prev === "dark" ? "light" : "dark");
    }
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
    const [prdFilePath, setPrdFilePath] = useState("");
    const [projectType, setProjectType] = useState<"workflow" | "scrape" | "local_workflow" | "coding_master">("workflow");
    const [projectScreenshot, setProjectScreenshot] = useState(false);
    const [projectPlatform, setProjectPlatform] = useState("xiaohongshu");
    const [useAIRewrite, setUseAIRewrite] = useState(false);
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

    // Coding Settings
    const [opencodeProvider, setOpencodeProvider] = useState("anthropic");
    const [opencodeModel, setOpencodeModel] = useState("anthropic/claude-3-5-sonnet-20241022");
    const [opencodeSmallModel, setOpencodeSmallModel] = useState("anthropic/claude-3-haiku-20240307");
    const [opencodeApiKey, setOpencodeApiKey] = useState("");

    const [ralphProvider, setRalphProvider] = useState("anthropic");
    const [ralphModel, setRalphModel] = useState("claude-3-5-sonnet-20241022");
    const [ralphApiKey, setRalphApiKey] = useState("");

    // Lists
    const [projectsList, setProjectsList] = useState<Project[]>([]);
    const [tasksList, setTasksList] = useState<Task[]>([]);
    const [projectTaskStatuses, setProjectTaskStatuses] = useState<Record<string, { status: string; progress: number; message: string }>>({});

    // Organization State
    const [, setOrganizations] = useState<Organization[]>([]);
    const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
    const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
    const [orgBlacklist, setOrgBlacklist] = useState<OrgBlacklistEntry[]>([]);
    const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
    const [newOrgName, setNewOrgName] = useState("");
    const [inviteEmail, setInviteEmail] = useState("");
    const [orgLoading, setOrgLoading] = useState(false);

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
    const [taskLogs, setTaskLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [lastResultData, setLastResultData] = useState<string>("");
    const [executionCost, setExecutionCost] = useState(0);

    // AI Workflow Dialog State
    const [isAIWorkflowDialogOpen, setIsAIWorkflowDialogOpen] = useState(false);
    const [aiWorkflowProject, setAIWorkflowProject] = useState<Project | null>(null);
    const [aiDialogMessages, setAIDialogMessages] = useState<{ role: 'user' | 'assistant' | 'system'; content: string }[]>([]);
    const [aiDialogLoading, setAIDialogLoading] = useState(false);
    const [aiUserInput, setAIUserInput] = useState("");
    const [aiWorkflowSteps, setAIWorkflowSteps] = useState<any[]>([]);
    const [aiGeneratedPrompt, setAIGeneratedPrompt] = useState<string>("");
    const [aiWorkflowLogs, setAIWorkflowLogs] = useState<string[]>([]);
    const [aiWorkflowExecuting, setAIWorkflowExecuting] = useState(false);
    const [aiHasStructuredSteps, setAIHasStructuredSteps] = useState(false);

    // Publish Dialog State
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
    const [publishDialogProject, setPublishDialogProject] = useState<Project | null>(null);
    const [publishMode, setPublishMode] = useState<'select' | 'random'>('select');
    const [publishMaterials, setPublishMaterials] = useState<any[]>([]);
    const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
    const [randomPublishCount, setRandomPublishCount] = useState(1);
    const [publishLoading, setPublishLoading] = useState(false);

    // Opencode Execution State
    const [opcodeEventSource, setOpencodeEventSource] = useState<EventSource | null>(null);
    const [localWorkflowPath, setLocalWorkflowPath] = useState(() => localStorage.getItem("local_workflow_path") || "");


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
            if (dashView === 'teams') loadOrganizations();
            if (dashView === 'settings') {
                if (user) {
                    setLlmProvider(user.llmProvider || "TaskMaster");
                    setLlmModel(user.llmModel || "");
                    setLlmApiKey(user.llmApiKey || "");
                    setLlmBaseUrl(user.llmBaseUrl || "");
                }

                // Load OpenCode Config
                invoke('get_opencode_config').then((config: any) => {
                    if (config) {
                        // We need to parse the flexible provider structure to find the active keys
                        // ideally we store the "active" provider name in config or just default to what we have in state if not found.
                        // But wait, the config structure on rust side has 'provider' as Option<Value>.
                        // We need to decode it.

                        if (config.model) setOpencodeModel(config.model);
                        if (config.small_model) setOpencodeSmallModel(config.small_model);

                        if (config.expert_model) {
                            if (config.expert_model.provider) setRalphProvider(config.expert_model.provider);
                            if (config.expert_model.model) setRalphModel(config.expert_model.model);
                        }

                        // Try to extract API keys from provider map
                        // structure is { [providerName]: { api_key: "..." } }
                        if (config.provider) {
                            // We don't have a field for "current active provider" in the config struct on Rust side explicitly for opencode 
                            // (it just says provider: Option<Value>).
                            // But usually we might want to store which one is selected? 
                            // Actually, looking at previous update_opencode_config in App.tsx:
                            // provider: { [opencodeProvider]: { ... } }
                            // It saves the map. It doesn't explicitly save "active_provider" for Opencode.
                            // We might just have to infer or keep the default "anthropic" if strictly not saved.
                            // OR, we can check which keys exist in the map.

                            // Let's iterate keys of config.provider to see if we can find our current one or any one.
                            // Since we have separate state for opencodeProvider, maybe we should persist that too?
                            // For now, let's just try to load the key for the *currently selected* provider in state (default anthropic)
                            // OR if we want to restore the selection, we need to save it.
                            // The Rust struct `OpenCodeConfig` has `provider: Option<serde_json::Value>`.
                            // It seems we missed adding an `active_provider` field if we want to restore selection.
                            // However, we can live with defaulting to Anthropic for now, but loading the key if available.

                            // Let's try to load keys for the defaults or if we find them.
                            // Actually, let's check if we can see which provider is "active" by checking the struct we sent.
                            // We sent: provider: { [opencodeProvider]: ... }
                            // This effectively just adds to the map.

                            // Allow me to check if I can infer it. 
                            // If I use the same logic as "expert_model" which I added, that one has `provider` field.
                            // standard model doesn't have an explicit `active_provider` field in the rust struct I defined (unless I add it).
                            // But wait, `expert_model` was added as a Value, so it can have anything.

                            // Let's just try to load API keys for the current selection if it exists in the map.
                            const pMap = config.provider;
                            // Check for Opencode Provider Key
                            // implicit issue: we don't know which provider WAS selected for opencode.
                            // IF the map has only one key, we could assume that.
                            // Let's assume user likely uses Anthropic.

                            if (pMap.anthropic?.api_key) {
                                // If we find a key for anthropic, and we are on anthropic, set it.
                                // Or maybe just pre-fill all known keys? 
                                // We only have one state `opencodeApiKey` which is bound to the input.
                                // When user changes provider, we wipe/change the key? 
                                // The current UI just has one state `opencodeApiKey`. 
                                // If user switches to OpenAI, this state persists unless we clear it.
                                // Be better to store a map of keys in memory.
                                // Refactoring to a map is safer but more complex change.
                                // For now, let's just load the key for the generic 'anthropic' or whatever is in default state.
                            }

                            // A simple hack: check if we have a key for the current default 'anthropic'.
                            // If yes, load it.
                            if (pMap['anthropic']?.api_key) {
                                setOpencodeApiKey(pMap['anthropic'].api_key);
                            }
                            // Logic for others? 
                            // If the user previously saved OpenAI, pMap['openai'] would allow us to load it, 
                            // but we need to know to switch dropdown to OpenAI.
                            // Lacking `active_provider` in config is a small debt.
                            // I will check `expert_model.provider` for Ralph, that one IS saved.
                            if (config.expert_model?.provider) {
                                const rProv = config.expert_model.provider;
                                setRalphProvider(rProv);
                                // Load key for this provider
                                if (pMap[rProv]?.api_key) {
                                    setRalphApiKey(pMap[rProv].api_key);
                                }
                            }
                        }
                    }
                });
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

    async function pollProjectTaskStatuses() {
        const codingProjects = projectsList.filter(p => p.type === 'coding_master');
        for (const project of codingProjects) {
            try {
                const result = await invoke('get_task_status', { projectPath: project.url });
                if (result) {
                    setProjectTaskStatuses(prev => ({
                        ...prev,
                        [project.id]: {
                            status: (result as any).status || 'pending',
                            progress: (result as any).progress || 0,
                            message: (result as any).message || ''
                        }
                    }));
                }
            } catch (e) {
                // Task may not exist, ignore
            }
        }
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

    // Poll project task statuses when viewing projects or dashboard
    useEffect(() => {
        if (projectsList.length === 0) return;

        pollProjectTaskStatuses();

        const interval = setInterval(() => {
            if (dashView === 'projects' || dashView === 'dashboard') {
                pollProjectTaskStatuses();
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [projectsList, dashView]);

    // Organization API Functions
    async function loadOrganizations() {
        setOrgLoading(true);
        try {
            const data = await apiRequest("/api/v1/organizations", {
                headers: { Authorization: "Bearer " + token },
            });
            setOrganizations(data as Organization[]);
            // If user belongs to an org, load that org's details
            if (user?.organizationId) {
                const org = (data as Organization[]).find(o => o.id === user.organizationId);
                if (org) {
                    setCurrentOrg(org);
                    await loadOrgMembers(org.id);
                    await loadOrgBlacklist(org.id);
                }
            }
        } catch (e) { } finally {
            setOrgLoading(false);
        }
    }

    async function loadOrgMembers(orgId: string) {
        try {
            const data = await apiRequest(`/api/v1/organizations/${orgId}/members`, {
                headers: { Authorization: "Bearer " + token },
            });
            setOrgMembers(data as OrgMember[]);
        } catch (e) { }
    }

    async function loadOrgBlacklist(orgId: string) {
        try {
            const data = await apiRequest(`/api/v1/organizations/${orgId}/blacklist`, {
                headers: { Authorization: "Bearer " + token },
            });
            setOrgBlacklist(data as OrgBlacklistEntry[]);
        } catch (e) { }
    }

    async function handleCreateOrg(e: React.FormEvent) {
        e.preventDefault();
        if (!newOrgName.trim()) return;
        setOrgLoading(true);
        try {
            const org = await apiRequest("/api/v1/organizations", {
                method: "POST",
                headers: { Authorization: "Bearer " + token },
                body: JSON.stringify({ name: newOrgName }),
            }) as Organization;
            // Join the created org as admin
            await apiRequest(`/api/v1/organizations/${org.id}/members`, {
                method: "POST",
                headers: { Authorization: "Bearer " + token },
                body: JSON.stringify({ userId: user?.id, role: "org_admin" }),
            });
            setNewOrgName("");
            setIsOrgModalOpen(false);
            showAlert("创建成功", "组织创建成功，您已成为管理员。");
            await loadMe(token); // Refresh user to get new org assignment
            await loadOrganizations();
        } catch (e) {
            showAlert("创建失败", "无法创建组织。");
        } finally {
            setOrgLoading(false);
        }
    }

    async function handleAddMember(_email: string, _role: string = "user") {
        if (!currentOrg || !inviteEmail.trim()) return;
        setOrgLoading(true);
        try {
            // Note: In a real app, you'd look up user by email first
            // For now, we'll show a message about needing user ID
            showAlert("功能提示", "请让成员先注册账号，然后提供其用户ID以添加到组织。");
        } catch (e) {
            showAlert("添加失败", "无法添加成员。");
        } finally {
            setOrgLoading(false);
            setInviteEmail("");
        }
    }

    async function handleRemoveMember(memberId: string) {
        if (!currentOrg) return;
        showConfirm("确认移除", "确定要将此成员移出组织吗？", async () => {
            try {
                await apiRequest(`/api/v1/organizations/${currentOrg.id}/members/${memberId}`, {
                    method: "DELETE",
                    headers: { Authorization: "Bearer " + token },
                });
                await loadOrgMembers(currentOrg.id);
                closeModal();
            } catch (e) {
                showAlert("移除失败", "无法移除成员。");
            }
        }, "确认移除", "bg-red-600");
    }

    async function handleLeaveOrg() {
        if (!currentOrg || !user) return;
        showConfirm("确认退出", "确定要退出当前组织吗？", async () => {
            try {
                await apiRequest(`/api/v1/organizations/${currentOrg.id}/members/${user.id}`, {
                    method: "DELETE",
                    headers: { Authorization: "Bearer " + token },
                });
                setCurrentOrg(null);
                setOrgMembers([]);
                await loadMe(token);
                closeModal();
                showAlert("已退出", "您已退出该组织。");
            } catch (e) {
                showAlert("退出失败", "无法退出组织。");
            }
        }, "确认退出", "bg-red-600");
    }

    async function handleAddToBlacklist(memberId: string, reason: string = "") {
        if (!currentOrg) return;
        try {
            await apiRequest(`/api/v1/organizations/${currentOrg.id}/blacklist`, {
                method: "POST",
                headers: { Authorization: "Bearer " + token },
                body: JSON.stringify({ userId: memberId, reason }),
            });
            await loadOrgBlacklist(currentOrg.id);
            showAlert("已添加", "用户已添加到黑名单。");
        } catch (e) {
            showAlert("添加失败", "无法添加到黑名单。");
        }
    }

    async function handleRemoveFromBlacklist(memberId: string) {
        if (!currentOrg) return;
        try {
            await apiRequest(`/api/v1/organizations/${currentOrg.id}/blacklist/${memberId}`, {
                method: "DELETE",
                headers: { Authorization: "Bearer " + token },
            });
            await loadOrgBlacklist(currentOrg.id);
        } catch (e) {
            showAlert("移除失败", "无法从黑名单移除。");
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
                organizationId: data.organizationId,
                role: data.role || 'user',
                isBlacklisted: data.isBlacklisted || false,
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
                organizationId: data.user.organizationId,
                role: data.user.role || 'user',
                isBlacklisted: data.user.isBlacklisted || false,
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
            const body = JSON.stringify({ name: projectName, url: projectUrl, prompt: projectPrompt, type: projectType, screenshot: projectScreenshot, platform: projectPlatform, useAIRewrite });
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
            setProjectPlatform("xiaohongshu");
            setUseAIRewrite(false);
            if (projectType === 'coding_master') {
                if (prdFilePath) {
                    // Scenario A: PRD Import
                    try {
                        // 1. Extract tasks
                        const tasks = await invoke<string[]>('extract_tasks_from_prd', { filePath: prdFilePath });
                        // 2. Sync Plan to Ralph
                        await invoke('sync_ralph_plan', {
                            projectPath: projectUrl,
                            tasks
                        });
                        console.log(`Initialized with ${tasks.length} tasks from PRD`);
                        alert(`项目初始化成功！\n已从 PRD 提取 ${tasks.length} 个任务并生成 Ralph 计划。`);
                    } catch (e: any) {
                        console.error("PRD initialization failed:", e);
                        alert(`PRD 解析失败: ${e.message || e}`);
                    }
                } else if (projectPrompt && !isEditing) {
                    // Scenario B: Smart Dispatch (Only on creation)
                    try {
                        const dispatchResult = await invoke<{ agent: string, message: string, success: boolean }>('smart_dispatch_task', {
                            projectPath: projectUrl,
                            taskDescription: projectPrompt,
                            filePath: null
                        });

                        if (dispatchResult.success) {
                            alert(`项目初始化成功！\n${dispatchResult.message}`);
                        } else {
                            console.error("Smart dispatch failed:", dispatchResult.message);
                            alert(`项目创建成功，但 AI 初始化失败: ${dispatchResult.message}`);
                        }
                    } catch (e: any) {
                        console.error("Smart dispatch error:", e);
                    }
                }
            }

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
        setProjectPlatform("xiaohongshu");
        setUseAIRewrite(false);
        setPrdFilePath("");
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
        setProjectPlatform((p as any).platform || "xiaohongshu");
        setUseAIRewrite((p as any).useAIRewrite || false);
        setPrdFilePath("");
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
                organizationId: me.organizationId,
                role: me.role || 'user',
                isBlacklisted: me.isBlacklisted || false,
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

                // Try to parse sidecar JSON log format
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === 'log' || parsed.type === 'error') {
                        const timestamp = new Date(parsed.timestamp).toLocaleTimeString();
                        const logMessage = `[${parsed.type.toUpperCase()}] [${timestamp}] ${parsed.message}`;
                        setTaskLogs(logs => [...logs, logMessage]);
                    } else {
                        setTaskLogs(logs => [...logs, `[LOG] ${line}`]);
                    }
                } catch (e) {
                    // Not JSON, append as-is
                    setTaskLogs(logs => [...logs, `[LOG] ${line}`]);
                }
            });

            console.log('[handleExecuteProject] Spawning sidecar...');
            const child = await command.spawn();
            console.log('[handleExecuteProject] Sidecar process spawned with PID:', child.pid);

            // Fetch OSS Credentials
            let ossCredentials = null;
            try {
                ossCredentials = await apiRequest("/api/v1/oss-credentials", {
                    headers: { Authorization: "Bearer " + token },
                });
                console.log('[handleExecuteProject] Fetched OSS credentials successfully');
            } catch (e) {
                console.error('[handleExecuteProject] Failed to fetch OSS credentials, screenshots may fail:', e);
            }

            const payload = {
                taskId: data.taskId,
                projectId: project.id,
                type: project.type,
                prompt: project.prompt,
                url: project.url,
                screenshot: project.screenshot,
                authToken: token,  // Pass auth token for material saving
                serverUrl: 'http://localhost:8080',
                llm: {
                    provider,
                    model,
                    apiKey,
                    baseURL
                },
                oss: ossCredentials
            };
            await child.write(JSON.stringify(payload) + "\n");
            setTaskLogs(logs => [...logs, `[System] 指令已下发，执行模型: ${model}`]);
        } catch (e: any) {
            console.error('[handleExecuteProject] Error during task setup:', e);
            showAlert("任务启动失败", e.message || "无法连接到执行引擎。");
            setLoading(false);
        }
    }

    /**
     * Execute project using Opencode server APIs
     * This replaces sidecar execution with HTTP calls to opencode-server
     */
    async function handleExecuteWithOpencode(project: Project) {
        if (!token || !user) return;
        setLoading(true);
        setTaskLogs([]);
        setTaskStatus("pending");
        setLastResultData("");
        setActiveProject(project);

        // Close existing SSE connection if any
        if (opcodeEventSource) {
            opcodeEventSource.close();
            setOpencodeEventSource(null);
        }

        try {
            // 1. Check opencode server health
            setTaskLogs(logs => [...logs, `[System] 正在连接 Opencode 服务器...`]);
            const isHealthy = await opencode.checkHealth();
            if (!isHealthy) {
                throw new Error('Opencode 服务器不可用，请运行: cd local-server && npm run serve');
            }
            setTaskLogs(logs => [...logs, `[System] ✓ Opencode 服务器连接成功`]);

            // 2. Create backend task record
            const data = (await apiRequest(`/api/v1/projects/${project.id}/execute`, {
                method: "POST",
                headers: { Authorization: "Bearer " + token },
            })) as { taskId: string; project: Project; message: string };

            // Refresh balance
            loadMe(token);

            // 3. Transition UI
            setActiveTaskId(data.taskId);
            setDashView("task_detail");
            setTaskStatus("running");
            setTaskLogs(logs => [...logs,
            `[System] 启动项目: ${project.name}`,
            `[System] 任务 ID: ${data.taskId}`,
                `[System] 正在创建 Opencode 会话...`
            ]);

            // 4. Create opencode session (using opencode CLI API)
            const session = await opencode.createSession(`项目: ${project.name}`);
            // setOpencodeSessionId(session.id);
            setTaskLogs(logs => [...logs, `[System] ✓ 会话已创建: ${session.id.slice(0, 8)}...`]);

            // 5. Subscribe to SSE events for real-time updates
            setTaskLogs(logs => [...logs, `[System] 正在订阅实时更新...`]);
            const eventSource = opencode.subscribeToSession(session.id, {
                onMessage: (message) => {
                    console.log('[Opencode] Message:', message);
                    if (message.parts) {
                        message.parts.forEach(part => {
                            if (part.type === 'text' && part.text) {
                                const text = part.text;
                                setTaskLogs(logs => [...logs, `[AI] ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`]);
                            } else if (part.type === 'reasoning' && part.text) {
                                const text = part.text;
                                setTaskLogs(logs => [...logs, `[Thinking] ${text.slice(0, 100)}...`]);
                            }
                        });
                    }
                },
                onToolUse: (toolName, input) => {
                    setTaskLogs(logs => [...logs, `[Tool] 调用 ${toolName}: ${JSON.stringify(input).slice(0, 100)}...`]);
                },
                onToolResult: (toolName, _result) => {
                    setTaskLogs(logs => [...logs, `[Tool] ${toolName} 完成`]);
                },
                onError: (_error) => {
                    // SSE errors are normal when connection closes after task completes
                    console.log('[Opencode] SSE connection closed');
                },
                onComplete: () => {
                    setTaskStatus('completed');
                    setLoading(false);
                    eventSource.close();
                    setOpencodeEventSource(null);
                    setTaskLogs(logs => [...logs, `[System] ✓ 任务执行完成`]);
                    // Complete task on backend
                    apiRequest(`/api/v1/tasks/${data.taskId}/complete`, {
                        method: "POST",
                        headers: { Authorization: "Bearer " + token },
                        body: JSON.stringify({ status: 'completed', result: '任务通过 Opencode 完成' }),
                    }).catch(console.error);
                }
            });
            setOpencodeEventSource(eventSource);
            setTaskLogs(logs => [...logs, `[System] ✓ 已订阅实时更新`]);

            // 6. Send the task as a /cowork command with streaming output
            // 6. Send the task as a /cowork command with streaming output
            const taskPrompt = project.prompt || `执行项目「${project.name}」的自动化任务`;

            setTaskLogs(logs => [...logs, `[System] 发送任务: ${taskPrompt}`]);
            if (localWorkflowPath) {
                setTaskLogs(logs => [...logs, `[System] 工作目录限制: ${localWorkflowPath}`]);
            }

            let finalResult = '';
            const response = await opencode.sendCoworkCommandStreaming(
                session.id,
                taskPrompt,
                localWorkflowPath // Pass restriction path to backend service
            );
            console.log('[Opencode] Cowork response:', response);

            // Use streaming result or fall back to response parts
            if (finalResult) {
                setLastResultData(JSON.stringify({
                    status: 'success',
                    data: { message: finalResult }
                }));
            } else if (response?.parts) {
                response.parts.forEach(part => {
                    if (part.type === 'text' && part.text) {
                        setTaskLogs(logs => [...logs, `[Result] ${part.text}`]);
                        setLastResultData(JSON.stringify({
                            status: 'success',
                            data: { message: part.text }
                        }));
                    }
                });
            }
            // Close SSE after getting HTTP response
            eventSource.close();
            setOpencodeEventSource(null);

            setTaskStatus('completed');
            setLoading(false);
            setTaskLogs(logs => [...logs, `[System] ✓ 任务执行完成`]);

            // Complete task on backend
            apiRequest(`/api/v1/tasks/${data.taskId}/complete`, {
                method: "POST",
                headers: { Authorization: "Bearer " + token },
                body: JSON.stringify({
                    status: 'completed',
                    result: finalResult || response?.parts?.find(p => p.text)?.text || '任务完成'
                }),
            }).catch(console.error);

        } catch (e: any) {
            console.error('[handleExecuteWithOpencode] Error:', e);
            showAlert("任务启动失败", e.message || "无法连接到 Opencode 服务器。");
            setTaskStatus('failed');
            setLastResultData(JSON.stringify({
                status: 'failed',
                data: { message: e.message || '任务启动失败' }
            }));
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

            // Update OpenCode Config
            const openCodeConfig = {
                provider: {
                    [opencodeProvider]: {
                        ...(opencodeApiKey ? { api_key: opencodeApiKey } : {})
                    },
                    ...(ralphProvider !== opencodeProvider ? {
                        [ralphProvider]: {
                            ...(ralphApiKey ? { api_key: ralphApiKey } : {})
                        }
                    } : {})
                },
                model: opencodeModel,
                small_model: opencodeSmallModel,
                expert_model: {
                    provider: ralphProvider,
                    model: ralphModel,
                }
            };

            try {
                await invoke('update_opencode_config', {
                    configJson: JSON.stringify(openCodeConfig)
                });
            } catch (err: any) {
                console.error("Failed to update OpenCode config:", err);
            }

            // Refresh user data from server to sync the hidden fields too
            await loadMe(token);

            showAlert("保存成功", "您的 AI 模型配置已更新。");
        } catch (e) {
            showAlert("保存失败", "无法更新设置。");
        } finally {
            setLoading(false);
        }
    }

    async function handlePublishMaterial(material: any, platform: string, title: string, imageUrl?: string, llmCost: number = 0) {
        if (!token || !user) return;
        setLoading(true);
        setTaskLogs([]);
        setTaskStatus("pending");
        setLastResultData("");
        setExecutionCost(llmCost);

        if (llmCost > 0) {
            setTaskLogs([`[System] AI 改写已消耗余额: ${llmCost} 点`]);
        }

        // I will also append it to a "task context" or similar if available.
        // Let's just use the logs for now, and I'll add the rich UI display in the next step by adding state.

        try {
            // 1. Determine image path (could be local path or URL)
            // Handle multi-line imageUrls (newline-separated) by taking the first valid URL
            let localImagePath = '';
            if (imageUrl) {
                const urls = imageUrl.split('\n').map(u => u.trim()).filter(u => u);
                localImagePath = urls[0] || '';
            }
            if (!localImagePath && material.type === 'image') {
                localImagePath = material.content;
            }
            if (!localImagePath && material.imageUrls) {
                const urls = material.imageUrls.split('\n').map((u: string) => u.trim()).filter((u: string) => u);
                localImagePath = urls[0] || '';
            }

            // Validate that we have an image path
            if (!localImagePath) {
                console.warn('[handlePublishMaterial] No localImagePath found');
                showAlert("发布失败", "该素材没有关联图片，小红书发布需要至少一张图片。");
                setLoading(false);
                return;
            }


            console.log('[handlePublishMaterial] Using imagePath:', localImagePath);

            // 2. Start publish task on backend
            console.log('[handlePublishMaterial] calling backend to create task...');
            const data = await apiRequest(`/api/v1/materials/${material.id}/publish`, {
                method: "POST",
                body: JSON.stringify({ platform, title }),
                headers: { Authorization: "Bearer " + token },
            }) as { taskId: string; material: any; platform: string; title: string; message: string };
            console.log('[handlePublishMaterial] task created:', data.taskId);

            // Refresh balance
            loadMe(token);

            // 3. Transition UI
            setActiveTaskId(data.taskId);
            setActiveProject({
                id: material.id,
                name: `Publish: ${material.name}`,
                prompt: material.content,
                url: localImagePath,
                type: 'xhs_publish',
                screenshot: false
            });
            setDashView("task_detail");
            setTaskStatus("running");
            setTaskLogs(logs => [...logs, `[System] 启动发布任务: ${material.name}`, `[System] 平台: ${platform}`, `[System] 任务 ID: ${data.taskId}`]);

            // 4. Spawn XHS-AGENT Sidecar
            console.log('[handlePublishMaterial] Spawning sidecar: binaries/xhs-agent');
            const command = Command.sidecar("binaries/xhs-agent");

            let finalStructuredResult = "";
            let finalPlainTextResult = "";

            command.on('close', async (d) => {
                const finalStatus = d.code === 0 ? "completed" : "failed";
                setTaskLogs(logs => [...logs, `[System] 执行结束，退出码: ${d.code}`]);
                setTaskStatus(finalStatus);
                setLoading(false);

                const resultToSend = finalStructuredResult || finalPlainTextResult;
                try {
                    await apiRequest(`/api/v1/tasks/${data.taskId}/complete`, {
                        method: "POST",
                        body: JSON.stringify({ status: finalStatus, result: resultToSend, stepsCount: 1 }),
                        headers: { Authorization: "Bearer " + token },
                    });
                } catch (e) {
                    updateTaskStatus(data.taskId, finalStatus, resultToSend);
                }
            });

            command.on('error', err => {
                console.error('[handlePublishMaterial] sidecar command error:', err);
                setTaskLogs(logs => [...logs, `[System] 错误: ${err}`]);
                setTaskStatus("failed");
                setLoading(false);
                updateTaskStatus(data.taskId, "failed", finalStructuredResult || finalPlainTextResult);
            });

            command.stdout.on('data', line => {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed && (parsed.status === 'success' || parsed.status === 'failed')) {
                        finalStructuredResult = line;
                        setLastResultData(line);
                    } else {
                        finalPlainTextResult += line + "\n";
                    }
                } catch (e) {
                    finalPlainTextResult += line + "\n";
                }
                setTaskLogs(logs => [...logs, `[OUT] ${line}`]);
            });

            command.stderr.on('data', line => {
                // xhs-agent uses console.error for logs
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === 'log') {
                        setTaskLogs(logs => [...logs, `[LOG] ${parsed.message}`]);
                    } else {
                        setTaskLogs(logs => [...logs, `[LOG] ${line}`]);
                    }
                } catch (e) {
                    setTaskLogs(logs => [...logs, `[LOG] ${line}`]);
                }
                finalPlainTextResult += line + "\n";

                // Detect login required message and show user-friendly prompt
                if (line.includes('Please log in') || line.includes('请登陆')) {
                    setTaskStatus('pending');
                    setTaskLogs(logs => [...logs, `[⚠️ 操作提示] 请先登录小红书平台，然后进入发布页面`]);
                }
            });

            const child = await command.spawn();
            console.log('[handlePublishMaterial] sidecar spawned.');

            // Payload for xhs-agent
            const payload = {
                taskId: data.taskId,
                title: data.title,
                content: material.content,
                imagePath: localImagePath // xhs-agent now handles URL downloading
            };

            await child.write(JSON.stringify(payload) + "\n");
            console.log('[handlePublishMaterial] payload written.');
            setTaskLogs(logs => [...logs, `[System] 指令已下发，正在启动小红书发布代理...`]);

        } catch (e: any) {
            console.error('[handlePublishMaterial] Fatal error:', e);
            let errorMessage = e.message || "无法连接到执行引擎。";
            if (e.data && e.data.error) {
                errorMessage = `API错误: ${e.data.error}`;
                if (e.data.details) errorMessage += ` (${e.data.details})`;
            } else if (e.status) {
                errorMessage = `请求失败 (Status: ${e.status})`;
            }
            showAlert("发布启动失败", errorMessage);
            setLoading(false);
        }
    }

    // ============ Publish Dialog Handlers ============
    async function handleOpenPublishDialog(project: Project, preSelectedMaterialId?: string) {
        setPublishDialogProject(project);
        setIsPublishDialogOpen(true);
        setPublishMode('select');
        setSelectedMaterialIds(preSelectedMaterialId ? [preSelectedMaterialId] : []);
        setRandomPublishCount(1);
        setPublishMaterials([]);

        // Fetch materials for this project
        try {
            const data = await apiRequest(`/api/v1/projects/${project.id}/materials`, {
                headers: { Authorization: "Bearer " + token },
            }) as { count: number; materials: any[] };
            setPublishMaterials(data.materials || []);
        } catch (e) {
            setPublishMaterials([]);
        }
    }

    // AI Rewrite helper function - calls backend LLM endpoint
    async function rewriteContentWithLLM(content: string, prompt: string): Promise<{ content: string; cost: number }> {
        if (!token) throw new Error('未登录');

        const response = await apiRequest("/api/v1/llm/chat", {
            method: "POST",
            headers: { Authorization: "Bearer " + token },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: `你是一个专业的内容改写助手。请根据用户的要求改写以下内容。要求：${prompt || '保持原意，优化表达，使内容更加自然流畅。'}`
                    },
                    {
                        role: 'user',
                        content: content
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000,
            }),
        }) as { content: string; cost: number; totalTokens: number };

        if (!response.content) {
            throw new Error('LLM 返回内容为空');
        }

        console.log(`[AI Rewrite] Tokens: ${response.totalTokens}, Cost: ${response.cost}`);

        // Refresh balance after LLM usage
        loadMe(token);

        return { content: response.content, cost: response.cost };
    }



    async function handleSelectWorkflowFolder() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: localWorkflowPath || undefined,
            });
            if (selected && typeof selected === 'string') {
                setLocalWorkflowPath(selected);
                localStorage.setItem("local_workflow_path", selected);
            }
        } catch (err) {
            console.error("Failed to select directory:", err);
        }
    }

    async function handlePublishWithMaterial() {
        if (!publishDialogProject || !token) return;

        let materialsToPublish: any[] = [];

        if (publishMode === 'select') {
            materialsToPublish = publishMaterials.filter(m => selectedMaterialIds.includes(m.id));
        } else {
            // Random mode - shuffle and pick
            const shuffled = [...publishMaterials].sort(() => 0.5 - Math.random());
            materialsToPublish = shuffled.slice(0, Math.min(randomPublishCount, shuffled.length));
        }

        if (materialsToPublish.length === 0) {
            showAlert("无可发布素材", "请先选择素材或确保项目有关联素材");
            return;
        }

        setPublishLoading(true);
        setIsPublishDialogOpen(false);

        const useAIRewrite = (publishDialogProject as any).useAIRewrite;
        const projectPrompt = publishDialogProject.prompt || '';

        console.log('[handlePublishWithMaterial] Starting publish loop. Count:', materialsToPublish.length, 'UseAIRewrite:', useAIRewrite);

        // Publish each material sequentially  
        for (const material of materialsToPublish) {
            let contentToPublish = material.content;
            let llmCost = 0;

            // If AI rewrite is enabled, rewrite the content first
            if (useAIRewrite) {
                try {
                    console.log('[handlePublishWithMaterial] Rewriting material:', material.name);

                    // Switch to task detail view immediately to show status
                    if ((publishDialogProject as Project).id) {
                        setActiveProject(publishDialogProject as Project);
                    }
                    setActiveTaskId(`AI-REWRITE-${Date.now().toString().slice(-6)}`);
                    setDashView('task_detail');
                    setTaskStatus('ai_rewriting');

                    const rewriteResult = await rewriteContentWithLLM(material.content, projectPrompt);
                    contentToPublish = rewriteResult.content;
                    llmCost = rewriteResult.cost;
                    console.log('[handlePublishWithMaterial] Rewrite success for:', material.name, 'Cost:', llmCost);
                } catch (err: any) {
                    console.error('[handlePublishWithMaterial] Rewrite failed:', err);
                    setTaskStatus('failed');
                    setLastResultData(JSON.stringify({ status: 'failed', data: { message: `AI 改写失败: ${err.message}` } }));
                    continue; // Skip this material
                }
            }

            // Create a modified material object with rewritten content
            const materialToPublish = { ...material, content: contentToPublish };
            console.log('[handlePublishWithMaterial] Calling handlePublishMaterial for:', material.name);

            try {
                await handlePublishMaterial(materialToPublish, 'xiaohongshu', material.name, material.imageUrls, llmCost);
            } catch (err: any) {
                console.error('[handlePublishWithMaterial] handlePublishMaterial failed:', err);
                showAlert("发布启动失败", `素材「${material.name}」启动失败: ${err.message}`);
                // Don't continue, let the user know? Or continue?
                // If we continue, we might spam alerts.
            }
        }

        setPublishLoading(false);
        // showAlert("发布任务已启动", `已启动 ${materialsToPublish.length} 个素材的发布任务`);
    }

    // ============ AI Workflow Dialog Handlers ============


    async function handleAIWorkflowGenerate(project: Project, action: 'generate' | 'continue' | 'confirm', userMessage?: string) {
        if (!token || !user) return;
        setAIDialogLoading(true);

        try {
            // Get LLM config
            let provider = 'openai';
            let model = user.llmModel;
            let apiKey = user.llmApiKey || '';
            let baseURL = user.llmBaseUrl;

            if (user.llmProvider === 'TaskMaster') {
                try {
                    const systemConfig = await apiRequest("/api/v1/llm-config", {
                        headers: { Authorization: "Bearer " + token },
                    }) as any;
                    if (systemConfig.llmModel) model = systemConfig.llmModel;
                    if (systemConfig.llmBaseUrl) baseURL = systemConfig.llmBaseUrl;
                    if (systemConfig.llmApiKey) apiKey = systemConfig.llmApiKey;
                } catch (e) {
                    model = 'google/gemini-2.0-flash-exp:free';
                    baseURL = 'https://openrouter.ai/api/v1';
                }
            } else {
                if (!model) model = 'gpt-4o';
                if (!baseURL) baseURL = 'https://api.openai.com/v1';
            }

            // Spawn sidecar for AI workflow
            const command = Command.sidecar("binaries/hyperagent");

            command.on('close', async (d) => {
                setAIDialogLoading(false);
                if (d.code !== 0) {
                    setAIDialogMessages(msgs => [...msgs, { role: 'system', content: `工作流生成失败，退出码: ${d.code}` }]);
                }
            });

            command.on('error', err => {
                setAIDialogLoading(false);
                setAIDialogMessages(msgs => [...msgs, { role: 'system', content: `错误: ${err}` }]);
            });

            command.stdout.on('data', line => {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.status === 'success' && parsed.data) {
                        // Add AI response to messages
                        if (parsed.data.output) {
                            setAIDialogMessages(msgs => [...msgs, { role: 'assistant', content: parsed.data.output }]);
                        }
                        // Update workflow steps
                        if (parsed.data.workflowSteps) {
                            setAIWorkflowSteps(parsed.data.workflowSteps);
                        }
                        // Update generated prompt
                        if (parsed.data.generatedPrompt) {
                            setAIGeneratedPrompt(parsed.data.generatedPrompt);
                        }
                        // Update structured steps flag
                        setAIHasStructuredSteps(!!parsed.data.hasStructuredSteps);
                        setAIDialogLoading(false);
                    } else if (parsed.status === 'failed') {
                        setAIDialogMessages(msgs => [...msgs, { role: 'system', content: `错误: ${parsed.error}` }]);
                        setAIDialogLoading(false);
                    }
                } catch (e) {
                    // Not valid JSON, ignore
                }
            });

            command.stderr.on('data', line => {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === 'log' || parsed.type === 'error') {
                        const timestamp = new Date(parsed.timestamp).toLocaleTimeString();
                        setAIWorkflowLogs(logs => [...logs, `[${parsed.type.toUpperCase()}] [${timestamp}] ${parsed.message}`]);
                    } else {
                        setAIWorkflowLogs(logs => [...logs, `[LOG] ${line}`]);
                    }
                } catch (e) {
                    setAIWorkflowLogs(logs => [...logs, `[LOG] ${line}`]);
                }
            });

            const child = await command.spawn();

            // Build payload based on action
            const payload = {
                taskId: `ai-workflow-${Date.now()}`,
                projectId: project.id,
                type: 'ai_workflow',
                action: action,
                prompt: project.prompt,
                url: project.url,
                userMessage: userMessage,
                authToken: token,
                serverUrl: 'http://localhost:8080',
                llm: { provider, model, apiKey, baseURL }
            };

            await child.write(JSON.stringify(payload) + "\n");

        } catch (e: any) {
            setAIDialogLoading(false);
            setAIDialogMessages(msgs => [...msgs, { role: 'system', content: `启动失败: ${e.message}` }]);
        }
    }

    async function handleAISendMessage() {
        if (!aiUserInput.trim() || !aiWorkflowProject) return;

        const userMessage = aiUserInput.trim();
        setAIDialogMessages(msgs => [...msgs, { role: 'user', content: userMessage }]);
        setAIUserInput("");

        // Continue workflow with user feedback
        await handleAIWorkflowGenerate(aiWorkflowProject, 'continue', userMessage);
    }

    async function handleAIConfirmWorkflow() {
        if (!aiWorkflowProject || !aiGeneratedPrompt) return;

        // Update the project's prompt with the generated workflow
        try {
            await apiRequest(`/api/v1/projects/${aiWorkflowProject.id}`, {
                method: "PUT",
                body: JSON.stringify({
                    name: aiWorkflowProject.name,
                    url: aiWorkflowProject.url,
                    prompt: aiGeneratedPrompt,
                    type: aiWorkflowProject.type,
                    screenshot: aiWorkflowProject.screenshot
                }),
                headers: { Authorization: "Bearer " + token },
            });

            showAlert("工作流已保存", "AI 生成的工作流已成功保存到项目配置中。");
            setIsAIWorkflowDialogOpen(false);
            loadProjects();
        } catch (e) {
            showAlert("保存失败", "无法保存工作流配置。");
        }
    }

    function handleCloseAIWorkflowDialog() {
        setIsAIWorkflowDialogOpen(false);
        setAIWorkflowProject(null);
        setAIDialogMessages([]);
        setAIWorkflowSteps([]);
        setAIGeneratedPrompt("");
        setAIWorkflowLogs([]);
        setAIWorkflowExecuting(false);
        setAIHasStructuredSteps(false);
    }

    // Execute the generated workflow directly
    async function handleExecuteWorkflow() {
        if (!aiWorkflowProject || !aiGeneratedPrompt || !token || !user) return;

        setAIWorkflowExecuting(true);
        setAIWorkflowLogs(logs => [...logs, '[System] 正在执行工作流...']);

        try {
            // Get LLM config
            let provider = 'openai';
            let model = user.llmModel;
            let apiKey = user.llmApiKey || '';
            let baseURL = user.llmBaseUrl;

            if (user.llmProvider === 'TaskMaster') {
                try {
                    const systemConfig = await apiRequest("/api/v1/llm-config", {
                        headers: { Authorization: "Bearer " + token },
                    }) as any;
                    if (systemConfig.llmModel) model = systemConfig.llmModel;
                    if (systemConfig.llmBaseUrl) baseURL = systemConfig.llmBaseUrl;
                    if (systemConfig.llmApiKey) apiKey = systemConfig.llmApiKey;
                } catch (e) {
                    model = 'google/gemini-2.0-flash-exp:free';
                    baseURL = 'https://openrouter.ai/api/v1';
                }
            } else {
                if (!model) model = 'gpt-4o';
                if (!baseURL) baseURL = 'https://api.openai.com/v1';
            }

            // Fetch OSS credentials
            let ossCredentials = null;
            try {
                ossCredentials = await apiRequest("/api/v1/oss-credentials", {
                    headers: { Authorization: "Bearer " + token },
                });
            } catch (e) {
                setAIWorkflowLogs(logs => [...logs, '[Warning] OSS凭证获取失败，截图功能可能不可用']);
            }

            // Spawn sidecar for execution
            const command = Command.sidecar("binaries/hyperagent");

            command.on('close', async (d) => {
                setAIWorkflowExecuting(false);
                setAIWorkflowLogs(logs => [...logs, `[System] 执行结束，退出码: ${d.code}`]);
                if (d.code === 0) {
                    setAIDialogMessages(msgs => [...msgs, { role: 'system', content: '✅ 工作流执行完成！' }]);
                } else {
                    setAIDialogMessages(msgs => [...msgs, { role: 'system', content: `❌ 工作流执行失败，退出码: ${d.code}` }]);
                }
            });

            command.on('error', err => {
                setAIWorkflowExecuting(false);
                setAIWorkflowLogs(logs => [...logs, `[Error] ${err}`]);
            });

            command.stdout.on('data', line => {
                setAIWorkflowLogs(logs => [...logs, `[OUT] ${line}`]);
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.status === 'success' && parsed.data?.output) {
                        setAIDialogMessages(msgs => [...msgs, { role: 'assistant', content: `执行结果:\n${parsed.data.output}` }]);
                    }
                } catch (e) {
                    // Not JSON, just log
                }
            });

            command.stderr.on('data', line => {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === 'log' || parsed.type === 'error') {
                        const timestamp = new Date(parsed.timestamp).toLocaleTimeString();
                        setAIWorkflowLogs(logs => [...logs, `[${parsed.type.toUpperCase()}] [${timestamp}] ${parsed.message}`]);
                    } else {
                        setAIWorkflowLogs(logs => [...logs, `[LOG] ${line}`]);
                    }
                } catch (e) {
                    setAIWorkflowLogs(logs => [...logs, `[LOG] ${line}`]);
                }
            });

            const child = await command.spawn();

            // Build execution payload using the generated prompt
            const taskId = `exec-${Date.now()}`;
            const payload = {
                taskId: taskId,
                projectId: aiWorkflowProject.id,
                type: 'workflow',
                prompt: aiGeneratedPrompt,  // Use the AI-generated prompt
                url: aiWorkflowProject.url,
                screenshot: aiWorkflowProject.screenshot,
                authToken: token,
                serverUrl: 'http://localhost:8080',
                llm: { provider, model, apiKey, baseURL },
                oss: ossCredentials
            };

            await child.write(JSON.stringify(payload) + "\n");
            setAIWorkflowLogs(logs => [...logs, `[System] 指令已下发，任务ID: ${taskId}`]);

        } catch (e: any) {
            setAIWorkflowExecuting(false);
            setAIWorkflowLogs(logs => [...logs, `[Error] 启动失败: ${e.message}`]);
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
            case 'teams': return '我的组织';
            case 'settings': return '系统设置';
            case 'materials': return '素材中心';
            case 'agent_studio': return 'Agent 工作台';
            case 'mission_control': return 'Mission Control';
            default: return '任务大师';
        }
    };

    const SidebarContent = () => (
        <>
            <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
                <img src="/logo-v2-1.png" alt="Logo" className="h-8" />
                <h1 className="text-lg font-bold bg-gradient-to-r from-blue-700 to-purple-700 dark:from-blue-500 dark:to-purple-500 bg-clip-text text-transparent">任务大师</h1>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 py-6">
                <ul className="flex flex-col gap-2">
                    <li><button onClick={() => { setDashView('dashboard'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'dashboard' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">dashboard</span><span className="text-sm font-medium">仪表盘</span></button></li>
                    <li><button onClick={() => { setDashView('projects'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'projects' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">view_kanban</span><span className="text-sm font-medium">项目管理</span></button></li>
                    <li><button onClick={() => { setDashView('tasks'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'tasks' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">history</span><span className="text-sm font-medium">任务历史</span></button></li>
                    <li><button onClick={() => { setDashView('materials'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'materials' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">topic</span><span className="text-sm font-medium">素材中心</span></button></li>
                    <li><button onClick={() => { setDashView('mission_control'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'mission_control' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">rocket_launch</span><span className="text-sm font-medium">Mission Control</span></button></li>
                    <li><button onClick={() => { setDashView('teams'); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${dashView === 'teams' ? 'bg-gradient-primary text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}><span className="material-symbols-outlined">apartment</span><span className="text-sm font-medium">我的组织</span></button></li>
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
            <div className="flex min-h-screen items-center justify-center bg-background-light dark:bg-background-dark p-4 relative">
                <button
                    onClick={toggleTheme}
                    className="absolute top-6 right-6 p-2.5 rounded-full bg-surface-light dark:bg-surface-dark shadow-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-accent-blue dark:text-slate-400 dark:hover:text-blue-400 transition-all hover:scale-105 active:scale-95"
                    title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>
                <div className="w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark p-8 shadow-lg border border-slate-200 dark:border-slate-800">
                    <div className="mb-6 flex items-center justify-center gap-3">
                        <img src="/logo-v2-1.png" alt="Logo" className="size-10" />
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">任务大师</h1>
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
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                            title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                            </span>
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">{user?.email}</span>
                            <div className="size-8 rounded-full bg-gradient-to-br from-[#5384FC] to-[#F82CC0] flex items-center justify-center text-white font-bold text-xs">{user?.email.substring(0, 2).toUpperCase()}</div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth bg-slate-50 dark:bg-[#0b1120]">
                    {dashView === 'dashboard' && (
                        <div className="mx-auto max-w-7xl flex flex-col gap-8">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 transition-all hover:border-accent-blue/30 h-full">
                                        <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">总余额</p><span className="material-symbols-outlined text-accent-blue">account_balance_wallet</span></div>
                                        <p className="text-3xl font-bold mb-4">{user?.balance}</p>
                                        <form onSubmit={handleRecharge} className="flex flex-wrap items-center gap-3">
                                            <input type="number" className="grow-[100] basis-[100px] rounded-lg border p-2 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} placeholder="金额" />
                                            <button type="submit" disabled={loading} className="grow basis-auto bg-gradient-primary text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">充值</button>
                                        </form>
                                    </div>
                                    <button onClick={() => setDashView('projects')} className="rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 transition-all hover:border-accent-blue/30 text-left h-full">
                                        <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">已添加项目</p><span className="material-symbols-outlined text-purple-500">task_alt</span></div>
                                        <p className="text-3xl font-bold">{projectsList.length}</p>
                                        {/* <p className="text-sm text-slate-500">当前项目总数</p> */}
                                    </button>
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
                                    {projectsList.slice(0, 6).map(p => {
                                        const typeConfig = PROJECT_TYPE_CONFIG[p.type] || PROJECT_TYPE_CONFIG['xhs_publish'];
                                        const taskStatus = p.type === 'coding_master' ? projectTaskStatuses[p.id] : null;
                                        const isRunning = taskStatus?.status === 'running';
                                        return (
                                            <div key={p.id} className={`rounded-xl bg-surface-light p-5 shadow-sm dark:bg-surface-dark border ${isRunning ? 'border-blue-400 dark:border-blue-500' : 'border-slate-200 dark:border-slate-800'} flex flex-col gap-3 relative overflow-hidden`}>
                                                {isRunning && (
                                                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
                                                )}
                                                <div className="flex justify-between items-start">
                                                    <h4 className="font-bold text-slate-900 dark:text-white truncate pr-2">{p.name}</h4>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${typeConfig.color} ${typeConfig.darkColor}`}>{typeConfig.label}</span>
                                                </div>
                                                {isRunning && (
                                                    <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                                                        <span className="size-2 rounded-full bg-blue-500 animate-pulse"></span>
                                                        <span className="truncate">{taskStatus?.message || '分析中...'}</span>
                                                        <span className="ml-auto font-mono">{taskStatus?.progress || 0}%</span>
                                                    </div>
                                                )}
                                                <p className="text-xs text-slate-500 line-clamp-2 h-8">{p.prompt}</p>
                                                <div className="flex gap-2 mt-2">
                                                    <button onClick={() => {
                                                        if (p.type === 'coding_master') {
                                                            setActiveProject(p);
                                                            setDashView('project_detail');
                                                        } else if (p.type === 'local_workflow') {
                                                            handleExecuteWithOpencode(p);
                                                        } else {
                                                            handleExecuteProject(p);
                                                        }
                                                    }} className="flex-1 bg-blue-50 dark:bg-blue-900/20 text-accent-blue px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                                                        {p.type === 'coding_master' ? '进入工作台' : '执行'}
                                                    </button>
                                                    <button onClick={() => { handleOpenEditModal(p); setDashView('projects'); }} className="px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors">管理</button>
                                                </div>
                                            </div>
                                        );
                                    })}
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
                            {projectsList.length === 0 ? (
                                <div className="text-center py-20 text-slate-500 bg-surface-light dark:bg-surface-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">尚未创建项目</div>
                            ) : (
                                <div className="flex flex-col gap-8">
                                    {PROJECT_TYPE_ORDER.map(typeKey => {
                                        const typeConfig = PROJECT_TYPE_CONFIG[typeKey];
                                        const projectsOfType = projectsList.filter(p => p.type === typeKey);
                                        if (projectsOfType.length === 0) return null;
                                        return (
                                            <div key={typeKey} className="flex flex-col gap-4">
                                                <div className="flex items-center gap-3">
                                                    <span className={`material-symbols-outlined ${typeConfig.color.split(' ')[1]}`} style={{ fontSize: '24px' }}>{typeConfig.icon}</span>
                                                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">{typeConfig.label}</h4>
                                                    <span className="text-sm text-slate-500">({projectsOfType.length})</span>
                                                </div>
                                                <div className="grid grid-cols-1 gap-3">
                                                    {projectsOfType.map(p => {
                                                        const taskStatus = p.type === 'coding_master' ? projectTaskStatuses[p.id] : null;
                                                        const isRunning = taskStatus?.status === 'running';
                                                        return (
                                                        <div key={p.id} className={`rounded-xl bg-surface-light p-5 shadow-sm dark:bg-surface-dark border ${isRunning ? 'border-blue-400 dark:border-blue-500' : 'border-slate-200 dark:border-slate-800'} flex items-center justify-between relative overflow-hidden`}>
                                                            {isRunning && (
                                                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
                                                            )}
                                                            <div className="flex-1 min-w-0 pr-4">
                                                                <div className="flex items-center gap-3 mb-1">
                                                                    <h4 className="text-base font-bold text-slate-900 dark:text-white truncate">{p.name}</h4>
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeConfig.color} ${typeConfig.darkColor}`}>{typeConfig.label}</span>
                                                                </div>
                                                                {isRunning && (
                                                                    <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mb-1">
                                                                        <span className="size-2 rounded-full bg-blue-500 animate-pulse"></span>
                                                                        <span className="truncate">{taskStatus?.message || '分析中...'}</span>
                                                                        <span className="ml-2 font-mono bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">{taskStatus?.progress || 0}%</span>
                                                                    </div>
                                                                )}
                                                                <p className="text-sm text-slate-500 line-clamp-1">{p.prompt}</p>
                                                            </div>
                                                            <div className="flex gap-3 shrink-0">
                                                                <button onClick={() => {
                                                                    if (p.type === 'coding_master') {
                                                                        setActiveProject(p);
                                                                        setDashView('project_detail');
                                                                    } else if (p.type === 'local_workflow') {
                                                                        handleExecuteWithOpencode(p);
                                                                    } else {
                                                                        handleOpenPublishDialog(p);
                                                                    }
                                                                }} className={`flex items-center gap-2 ${typeConfig.color} ${typeConfig.darkColor} px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm hover:opacity-80`}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>{typeConfig.icon}</span>
                                                                    {p.type === 'coding_master' ? '进入工作台' : p.type === 'local_workflow' ? '执行' : '启动'}
                                                                </button>
                                                                <button onClick={() => handleOpenEditModal(p)} className="p-2 rounded-lg text-slate-400 hover:text-accent-blue hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"><span className="material-symbols-outlined">edit</span></button>
                                                                <button onClick={() => handleDeleteProject(p.id)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><span className="material-symbols-outlined">delete</span></button>
                                                            </div>
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
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
                                    </div>
                                    <div className="flex-1 flex items-center justify-center flex-col gap-3">
                                        {taskStatus === 'pending' && <><div className="size-12 rounded-full border-4 border-slate-200 border-t-slate-400 animate-spin"></div><p className="text-slate-500">任务准备中...</p></>}
                                        {taskStatus === 'ai_rewriting' && <><div className="size-12 rounded-full border-4 border-slate-200 border-t-purple-500 animate-spin"></div><p className="text-purple-600 font-bold">正在进行 AI 改写...</p></>}
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
                                    <div className="rounded-lg font-mono text-sm overflow-x-auto">
                                        {(() => {
                                            try {
                                                const parsed = JSON.parse(lastResultData);
                                                // Check for XHS Agent specific format
                                                if (parsed && (parsed.status === 'success' || parsed.status === 'failed') && parsed.data) {
                                                    const isSuccess = parsed.status === 'success';
                                                    return (
                                                        <div className={`flex flex-col gap-3 p-4 rounded-lg border ${isSuccess ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800'}`}>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`material-symbols-outlined ${isSuccess ? 'text-green-600' : 'text-red-500'}`} style={{ fontSize: "28px" }}>
                                                                    {isSuccess ? 'check_circle' : 'cancel'}
                                                                </span>
                                                                <h4 className={`text-lg font-bold ${isSuccess ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                                                    {isSuccess ? '执行成功' : '执行失败'}
                                                                </h4>
                                                            </div>
                                                            <div className="pl-9">
                                                                <p className={`text-sm ${isSuccess ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                                                                    {parsed.data.message || (isSuccess ? '任务已完成' : '任务遇到错误')}
                                                                </p>
                                                                {executionCost > 0 && (
                                                                    <div className="mt-2 text-xs font-mono bg-white/50 dark:bg-black/20 p-1.5 rounded inline-block text-slate-600 dark:text-slate-400">
                                                                        余额扣减: -{executionCost} 点
                                                                    </div>
                                                                )}
                                                                {parsed.data.details && (
                                                                    <p className="mt-2 text-xs text-slate-500 font-mono bg-white/50 dark:bg-black/20 p-2 rounded">
                                                                        {parsed.data.details}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                // Fallback to default HyperAgent display or JSON dump
                                                return <HyperAgentResultDisplay data={parsed} />;
                                            } catch (e) {
                                                return <HyperAgentResultDisplay data={{ output: lastResultData }} />;
                                            }
                                        })()}
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 rounded-xl bg-[#1e1e1e] shadow-sm border border-slate-800 flex flex-col overflow-hidden min-h-[300px]">
                                <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333]"><div className="flex items-center gap-2 text-slate-300 text-xs font-medium uppercase tracking-wider"><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>terminal</span>实时日志</div><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${taskStatus === 'running' ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></span><span className="text-xs text-slate-400">{taskStatus === 'running' ? 'Live' : 'Stopped'}</span></div></div>
                                <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-slate-300 leading-relaxed scroll-smooth">{taskLogs.length === 0 && <span className="text-slate-500 italic">Waiting for logs...</span>}{taskLogs.map((log, i) => (<div key={i} className="mb-1 break-words whitespace-pre-wrap">{log}</div>))}<div ref={logsEndRef} /></div>
                            </div>
                            <div className="h-32"></div>
                        </div>
                    )}

                    {dashView === 'tasks' && (
                        <div className="mx-auto max-w-7xl flex flex-col gap-6">
                            <div className="flex justify-end"><button onClick={loadTasks} className="flex items-center gap-2 rounded-lg bg-surface-light px-3 py-2 text-sm font-medium border border-slate-200 dark:border-slate-800 dark:bg-surface-dark transition-colors hover:bg-slate-50 text-slate-900 dark:text-white"><span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`} style={{ fontSize: "20px" }}>refresh</span>刷新</button></div>
                            <div className="rounded-xl bg-surface-light shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <table className="w-full text-left text-sm text-slate-500">
                                    <thead className="bg-slate-50 text-xs uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-400"><tr><th className="px-6 py-3">类型</th><th className="px-6 py-3">AI 提示词 (Prompt)</th><th className="px-6 py-3">状态</th><th className="px-6 py-3">消耗</th><th className="px-6 py-3">创建时间</th><th className="px-6 py-3 text-right">操作</th></tr></thead>
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
                                                                setLastResultData(task.result || "");
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

                            {/* Coding Master Settings */}
                            <div className="rounded-2xl bg-surface-light p-8 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
                                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-orange-500">code</span>
                                    Coding全能大师配置
                                </h3>
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    handleUpdateSettings(e);
                                }} className="flex flex-col gap-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="md:col-span-2">
                                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                                                <span className="size-2 rounded-full bg-orange-500"></span> 标准模式 (Coding任务模型 - 默认)
                                            </h4>
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Provider</label>
                                            <select
                                                className="custom-select w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500/20"
                                                value={opencodeProvider}
                                                onChange={(e) => setOpencodeProvider(e.target.value)}
                                            >
                                                <option value="anthropic">Anthropic</option>
                                                <option value="openai">OpenAI</option>
                                                <option value="google">Google</option>
                                                <option value="minimax">MiniMax</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                                            <input
                                                type="password"
                                                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500/20"
                                                placeholder="sk-..."
                                                value={opencodeApiKey}
                                                onChange={(e) => setOpencodeApiKey(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Model Name</label>
                                            <input
                                                type="text"
                                                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500/20"
                                                placeholder="e.g. anthropic/claude-3-5-sonnet-20241022"
                                                value={opencodeModel}
                                                onChange={(e) => setOpencodeModel(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Small Model (轻量级任务)</label>
                                            <input
                                                type="text"
                                                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500/20"
                                                placeholder="e.g. anthropic/claude-3-haiku-20240307"
                                                value={opencodeSmallModel}
                                                onChange={(e) => setOpencodeSmallModel(e.target.value)}
                                            />
                                        </div>
                                        <div className="md:col-span-2 border-t border-slate-100 dark:border-slate-700 my-2"></div>
                                        <div className="md:col-span-2">
                                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                                                <span className="size-2 rounded-full bg-purple-500"></span> 专家模式 (Coding任务模型 - 复杂)
                                            </h4>
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Provider</label>
                                            <select
                                                className="custom-select w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/20"
                                                value={ralphProvider}
                                                onChange={(e) => setRalphProvider(e.target.value)}
                                            >
                                                <option value="anthropic">Anthropic</option>
                                                <option value="openai">OpenAI</option>
                                                <option value="google">Google</option>
                                                <option value="minimax">MiniMax</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                                            <input
                                                type="password"
                                                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/20"
                                                placeholder="sk-..."
                                                value={ralphApiKey}
                                                onChange={(e) => setRalphApiKey(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Model Name</label>
                                            <input
                                                type="text"
                                                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/20"
                                                placeholder="e.g. claude-3-5-sonnet-20241022"
                                                value={ralphModel || ""}
                                                onChange={(e) => setRalphModel(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button type="submit" disabled={loading} className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:scale-[1.02] transition-transform">保存 Coding 配置</button>
                                    </div>
                                </form>
                            </div>



                            {/* Local Workflow Settings */}
                            <div className="rounded-2xl bg-surface-light p-8 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
                                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-green-500">folder_managed</span>
                                    本地工作流设置
                                </h3>
                                <div className="flex flex-col gap-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">工作目录限制</label>
                                        <div className="text-xs text-slate-500 mb-2">设置后，Opencode 的执行将被限制在此目录内，防止误操作其他文件。</div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                className="flex-1 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-blue/20 cursor-not-allowed opacity-75"
                                                placeholder="请选择工作目录..."
                                                value={localWorkflowPath}
                                                readOnly
                                            />
                                            <button
                                                type="button"
                                                onClick={handleSelectWorkflowFolder}
                                                className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors whitespace-nowrap"
                                            >
                                                选择目录
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {dashView === 'teams' && (
                        <div className="mx-auto max-w-7xl flex flex-col gap-6">
                            {/* Header */}
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold flex items-center gap-2">
                                        <span className="material-symbols-outlined text-accent-blue">apartment</span>
                                        我的组织
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">管理您的组织成员和共享余额</p>
                                </div>
                                {!currentOrg && (
                                    <button
                                        onClick={() => setIsOrgModalOpen(true)}
                                        className="flex items-center gap-2 bg-gradient-primary text-white px-4 py-2 rounded-lg font-medium shadow-lg hover:shadow-purple-600/30 transition-all"
                                    >
                                        <span className="material-symbols-outlined">add</span>
                                        创建组织
                                    </button>
                                )}
                            </div>

                            {orgLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-blue"></div>
                                </div>
                            ) : !currentOrg ? (
                                /* No Organization State */
                                <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
                                    <div className="size-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-4">
                                        <span className="material-symbols-outlined" style={{ fontSize: "32px" }}>group_off</span>
                                    </div>
                                    <h3 className="text-lg font-bold mb-2">您还没有加入任何组织</h3>
                                    <p className="text-slate-500 mb-6 max-w-md mx-auto">
                                        创建一个新组织并邀请团队成员，共享管理员余额，协同完成自动化任务。
                                    </p>
                                    <button
                                        onClick={() => setIsOrgModalOpen(true)}
                                        className="inline-flex items-center gap-2 bg-gradient-primary text-white px-6 py-3 rounded-lg font-medium"
                                    >
                                        <span className="material-symbols-outlined">add</span>
                                        创建我的组织
                                    </button>
                                </div>
                            ) : (
                                /* Organization Dashboard */
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Organization Info Card */}
                                    <div className="lg:col-span-1 bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-800 p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="size-12 rounded-lg bg-gradient-primary flex items-center justify-center text-white">
                                                <span className="material-symbols-outlined">apartment</span>
                                            </div>
                                            {user?.role === 'org_admin' && (
                                                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold rounded-full">管理员</span>
                                            )}
                                        </div>
                                        <h3 className="text-xl font-bold mb-1">{currentOrg.name}</h3>
                                        <p className="text-sm text-slate-500 mb-4">组织ID: {currentOrg.id.slice(0, 8)}...</p>

                                        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-500">组织余额</span>
                                                <span className="text-lg font-bold text-accent-blue">{currentOrg.balance} 积分</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-500">成员数量</span>
                                                <span className="font-medium">{orgMembers.length} 人</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-500">您的角色</span>
                                                <span className="font-medium">{user?.role === 'org_admin' ? '管理员' : '成员'}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleLeaveOrg}
                                            className="w-full mt-6 flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 py-2 rounded-lg transition-colors text-sm font-medium"
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>logout</span>
                                            退出组织
                                        </button>
                                    </div>

                                    {/* Members List */}
                                    <div className="lg:col-span-2 bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-800">
                                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                            <h4 className="font-bold flex items-center gap-2">
                                                <span className="material-symbols-outlined text-slate-400">group</span>
                                                组织成员 ({orgMembers.length})
                                            </h4>
                                            {user?.role === 'org_admin' && (
                                                <button
                                                    onClick={() => handleAddMember('', 'user')}
                                                    className="text-sm text-accent-blue hover:underline flex items-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>person_add</span>
                                                    添加成员
                                                </button>
                                            )}
                                        </div>
                                        <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                                            {orgMembers.length === 0 ? (
                                                <div className="p-8 text-center text-slate-500">
                                                    <span className="material-symbols-outlined text-4xl mb-2">person_off</span>
                                                    <p>暂无成员</p>
                                                </div>
                                            ) : orgMembers.map(member => (
                                                <div key={member.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                                                            {member.email.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">{member.email}</p>
                                                            <p className="text-xs text-slate-500">
                                                                {member.role === 'org_admin' ? '管理员' : '成员'}
                                                                {member.id === user?.id && ' (您)'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {user?.role === 'org_admin' && member.id !== user?.id && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleAddToBlacklist(member.id, '管理员操作')}
                                                                className="p-1 text-slate-400 hover:text-orange-500 transition-colors"
                                                                title="加入黑名单"
                                                            >
                                                                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>block</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleRemoveMember(member.id)}
                                                                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                                                title="移除成员"
                                                            >
                                                                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>person_remove</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Blacklist Section (Admin Only) */}
                                    {user?.role === 'org_admin' && orgBlacklist.length > 0 && (
                                        <div className="lg:col-span-3 bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-800">
                                            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                                                <h4 className="font-bold flex items-center gap-2 text-red-500">
                                                    <span className="material-symbols-outlined">block</span>
                                                    黑名单 ({orgBlacklist.length})
                                                </h4>
                                            </div>
                                            <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                                {orgBlacklist.map(entry => (
                                                    <div key={entry.id} className="p-4 flex items-center justify-between">
                                                        <div>
                                                            <p className="font-medium">用户 ID: {entry.userId.slice(0, 8)}...</p>
                                                            <p className="text-sm text-slate-500">{entry.reason || '无原因'}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveFromBlacklist(entry.userId)}
                                                            className="text-sm text-accent-blue hover:underline"
                                                        >
                                                            解除
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Create Organization Modal */}
                            {isOrgModalOpen && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                    <div className="w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-xl font-bold">创建组织</h3>
                                            <button onClick={() => setIsOrgModalOpen(false)} className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>
                                        <form onSubmit={handleCreateOrg} className="flex flex-col gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">组织名称</label>
                                                <input
                                                    type="text"
                                                    value={newOrgName}
                                                    onChange={(e) => setNewOrgName(e.target.value)}
                                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm"
                                                    placeholder="输入组织名称"
                                                    required
                                                />
                                            </div>
                                            <p className="text-xs text-slate-500">创建后您将成为该组织的管理员，可以邀请其他成员加入。</p>
                                            <button
                                                type="submit"
                                                disabled={orgLoading}
                                                className="w-full bg-gradient-primary text-white py-3 rounded-lg font-medium"
                                            >
                                                {orgLoading ? '创建中...' : '创建组织'}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {dashView === 'materials' && (
                        <MaterialCenter projectsList={projectsList} onOpenPublishDialog={handleOpenPublishDialog} />
                    )}
                    {dashView === 'agent_studio' && (
                        <AgentStudio />
                    )}
                    {dashView === 'mission_control' && (
                        <CodingMasterDashboard onClose={() => setDashView('projects')} />
                    )}
                    {dashView === 'project_detail' && activeProject && (
                        <CodingProjectWorkspace
                            project={activeProject}
                            onBack={() => setDashView('projects')}
                        />
                    )}
                </div>
            </main>

            {/* Project Modal */}
            {isProjectModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="mb-6 flex items-center justify-between"><h3 className="text-xl font-bold text-slate-900 dark:text-white">{isEditing ? "修改自动化项目" : "新建自动化项目"}</h3><button onClick={() => setIsProjectModalOpen(false)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><span className="material-symbols-outlined">close</span></button></div>
                        <form onSubmit={handleSubmitProject} className="flex flex-col gap-4">
                            <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">项目名称</label><input type="text" className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" placeholder="例如：发布小红书笔记" value={projectName} onChange={(e) => setProjectName(e.target.value)} required /></div>
                            <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">项目类型</label><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setProjectType('coding_master')} className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${projectType === 'coding_master' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                            ><div className="flex items-center gap-2"><span className="material-symbols-outlined text-orange-600" style={{ fontSize: '18px' }}>code</span><span className="text-sm font-bold text-slate-900 dark:text-white">Coding全能大师</span></div><span className="text-[10px] text-slate-500">AI 编程助手</span></button><button type="button" onClick={() => setProjectType('workflow')} className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${projectType === 'workflow' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                            ><div className="flex items-center gap-2"><span className="material-symbols-outlined text-purple-600" style={{ fontSize: '18px' }}>bolt</span><span className="text-sm font-bold text-slate-900 dark:text-white">自动工作流</span></div><span className="text-[10px] text-slate-500">浏览器自动化</span></button><button type="button" onClick={() => setProjectType('local_workflow')} className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${projectType === 'local_workflow' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                            ><div className="flex items-center gap-2"><span className="material-symbols-outlined text-green-600" style={{ fontSize: '18px' }}>terminal</span><span className="text-sm font-bold text-slate-900 dark:text-white">本地工作流</span></div><span className="text-[10px] text-slate-500">AI 代理执行本地任务</span></button><button type="button" onClick={() => { }} className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed`}
                            ><div className="flex items-center gap-2"><span className="material-symbols-outlined text-blue-600" style={{ fontSize: '18px' }}>download</span><span className="text-sm font-bold text-slate-900 dark:text-white">网页抓取</span></div><span className="text-[10px] text-slate-500">提取结构化数据</span></button></div></div>
                            {projectType === 'workflow' && <>
                                <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">项目平台</label><div className="flex gap-4"><button type="button" className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all border-accent-blue bg-blue-50 dark:bg-blue-900/20`}
                                ><div className="flex items-center gap-2"><img src="/src/assets/小红书.svg" alt="小红书" className="w-5 h-5" /><span className="text-sm font-bold text-slate-900 dark:text-white">小红书笔记</span></div><span className="text-[10px] text-slate-500">当前仅支持小红书</span></button><button type="button" className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed`}
                                ><div className="flex items-center gap-2"><img src="/src/assets/视频号.svg" alt="视频号" className="w-5 h-5" /><span className="text-sm font-bold text-slate-900 dark:text-white">微信视频号</span></div><span className="text-[10px] text-slate-500">即将上线</span></button></div></div>
                                <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">是否使用 AI 改写</label><div className="flex gap-4"><button type="button" onClick={() => setUseAIRewrite(true)} className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${useAIRewrite ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                                ><span className="text-sm font-bold text-slate-900 dark:text-white">是</span><span className="text-[10px] text-slate-500">AI将自动改写发布正文</span></button><button type="button" onClick={() => setUseAIRewrite(false)} className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${!useAIRewrite ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                                ><span className="text-sm font-bold text-slate-900 dark:text-white">否</span><span className="text-[10px] text-slate-500">使用素材内容发布</span></button></div></div>
                                {useAIRewrite && <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">AI 提示词 (Prompt) <span className="text-red-500">*</span></label><textarea className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" rows={4} placeholder="描述需要自动完成的操作步骤..." value={projectPrompt} onChange={(e) => setProjectPrompt(e.target.value)} required /></div>}
                            </>}
                            {projectType === 'local_workflow' && <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">任务需求 <span className="text-red-500">*</span></label><textarea className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" rows={4} placeholder="描述你的需求，例如：&#10;• 查询杭州今日天气并保存到 weather.xlsx&#10;• 抓取知乎热榜前 10 条保存为 JSON&#10;• 搜索 Python 教程并整理成文档" value={projectPrompt} onChange={(e) => setProjectPrompt(e.target.value)} required /></div>}
                            {projectType === 'coding_master' && <>
                                <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="material-symbols-outlined text-orange-600" style={{ fontSize: '20px' }}>code</span>
                                        <span className="text-sm font-bold text-orange-700 dark:text-orange-300">Coding全能大师</span>
                                    </div>
                                    <p className="text-xs text-orange-600 dark:text-orange-400">使用专家模式 (复杂任务) 和标准模式 (简单任务) 来完成编程工作。</p>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        PRD 文档 (可选) <span className="text-xs text-orange-500 font-normal">- 用于 AI 自动生成开发计划</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                            placeholder="选择需求文档 (.md/.txt)..."
                                            value={prdFilePath}
                                            readOnly
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const selected = await open({
                                                        filters: [{
                                                            name: 'Markdown/Text',
                                                            extensions: ['md', 'txt']
                                                        }],
                                                        multiple: false,
                                                        title: '选择 PRD 文档'
                                                    });
                                                    if (selected) {
                                                        setPrdFilePath(selected as string);
                                                    }
                                                } catch (err) {
                                                    console.error("Failed to open dialog:", err);
                                                }
                                            }}
                                            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>article</span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">项目路径 <span className="text-red-500">*</span></label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                            placeholder="请选择项目根目录"
                                            value={projectUrl}
                                            onChange={(e) => setProjectUrl(e.target.value)}
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const selected = await open({
                                                        directory: true,
                                                        multiple: false,
                                                        title: '选择项目根目录'
                                                    });
                                                    if (selected) {
                                                        setProjectUrl(selected as string);
                                                    }
                                                } catch (err) {
                                                    console.error("Failed to open dialog:", err);
                                                }
                                            }}
                                            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>folder_open</span>
                                        </button>
                                    </div>
                                </div>
                                <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">编程任务描述 <span className="text-red-500">*</span></label><textarea className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white" rows={4} placeholder="描述你的编程需求，例如：&#10;• 添加用户登录功能&#10;• 重构 API 模块&#10;• 修复分页 Bug" value={projectPrompt} onChange={(e) => setProjectPrompt(e.target.value)} required /></div>
                            </>}
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                                <span className="material-symbols-outlined text-purple-600" style={{ fontSize: "18px" }}>auto_awesome</span>
                                <span className="text-xs text-purple-700 dark:text-purple-300">AI有时候会犯错，请认真甄别</span>
                            </div>
                            <div className="mt-4 flex justify-end gap-3"><button type="button" onClick={() => setIsProjectModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-500">取消</button><button type="submit" disabled={loading} className="bg-gradient-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg">{loading ? "处理中..." : (isEditing ? "保存修改" : "保存项目")}</button></div>
                        </form>
                    </div>
                </div>
            )
            }

            {/* Global Alert/Confirm Modal */}
            {
                globalModal.isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="w-full max-sm:max-w-xs max-w-sm rounded-2xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200">
                            <div className="flex flex-col items-center text-center gap-4">
                                <img src="/logo-v2-1.png" alt="Logo" className="w-16 h-16 object-contain mb-2" />
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
                                        className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-lg transition-all active:scale-95 bg-gradient-primary hover:opacity-90"
                                    >
                                        {globalModal.type === 'confirm' ? globalModal.confirmText : "好的"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Publish Dialog */}
            {
                isPublishDialogOpen && publishDialogProject && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[80vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white">发布素材</h3>
                                <button onClick={() => setIsPublishDialogOpen(false)} className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Project info */}
                            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <p className="text-sm font-medium text-slate-900 dark:text-white">{publishDialogProject.name}</p>
                                <p className="text-xs text-slate-500">关联素材: {publishMaterials.length} 个</p>
                            </div>

                            {/* AI Rewrite Status */}
                            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${(publishDialogProject as any).useAIRewrite ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800' : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}>
                                <span className={`material-symbols-outlined ${(publishDialogProject as any).useAIRewrite ? 'text-purple-600' : 'text-slate-400'}`} style={{ fontSize: '18px' }}>
                                    {(publishDialogProject as any).useAIRewrite ? 'auto_awesome' : 'edit_off'}
                                </span>
                                <div>
                                    <p className={`text-sm font-medium ${(publishDialogProject as any).useAIRewrite ? 'text-purple-700 dark:text-purple-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                        {(publishDialogProject as any).useAIRewrite ? 'AI 改写已启用' : 'AI 改写未启用'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {(publishDialogProject as any).useAIRewrite ? '发布前将使用 AI 改写素材内容' : '将直接使用原始素材内容发布'}
                                    </p>
                                    {(publishDialogProject as any).useAIRewrite && (publishDialogProject as any).prompt && (
                                        <div className="mt-2 text-xs bg-white dark:bg-slate-900/50 p-2 rounded border border-purple-100 dark:border-purple-800/50 text-slate-600 dark:text-slate-400">
                                            <span className="font-bold text-purple-600 dark:text-purple-400 block mb-0.5">Prompt:</span>
                                            {(publishDialogProject as any).prompt}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Mode selection */}
                            <div className="mb-4">
                                <label className="text-sm font-medium mb-2 block text-slate-700 dark:text-slate-300">发布方式</label>
                                <div className="flex gap-4">
                                    <button onClick={() => setPublishMode('select')}
                                        className={`flex-1 p-3 rounded-lg border text-left transition-all ${publishMode === 'select' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                                        <span className="text-sm font-medium text-slate-900 dark:text-white">选择发布</span>
                                        <p className="text-xs text-slate-500 mt-1">手动选择要发布的素材</p>
                                    </button>
                                    <button onClick={() => setPublishMode('random')}
                                        className={`flex-1 p-3 rounded-lg border text-left transition-all ${publishMode === 'random' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                                        <span className="text-sm font-medium text-slate-900 dark:text-white">随机发布</span>
                                        <p className="text-xs text-slate-500 mt-1">随机选择指定数量发布</p>
                                    </button>
                                </div>
                            </div>

                            {/* Select mode - material list */}
                            {publishMode === 'select' && (
                                <div className="mb-4 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                                    {publishMaterials.length === 0 ? (
                                        <p className="p-4 text-center text-slate-500 text-sm">暂无关联素材</p>
                                    ) : publishMaterials.map(m => (
                                        <label key={m.id} className="flex items-center gap-3 p-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                            <input type="checkbox" checked={selectedMaterialIds.includes(m.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedMaterialIds([...selectedMaterialIds, m.id]);
                                                    } else {
                                                        setSelectedMaterialIds(selectedMaterialIds.filter(id => id !== m.id));
                                                    }
                                                }}
                                                className="h-4 w-4 rounded text-blue-600"
                                            />
                                            <span className="text-sm truncate text-slate-900 dark:text-white">{m.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {/* Random mode - count input */}
                            {publishMode === 'random' && (
                                <div className="mb-4">
                                    <label className="text-sm font-medium mb-2 block text-slate-700 dark:text-slate-300">发布数量</label>
                                    <input type="number" min={1} max={publishMaterials.length || 1}
                                        value={randomPublishCount}
                                        onChange={(e) => setRandomPublishCount(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">最多可发布 {publishMaterials.length} 个素材</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setIsPublishDialogOpen(false)}
                                    className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">取消</button>
                                <button onClick={handlePublishWithMaterial} disabled={publishLoading || (publishMode === 'select' && selectedMaterialIds.length === 0)}
                                    className="flex-1 px-4 py-2.5 bg-gradient-primary text-white rounded-lg font-medium disabled:opacity-50 shadow-lg">
                                    {publishLoading ? '发布中...' : '开始发布'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* AI Workflow Dialog */}
            {
                isAIWorkflowDialogOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="w-full max-w-4xl h-[85vh] rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col animate-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-3">
                                    <img src="/logo-v2-1.png" alt="Logo" className="w-10 h-10 object-contain" />
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">AI 工作流生成</h3>
                                        <p className="text-xs text-slate-500">{aiWorkflowProject?.name}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {aiGeneratedPrompt && aiHasStructuredSteps && !aiDialogLoading && (
                                        <button
                                            onClick={handleExecuteWorkflow}
                                            disabled={aiWorkflowExecuting}
                                            className="flex items-center gap-2 bg-gradient-primary text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-all hover:opacity-90 disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>{aiWorkflowExecuting ? 'sync' : 'play_arrow'}</span>
                                            执行工作流
                                        </button>
                                    )}
                                    <button onClick={handleCloseAIWorkflowDialog} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                            </div>

                            {/* Messages Container */}
                            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                                {aiDialogMessages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                            ? 'bg-blue-600 text-white'
                                            : msg.role === 'system'
                                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-sm italic'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                            }`}>
                                            {msg.role === 'assistant' && (
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="material-symbols-outlined text-purple-500" style={{ fontSize: "16px" }}>smart_toy</span>
                                                    <span className="text-xs font-bold text-purple-500">AI 助手</span>
                                                </div>
                                            )}
                                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Loading Indicator */}
                                {aiDialogLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 flex items-center gap-2">
                                            <div className="flex gap-1">
                                                <div className="size-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                <div className="size-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                <div className="size-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                            </div>
                                            <span className="text-sm text-slate-500">AI 正在思考...</span>
                                        </div>
                                    </div>
                                )}

                                {/* Workflow Steps Preview */}
                                {aiWorkflowSteps.length > 0 && (
                                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-outlined text-purple-600" style={{ fontSize: "18px" }}>list_alt</span>
                                            <span className="text-sm font-bold text-purple-700 dark:text-purple-400">工作流步骤预览</span>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {aiWorkflowSteps.map((step, idx) => (
                                                <div key={idx} className="flex items-start gap-3 text-sm">
                                                    <span className="flex-shrink-0 size-6 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 flex items-center justify-center text-xs font-bold">{step.idx || idx + 1}</span>
                                                    <div>
                                                        <span className="font-medium text-slate-900 dark:text-white">{step.action}</span>
                                                        <p className="text-slate-500 text-xs mt-0.5">{step.description}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Execution Logs Panel */}
                                {aiWorkflowLogs.length > 0 && (
                                    <div className="bg-slate-900 dark:bg-slate-950 rounded-xl p-4 border border-slate-700">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-green-500" style={{ fontSize: "18px" }}>terminal</span>
                                                <span className="text-sm font-bold text-slate-300">执行日志</span>
                                            </div>
                                            <span className="text-xs text-slate-500">{aiWorkflowLogs.length} 条</span>
                                        </div>
                                        <div className="max-h-40 overflow-y-auto font-mono text-xs text-slate-400 space-y-1">
                                            {aiWorkflowLogs.slice(-20).map((log, idx) => (
                                                <div key={idx} className={`${log.includes('[Error]') ? 'text-red-400' : log.includes('[System]') ? 'text-blue-400' : log.includes('[Warning]') ? 'text-yellow-400' : ''}`}>
                                                    {log}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Input Area */}
                            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800">
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={aiUserInput}
                                        onChange={(e) => setAIUserInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAISendMessage()}
                                        placeholder="输入您的反馈或修改建议..."
                                        disabled={aiDialogLoading}
                                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                                    />
                                    <button
                                        onClick={handleAISendMessage}
                                        disabled={aiDialogLoading || !aiUserInput.trim()}
                                        className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>send</span>
                                    </button>
                                </div>

                                {/* Action Buttons */}
                                {aiGeneratedPrompt && !aiDialogLoading && (
                                    <div className="flex justify-end gap-3 mt-4">
                                        <button
                                            onClick={handleCloseAIWorkflowDialog}
                                            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                                        >
                                            取消
                                        </button>
                                        <button
                                            onClick={handleAIConfirmWorkflow}
                                            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-sm font-bold hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>check_circle</span>
                                            确认并保存工作流
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

export default App;