# 任务大师 (Mission Master) 全流程开发规范

> Auto-Tauri AI 开发助手 - 架构与工作流程文档

## 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                      任务大师架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                               │
│  │ 前端 UI      │                                               │
│  │ (React)      │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │ MasterAgent  │  ← 任务调度中心                                │
│  │ (前端)       │    1. 读取配置                                 │
│  └──────┬───────┘    2. 构建 opencode 命令                      │
│         │            3. 解析输出                                 │
│         │            4. 保存文件                                 │
│         ▼                                                       │
│  ┌──────────────┐     ┌──────────────────────────────────┐     │
│  │ Tauri Commands│    │ OpenCode CLI                    │     │
│  │ (Rust 后端)   │ ──▶│ 1. 读取 skill 文件              │     │
│  └──────────────┘     │ 2. 调用 LLM (Anthropic/OpenAI)  │     │
│                       │ 3. 生成开发计划/测试计划          │     │
│                       │ 4. 输出到 stdout                 │     │
│                       └──────────────────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 核心原则

1. **MasterAgent 是调度器** - 不直接调用 LLM，只负责：
   - 读取配置
   - 构建 opencode 命令
   - 执行命令
   - 解析输出
   - 保存文件

2. **OpenCode CLI 负责 LLM 调用** - 真正的 AI 逻辑在 opencode 命令行中

3. **职责分离** - 前端只做调度，后端只做执行

---

## 工作流阶段

```
┌─────────────────────────────────────────────────────────────────┐
│                    任务大师全流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  阶段 1        阶段 2        阶段 3        阶段 4        阶段 5  │
│  初始化    →  需求分析  →  计划生成  →  功能开发  →  项目交付  │
│                                                                  │
│  ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐          │
│  │ 15%  │   │ 30%  │   │ 50%  │   │ 75%  │   │ 100% │          │
│  └──────┘   └──────┘   └──────┘   └──────┘   └──────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 阶段 1: 初始化 (15%)

| 步骤 | 操作 | 命令/工具 | 输出 |
|------|------|-----------|------|
| 1.1 | 显示启动信息 | UI | 项目名称、路径、模式 |
| 1.2 | 验证目录 | `pwd && ls -la` | 目录存在性 |
| 1.3 | 加载配置 | `get_coding_master_config` | API 配置 |

**输出**: 确认环境就绪

---

### 阶段 2: 需求分析 (30%)

| 步骤 | 操作 | 命令/工具 | 输出 |
|------|------|-----------|------|
| 2.1 | 读取需求 | `cat prompt` | 用户需求 |
| 2.2 | 分析技术栈 | `cat package.json` | 技术栈信息 |
| 2.3 | 生成摘要 | **opencode** | 需求概要 |

**OpenCode 命令**:
```bash
opencode --title "需求分析" --model <model> --prompt "<需求描述>"
```

---

### 阶段 3: 计划生成 (50%)

| 步骤 | 操作 | 命令/工具 | 输出 |
|------|------|-----------|------|
| 3.1 | 执行规划 skill | **opencode** | 开发计划 |
| 3.2 | 保存开发计划 | `save_plan_file` | `specs/develop_plan.md` |
| 3.3 | 保存测试计划 | `save_plan_file` | `specs/testing_plan.md` |
| 3.4 | 生成步骤 JSON | `generate_dev_steps` | `specs/dev_steps.json` |

**OpenCode 命令**:
```bash
opencode --title "全流程开发" \
  --model <model> \
  --skill _skills/specification-planning/SKILL.md \
  --prompt "<项目需求>"
```

**输出文件**:
- `specs/develop_plan.md`
- `specs/testing_plan.md`
- `specs/dev_steps.json`

---

### 阶段 4: 功能开发 (75%)

| 步骤 | 操作 | 命令/工具 | 输出 |
|------|------|-----------|------|
| 4.1 | 创建目录 | `mkdir -p` | src/, tests/, specs/ |
| 4.2 | 执行开发 | **opencode** | 源代码 |
| 4.3 | 保存代码 | `save_plan_file` | 源码文件 |
| 4.4 | 更新步骤状态 | `mark_step_completed` | 进度更新 |

**OpenCode 命令**:
```bash
opencode --title "功能开发" \
  --model <model> \
  --skill _skills/coding/SKILL.md \
  --prompt "实现 Step <n>: <步骤描述>"
```

**输出文件**:
- 源码文件 (src/**/*.{ts,tsx,rs,py,etc})

---

### 阶段 5: 项目交付 (100%)

| 步骤 | 操作 | 命令/工具 | 输出 |
|------|------|-----------|------|
| 5.1 | 运行测试 | `npm test` / `cargo test` | 测试报告 |
| 5.2 | 生成文档 | `save_plan_file` | README.md |
| 5.3 | 整理结构 | `tree` | 项目结构 |
| 5.4 | 完成总结 | UI | 完成状态 |

**输出文件**:
- `README.md`
- 测试报告
- 项目结构报告

---

## OpenCode CLI 详细说明

### 命令格式

```bash
opencode [OPTIONS]

Options:
  --title <TEXT>        会话标题
  --model <MODEL>       模型名称 (如 anthropic/claude-3-5-sonnet)
  --skill <PATH>        Skill 文件路径
  --prompt <TEXT>       用户提示词
  --system <TEXT>       系统提示词
  --output <PATH>       输出文件路径
  --stream              启用流式输出
  --help                显示帮助
```

### 完整示例

```bash
# 需求分析
opencode --title "需求分析" \
  --model anthropic/claude-3-5-sonnet-20241022 \
  --prompt "分析以下需求并生成技术方案：..."

# 计划生成
opencode --title "全流程开发" \
  --model anthropic/claude-3-5-sonnet-20241022 \
  --skill _skills/specification-planning/SKILL.md \
  --prompt "项目名称：知乎热门AI查询\n需求：..."

# 功能开发
opencode --title "Step 1" \
  --model anthropic/claude-3-5-sonnet-20241022 \
  --prompt "实现用户认证模块，包括..."
```

### Skill 文件

| Skill | 路径 | 用途 |
|-------|------|------|
| specification-planning | `_skills/specification-planning/SKILL.md` | 需求分析与计划生成 |
| coding | `_skills/coding/SKILL.md` | 代码生成 |
| testing | `_skills/testing/SKILL.md` | 测试用例生成 |

---

## 配置说明

### 配置文件位置

```
~/.opencode/config.json
```

### 配置格式

```json
{
  "provider": {
    "anthropic": {
      "api_key": "sk-ant-api03-..."
    },
    "openai": {
      "api_key": "sk-..."
    }
  },
  "model": "anthropic/claude-3-5-sonnet-20241022",
  "small_model": "anthropic/claude-3-haiku-20240307",
  "expert_model": {
    "provider": "anthropic",
    "model": "anthropic/claude-sonnet-4-20250514"
  }
}
```

### 模式选择

| 模式 | 使用配置 | 适用场景 |
|------|----------|----------|
| 标准模式 | `model` / `small_model` | 简单任务 |
| 专家模式 | `expert_model` | 复杂任务 |

---

## MasterAgent 实现

### 前端职责

```typescript
// MasterAgent.tsx
interface MasterAgentProps {
    projectPath: string;
    projectName: string;
    prompt: string;
    codingMode: 'standard' | 'expert';
    codingConfig: CodingMasterConfig;
}

// 核心流程
const runCurrentTask = async () => {
    switch (workflowStage) {
        case 'init':
            // 初始化环境
            await executeCommand('pwd && ls -la');
            break;
            
        case 'analysis':
            // 需求分析
            const analysisCmd = `opencode --title "需求分析" --model ${model} --prompt "${prompt}"`;
            await executeCommand(analysisCmd);
            break;
            
        case 'planning':
            // 计划生成 - 使用 skill
            const planningCmd = `opencode --title "全流程开发" \
              --model ${model} \
              --skill _skills/specification-planning/SKILL.md \
              --prompt "${prompt}"`;
            await executeCommand(planningCmd);
            // 解析并保存输出
            await savePlanFiles();
            break;
            
        case 'development':
            // 功能开发
            const devCmd = `opencode --title "功能开发" \
              --model ${model} \
              --prompt "实现开发计划中的 Step ${currentStep}..."`;
            await executeCommand(devCmd);
            break;
    }
};
```

### Rust 后端职责

```rust
// lib.rs - Tauri Commands

#[tauri::command]
async fn execute_opencode_command(
    title: String,
    model: String,
    skill: Option<String>,
    prompt: String,
    working_dir: String,
) -> Result<OpenCodeResult, String> {
    // 1. 构建 opencode 命令
    let mut cmd = std::process::Command::new("opencode");
    cmd.arg("--title").arg(&title);
    cmd.arg("--model").arg(&model);
    
    if let Some(skill_path) = skill {
        cmd.arg("--skill").arg(&skill_path);
    }
    
    cmd.arg("--prompt").arg(&prompt);
    cmd.current_dir(&working_dir);
    
    // 2. 执行命令
    let output = cmd.output().await?;
    
    // 3. 解析输出
    Ok(OpenCodeResult {
        success: output.status.success(),
        output: String::from_utf8_lossy(&output.stdout).to_string(),
        error: if !output.status.success() {
            Some(String::from_utf8_lossy(&output.stderr).to_string())
        } else {
            None
        },
    })
}
```

---

## 输出文件结构

```
<project>/
├── src/                    # 源代码
│   ├── main.ts/rs
│   ├── components/
│   └── utils/
├── specs/                  # 计划文件
│   ├── develop_plan.md    # 开发计划
│   ├── testing_plan.md    # 测试计划
│   └── dev_steps.json     # 开发步骤 (JSON)
├── tests/                  # 测试文件
│   └── *.test.ts
├── node_modules/           # 依赖
├── package.json           # 项目配置
├── README.md              # 项目文档
└── Cargo.toml (Rust)      # Rust 配置
```

---

## 错误处理

| 错误类型 | 处理方式 |
|----------|----------|
| OpenCode 未安装 | 提示用户安装 |
| 配置缺失 | 使用默认值或提示配置 |
| API 错误 | 重试或切换模型 |
| 文件不存在 | 跳过或创建 |
| 命令超时 | 中断并提示 |

---

## 最佳实践

1. **配置优先** - 确保 ~/.opencode/config.json 正确配置
2. **分步执行** - 每个阶段独立执行，便于调试
3. **实时输出** - 使用流式输出显示进度
4. **文件保存** - 每个阶段完成后立即保存文件
5. **可恢复性** - 支持中断后继续执行

---

## 常见问题

**Q: MasterAgent 如何执行 OpenCode 命令?**
A: 通过 Rust 后端的 `execute_sandbox_command` 调用

**Q: LLM 调用在哪里进行?**
A: 在 OpenCode CLI 内部进行，MasterAgent 不直接调用 LLM

**Q: 如何切换模型?**
A: 在项目工作区切换"标准模式"或"专家模式"

**Q: 计划生成失败怎么办?**
A: 检查 skill 文件路径，确认配置正确，查看控制台日志

---

## 版本信息

- **版本**: 2.0.0
- **更新**: 2026-01-30
- **框架**: Tauri 2.x + React + Rust
- **架构**: 调度器模式 (MasterAgent → OpenCode → LLM)
