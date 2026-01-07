// 类型定义

/** WebSocket 消息类型 */
export type MessageType =
    | 'user_input'        // 用户输入
    | 'agent_action'      // Agent 执行动作
    | 'browser_event'     // 浏览器事件
    | 'code_update'       // 代码更新
    | 'error'             // 错误信息
    | 'session_init'      // 会话初始化
    | 'auth'              // 认证消息
    | 'loading'           // 加载状态
    | 'confirm_generate'  // 确认生成代码
    | 'confirm_execute';  // 确认执行代码

/** WebSocket 消息结构 */
export interface WSMessage {
    type: MessageType;
    payload: any;
    timestamp: number;
}

/** 用户操作意图 */
export interface ActionIntent {
    action: 'navigate' | 'click' | 'fill' | 'select' | 'wait' | 'screenshot' | 'scroll';
    selector?: string;
    value?: string;
    url?: string;
    description: string;
}

/** 对话消息 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    codeSnippet?: string;
}

/** Agent 工作流阶段 */
export type AgentPhase =
    | 'discussing'         // 讨论需求阶段
    | 'ready_to_generate'  // 可以生成代码
    | 'generating'         // 正在生成代码
    | 'generated'          // 代码已生成，等待执行确认
    | 'executing'          // 正在执行
    | 'completed';         // 执行完成

/** 流程记录 */
export interface FlowRecord {
    id: string;
    userId: string;
    requirement: string;           // 用户原始需求
    discussion: string[];          // 讨论内容
    generatedCode: string;         // 生成的代码
    executionResult?: string;      // 执行结果
    createdAt: number;
    updatedAt: number;
}

/** Agent 会话 */
export interface AgentSession {
    id: string;
    userId: string;
    authToken: string;
    phase: AgentPhase;             // 当前阶段
    flowRecord: FlowRecord | null; // 流程记录
    lastGeneratedCode: string;     // 最近生成的代码
    messages: ChatMessage[];
    actions: ActionIntent[];
    generatedCode: string;
    createdAt: number;
    updatedAt: number;
}

/** 浏览器状态 */
export interface BrowserState {
    url: string;
    title: string;
    isLoading: boolean;
    screenshot?: string;
}

/** 脚本存储记录 */
export interface ScriptRecord {
    id: string;
    userId: string;
    name: string;
    description: string;
    code: string;
    storageType: 'database' | 'oss';
    ossUrl?: string;
    createdAt: number;
    updatedAt: number;
}
