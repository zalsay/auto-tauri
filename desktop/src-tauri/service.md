# 桌面应用程序服务文档

## 概述

这是一个基于 Tauri 的桌面应用程序，使用 Rust 编写，作为 AI 驱动的开发任务管理系统。它集成了多个 AI 编码代理（OpenCode、Ralph、hyperagent、xhs-agent），帮助开发者高效管理和执行开发任务。

## 项目结构

```
src-tauri/
├── Cargo.toml                 # Rust 包配置
├── tauri.conf.json            # Tauri 应用配置
├── build.rs                   # 构建脚本
├── capabilities/
│   └── default.json           # Tauri 权限配置
├── gen/
│   └── schemas/               # 生成的 schema 文件
├── binaries/                  # 外部代理二进制文件
│   ├── hyperagent-aarch64-apple-darwin
│   └── xhs-agent-aarch64-apple-darwin
├── icons/                     # 应用图标
└── src/
    ├── main.rs               # 应用入口
    ├── lib.rs                # 库根目录，定义 Tauri 命令
    └── infra/                # 核心基础设施模块
        ├── mod.rs            # 模块声明
        ├── env.rs            # 环境工具
        ├── doctor.rs         # 系统健康检查
        ├── runner.rs         # 进程生成工具
        ├── ralph.rs          # Ralph 代理集成
        ├── opencode.rs       # OpenCode 代理集成 (CLI)
        ├── opencode_api.rs   # OpenCode Local Server API 客户端
        ├── router.rs         # 任务路由/分发
        ├── parser.rs         # PRD 解析
        ├── planner.rs        # 开发/测试计划
        └── utils.rs          # 通用工具函数
```

## 核心模块

### 1. 环境模块 (`src/infra/env.rs`)

**用途**: 修复 GUI 应用程序的 PATH 环境变量。

**主要功能**:
- 检测操作系统并补充缺失的路径（Homebrew、nvm、cargo）
- 检测 nvm 管理的 Node.js 安装
- 确保 CLI 工具在 GUI 上下文中可被发现

**主要函数**:
- `fix_path_env()` - 返回包含常用工具位置的修正 PATH

### 2. 系统医生模块 (`src/infra/doctor.rs`)

**用途**: 检查系统健康状况并提供安装帮助。

**主要功能**:
- 检查必需工具: git、node、ralph、opencode
- 打开系统终端进行工具安装
- 跨平台终端生成（macOS、Linux、Windows）

**主要函数**:
- `check_system_health()` - 返回包含工具可用性的 `SystemHealth` 结构体
- `install_tool_in_terminal(tool_name)` - 打开带有安装脚本的终端

**数据结构**:
```rust
SystemHealth {
    git_installed: bool,
    git_path: Option<String>,
    node_installed: bool,
    node_path: Option<String>,
    ralph_installed: bool,
    ralph_path: Option<String>,
    opencode_installed: bool,
    opencode_path: Option<String>,
}
```

### 3. OpenCode 集成 (`src/infra/opencode.rs`)

**用途**: 轻量级并行任务执行器，用于快速修复和重构（CLI 方式）。

**主要功能**:
- 基于信号量的工作池并发控制（最多 3 个并发任务）
- 文件级锁防止并发修改
- 通过 Tauri 事件流式输出
- 非交互模式，自动应用

**主要函数**:
- `spawn_opencode_task(request)` - 使用文件隔离生成 OpenCode 任务
- `get_opencode_status()` - 返回当前运行器状态

### 4. OpenCode API 客户端 (`src/infra/opencode_api.rs`)

**用途**: 通过 HTTP API 调用 local-server 中的 OpenCode 服务。

**主要功能**:
- HTTP 客户端封装
- 会话管理
- 消息发送与接收
- 超时控制（120秒）

**主要函数**:
- `new()` - 创建 HTTP 客户端
- `health_check()` - 健康检查
- `create_session(title)` - 创建新会话
- `send_message(session_id, text)` - 发送消息
- `run_prompt(prompt, title)` - 快捷方法：创建会话并发送 prompt

**API 端点**:
- `http://127.0.0.1:54096` - OpenCode local server
- `POST /session` - 创建会话
- `POST /session/{id}/message` - 发送消息
- `GET /global/health` - 健康检查

**数据结构**:
```rust
OpenCodeTaskRequest {
    file_path: String,
    prompt: String,
    working_dir: String,
}

OpenCodeStatus {
    active_tasks: usize,
    max_concurrent: usize,
    locked_files: Vec<String>,
}

OpenCodeTaskResult {
    success: bool,
    file_path: String,
    output: String,
    error: Option<String>,
}
```

### 4. Ralph 集成 (`src/infra/ralph.rs`)

**用途**: 管理复杂的架构编码任务。

**主要功能**:
- 同步计划到 `.ralph/@fix_plan.md`
- 通过解析计划和日志监控进度
- 打开终端手动执行 Ralph
- 锁文件检测活动会话

**主要函数**:
- `sync_ralph_plan(project_path, tasks)` - 将任务写为 markdown 复选框
- `get_ralph_progress(project_path)` - 返回进度状态
- `is_ralph_active(project_path)` - 检查活动会话
- `open_terminal_at(path)` - 在指定路径打开系统终端

**数据结构**:
```rust
RalphProgress {
    total: usize,
    completed: usize,
    percent: f32,
    last_log: String,
    is_active: bool,
}
```

### 5. 任务路由器 (`src/infra/router.rs`)

**用途**: 智能任务分发器，将任务路由到适当的代理。

**主要功能**:
- 使用 AI 分类任务复杂度
- 复杂/多文件任务路由到 Ralph
- 简单/单文件任务路由到 OpenCode
- 附加到 Ralph 计划或直接执行

**主要函数**:
- `classify_task(task_description)` - 确定代理类型
- `smart_dispatch_task(project_path, task_description, file_path)` - 路由任务

**代理类型**:
- `Ralph` - 复杂、多文件、架构任务
- `OpenCode` - 简单、单文件、具体修复

### 6. PRD 解析器 (`src/infra/parser.rs`)

**用途**: 从产品需求文档中提取可执行任务，以及补充现有计划和开发进度追踪。

**主要功能**:
- 读取 PRD 文件（Markdown 或纯文本）
- 使用 OpenCode 解析为原子任务
- 返回任务 JSON 数组
- 补充现有开发计划和测试计划
- 解析 Step-by-Step Implementation 提取开发步骤
- 追踪每个步骤的完成状态

**主要函数**:
- `extract_tasks_from_prd(file_path)` - 返回任务字符串向量
- `supplement_plan_from_prd(prd_file_path, project_path)` - 补充开发计划
- `supplement_test_plan_from_prd(prd_file_path, project_path)` - 补充测试计划
- `parse_development_steps(project_path)` - 解析开发步骤并返回进度
- `mark_step_completed(project_path, step_id)` - 标记步骤完成
- `mark_step_skipped(project_path, step_id)` - 标记步骤跳过
- `reset_steps(project_path)` - 重置所有步骤状态

**数据结构**:
```rust
DevelopmentStep {
    id: usize,
    title: String,
    content: String,
    status: StepStatus,  // pending, in_progress, completed, skipped
}

DevelopmentProgress {
    total_steps: usize,
    completed_steps: usize,
    skipped_steps: usize,
    percent: f64,
    steps: Vec<DevelopmentStep>,
}
```

**保存文件**:
- `<project_path>/specs/dev_steps.json` - 步骤状态 JSON

### 7. 规划器模块 (`src/infra/planner.rs`)

**用途**: 生成开发和测试计划。

**主要功能**:
- 从 `local-server/.opencode/skills/specification-planning/SKILL.md` 读取 skill
- 将 skill 定义发送给 OpenCode Agent
- Agent 按 skill 定义的流程执行
- 支持复杂度分析和路由（Ralph vs OpenCode）
- 保存计划到 `specs/` 目录

**主要函数**:
- `read_skill_content(skill_name)` - 读取 skill 文件内容
- `generate_dev_plan(task_description, project_path)` - 使用 skill 生成开发计划
- `generate_test_plan(dev_plan_content, project_path)` - 使用 skill 生成测试计划

**Skill 安装位置**:
```
local-server/
└── .opencode/
    └── skills/
        └── specification-planning/
            └── SKILL.md  # Skill 定义（供 OpenCode 发现）
```

**工作流程**:
```
前端调用 generate_dev_plan()
    ↓
读取 local-server/.opencode/skills/specification-planning/SKILL.md
    ↓
将 skill 名称和定义发送给 OpenCode Agent
    ↓
Agent 加载 skill 并执行：
    1. 复杂度分析
    2. 选择 Ralph 或 OpenCode
    3. 生成 develop_plan.md
    4. 保存到对应路径
```

### 8. 运行器模块 (`src/infra/runner.rs`)

**用途**: CLI 代理的统一进程生成工具。

**主要功能**:
- 使用修正的 PATH 环境生成代理进程
- 配置 FORCE_COLOR 和 CI 模式
- 返回 Child 进程用于监控
- 支持一次性命令执行

**主要函数**:
- `spawn_agent_process(config)` - 使用配置生成代理进程
- `run_agent_command(command, args, working_dir)` - 快速执行
- `create_agent_command(command, working_dir)` - 命令构建器

### 9. 工具模块 (`src/infra/utils.rs`)

**用途**: 通用工具函数。

**主要功能**:
- 从终端输出中剥离 ANSI 转义码
- 清理文本以便在 Web UI 中显示

**主要函数**:
- `strip_ansi_codes(text)` - 移除颜色代码和格式

## Tauri 命令

以下命令暴露给前端：

| 命令 | 模块 | 描述 |
|---------|--------|-------------|
| `greet` | lib.rs | 基本问候函数 |
| `check_system_health` | doctor.rs | 检查工具可用性 |
| `install_tool_in_terminal` | doctor.rs | 安装缺失工具 |
| `spawn_opencode_task` | opencode.rs | 执行 OpenCode 任务 |
| `get_opencode_status` | opencode.rs | 获取 OpenCode 运行器状态 |
| `sync_ralph_plan` | ralph.rs | 同步任务到 Ralph 计划 |
| `get_ralph_progress` | ralph.rs | 获取 Ralph 进度 |
| `open_terminal_at` | ralph.rs | 在路径打开终端 |
| `is_ralph_active` | ralph.rs | 检查 Ralph 会话状态 |
| `smart_dispatch_task` | router.rs | 智能任务路由 |
| `extract_tasks_from_prd` | parser.rs | 解析 PRD 为任务 |
| `generate_dev_plan` | planner.rs | 生成开发计划 |
| `generate_test_plan` | planner.rs | 生成测试计划 |
| `supplement_plan_from_prd` | parser.rs | 从 PRD 补充开发计划 |
| `supplement_test_plan_from_prd` | parser.rs | 从 PRD 补充测试计划 |
| `parse_development_steps` | parser.rs | 解析开发计划步骤 |
| `mark_step_completed` | parser.rs | 标记步骤完成 |
| `mark_step_skipped` | parser.rs | 标记步骤跳过 |
| `reset_steps` | parser.rs | 重置所有步骤 |

## 依赖

### 核心依赖
- `tauri` (v2) - 桌面应用框架
- `tauri-plugin-opener` (v2) - URL 打开支持
- `tauri-plugin-dialog` (v2) - 对话框支持
- `tauri-plugin-shell` (v2.3.3) - shell 命令

### 异步与处理
- `tokio` - 异步运行时，包含 sync、process、io 工具
- `lazy_static` - 静态延迟初始化
- `reqwest` - HTTP 客户端，用于调用 OpenCode local server API

### 数据处理
- `serde` / `serde_json` - 序列化/反序列化

## 配置

### Tauri 配置 (`tauri.conf.json`)
- **产品名称**: 任务大师 仪表盘
- **窗口大小**: 1280x800 像素
- **前端**: 从 `../dist` 提供
- **开发服务器**: http://localhost:1420
- **打包**: 支持所有平台，带图标

### 权限
- Shell 执行/生成权限用于 `binaries/hyperagent` 和 `binaries/xhs-agent`
- Shell stdin-write 用于代理通信
- 对话框和打开器权限

## 外部二进制文件

应用程序将两个外部代理作为侧车二进制文件打包：

1. **hyperagent** - 用于复杂任务的高性能 AI 代理
2. **xhs-agent** - 专用代理（可能用于社交/内容任务）

## 平台支持

应用程序支持：
- **macOS**（主要）: Terminal.app、Homebrew 路径、Apple Silicon
- **Linux**: GNOME Terminal、Konsole、XFCE4 Terminal、xterm
- **Windows**: CMD.exe

## 工作流程示例

1. **系统检查**: 用户打开应用，`check_system_health()` 验证工具
2. **任务输入**: 用户提供任务描述或 PRD 文件
3. **任务分类**: `smart_dispatch_task()` 使用 OpenCode API 分类
4. **路由**:
   - 复杂 → Ralph 计划 (`sync_ralph_plan`)
   - 简单 → OpenCode 执行 (`spawn_opencode_task`)
5. **进度跟踪**: `get_ralph_progress()` 或 `get_opencode_status()`
6. **计划生成**: `generate_dev_plan()` 和 `generate_test_plan()` 通过 OpenCode API 调用 local-server 生成

## OpenCode local-server 集成

### 启动 local-server
```bash
cd local-server
npm install
npm run serve
```

### API 调用流程
```
前端调用 generate_dev_plan()
    ↓
读取 _skills/specification-planning/SKILL.md
    ↓
HTTP POST http://127.0.0.1:54096/session (创建会话)
    ↓
HTTP POST /session/{id}/message (发送 prompt)
    ↓
保存到 specs/develop_plan.md
```

## 错误处理

- 所有命令返回 `Result<T, String>` 用于错误传播
- 进程生成前验证路径
- 检查文件锁防止并发编辑
- 优雅处理缺失工具

## 测试

每个模块包含单元测试：
- `doctor.rs`: 系统健康检查测试
- `ralph.rs`: 计划同步和进度解析测试
- `opencode.rs`: 文件锁和状态测试
- `router.rs`: 代理类型分类测试
- `env.rs`: PATH 修复测试
- `utils.rs`: ANSI 代码剥离测试
- `runner.rs`: 进程生成测试

运行测试:
```bash
cargo test
```
