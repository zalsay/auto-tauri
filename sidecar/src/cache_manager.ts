import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * HyperAgent Cache Manager
 * 
 * Manages session state persistence for AI workflow generation.
 * Stores conversation history, workflow steps, and browser state.
 */

const CACHE_BASE_DIR = path.join(os.homedir(), '.auto-tauri', 'hyperagent-cache');

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
}

export interface WorkflowStep {
    idx: number;
    action: string;
    description: string;
    status: 'pending' | 'completed' | 'failed';
    screenshotUrl?: string;
}

export interface BrowserState {
    cookies?: any[];
    localStorage?: Record<string, string>;
    currentUrl?: string;
}

export interface SessionCache {
    projectId: string;
    taskId?: string;
    createdAt: string;
    updatedAt: string;
    status: 'generating' | 'pending_confirm' | 'confirmed' | 'cancelled';
    conversationHistory: ConversationMessage[];
    workflowSteps: WorkflowStep[];
    generatedPrompt?: string;
    browserState?: BrowserState;
}

/**
 * Ensures the cache directory exists for a given project
 */
function ensureCacheDir(projectId: string): string {
    const cacheDir = path.join(CACHE_BASE_DIR, projectId);
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    return cacheDir;
}

/**
 * Gets the cache file path for a project
 */
function getCachePath(projectId: string): string {
    return path.join(ensureCacheDir(projectId), 'session.json');
}

/**
 * Saves session cache to disk
 */
export async function saveCache(projectId: string, cache: SessionCache): Promise<void> {
    const cachePath = getCachePath(projectId);
    cache.updatedAt = new Date().toISOString();

    await fs.promises.writeFile(
        cachePath,
        JSON.stringify(cache, null, 2),
        'utf-8'
    );

    console.error(JSON.stringify({
        type: 'log',
        message: `[CacheManager] Cache saved for project ${projectId}`,
        timestamp: new Date().toISOString()
    }));
}

/**
 * Loads session cache from disk
 */
export async function loadCache(projectId: string): Promise<SessionCache | null> {
    const cachePath = getCachePath(projectId);

    if (!fs.existsSync(cachePath)) {
        console.error(JSON.stringify({
            type: 'log',
            message: `[CacheManager] No cache found for project ${projectId}`,
            timestamp: new Date().toISOString()
        }));
        return null;
    }

    try {
        const data = await fs.promises.readFile(cachePath, 'utf-8');
        const cache = JSON.parse(data) as SessionCache;

        console.error(JSON.stringify({
            type: 'log',
            message: `[CacheManager] Cache loaded for project ${projectId}, status: ${cache.status}`,
            timestamp: new Date().toISOString()
        }));

        return cache;
    } catch (e: any) {
        console.error(JSON.stringify({
            type: 'log',
            message: `[CacheManager] Failed to load cache: ${e.message}`,
            timestamp: new Date().toISOString()
        }));
        return null;
    }
}

/**
 * Clears session cache for a project
 */
export async function clearCache(projectId: string): Promise<void> {
    const cachePath = getCachePath(projectId);

    if (fs.existsSync(cachePath)) {
        await fs.promises.unlink(cachePath);
        console.error(JSON.stringify({
            type: 'log',
            message: `[CacheManager] Cache cleared for project ${projectId}`,
            timestamp: new Date().toISOString()
        }));
    }
}

/**
 * Creates a new session cache
 */
export function createNewCache(projectId: string, taskId?: string): SessionCache {
    const now = new Date().toISOString();
    return {
        projectId,
        taskId,
        createdAt: now,
        updatedAt: now,
        status: 'generating',
        conversationHistory: [],
        workflowSteps: []
    };
}

/**
 * Adds a message to the conversation history
 */
export function addMessage(
    cache: SessionCache,
    role: 'user' | 'assistant' | 'system',
    content: string
): SessionCache {
    cache.conversationHistory.push({
        role,
        content,
        timestamp: new Date().toISOString()
    });
    return cache;
}

/**
 * Updates workflow steps in the cache
 */
export function updateWorkflowSteps(
    cache: SessionCache,
    steps: WorkflowStep[]
): SessionCache {
    cache.workflowSteps = steps;
    return cache;
}

/**
 * Gets a summary of the conversation for context
 */
export function getConversationSummary(cache: SessionCache): string {
    if (cache.conversationHistory.length === 0) {
        return '';
    }

    return cache.conversationHistory
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');
}

/**
 * Checks if cache exists and is valid for continuation
 */
export async function canContinue(projectId: string): Promise<boolean> {
    const cache = await loadCache(projectId);
    if (!cache) return false;

    // Can continue if status is generating or pending confirmation
    return cache.status === 'generating' || cache.status === 'pending_confirm';
}
