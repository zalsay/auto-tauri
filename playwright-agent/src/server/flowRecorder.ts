/**
 * 流程记录器
 * 记录 Agent 操作流程到本地文件
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { FlowRecord } from '../types';

const FLOWS_DIR = path.join(os.homedir(), '.auto-tauri', 'flows');

/**
 * 确保流程目录存在
 */
async function ensureFlowsDir(): Promise<void> {
    try {
        await fs.mkdir(FLOWS_DIR, { recursive: true });
    } catch (error) {
        // 目录已存在
    }
}

/**
 * 创建新的流程记录
 */
export async function createFlowRecord(userId: string, requirement: string): Promise<FlowRecord> {
    await ensureFlowsDir();

    const record: FlowRecord = {
        id: uuidv4(),
        userId,
        requirement,
        discussion: [],
        generatedCode: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    await saveFlowRecord(record);
    return record;
}

/**
 * 保存流程记录到文件
 */
export async function saveFlowRecord(record: FlowRecord): Promise<void> {
    await ensureFlowsDir();

    const filePath = path.join(FLOWS_DIR, `${record.id}.json`);
    record.updatedAt = Date.now();

    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
    console.log(`流程记录已保存: ${filePath}`);
}

/**
 * 添加讨论内容
 */
export async function addDiscussion(record: FlowRecord, content: string): Promise<FlowRecord> {
    record.discussion.push(content);
    await saveFlowRecord(record);
    return record;
}

/**
 * 保存生成的代码
 */
export async function saveGeneratedCode(record: FlowRecord, code: string): Promise<FlowRecord> {
    record.generatedCode = code;
    await saveFlowRecord(record);
    return record;
}

/**
 * 保存执行结果
 */
export async function saveExecutionResult(record: FlowRecord, result: string): Promise<FlowRecord> {
    record.executionResult = result;
    await saveFlowRecord(record);
    return record;
}

/**
 * 获取流程记录
 */
export async function getFlowRecord(id: string): Promise<FlowRecord | null> {
    try {
        const filePath = path.join(FLOWS_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

/**
 * 列出所有流程记录
 */
export async function listFlowRecords(userId?: string): Promise<FlowRecord[]> {
    await ensureFlowsDir();

    try {
        const files = await fs.readdir(FLOWS_DIR);
        const records: FlowRecord[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(FLOWS_DIR, file), 'utf-8');
                const record = JSON.parse(content) as FlowRecord;
                if (!userId || record.userId === userId) {
                    records.push(record);
                }
            }
        }

        return records.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
        return [];
    }
}
