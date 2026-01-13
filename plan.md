# HyperAgent Desktop：AI 自动化助手开发计划书

> 本项目为「auto-tauri」桌面应用，整合 **Tauri 桌面端外壳**、**HyperAgent 自动化引擎** 与 **Gin + PostgreSQL 积分后端系统**，面向个人与企业用户提供可商业化运营的 AI 自动化浏览器爬虫与网页操作助手。

---
## 0. 项目配置
github： git@github.com:zalsay/auto-tauri.git
使用文档：[usage.md](./usage.md)

## 1. 项目愿景

- 打造一款「自然语言驱动的桌面 AI 爬虫与网页自动化工具」。
- **核心逻辑变更**：引入「项目 (Project)」与「任务 (Task)」分离的概念。
  - **项目 (Project)**：用户定义的自动化模板，包含目标 URL、AI 指令 (Prompt) 和执行逻辑。
  - **任务 (Task)**：项目的每一次具体执行实例。
- 支持多租户用户体系和积分计费模型，为后续 SaaS 化、按量计费和企业授权版打下基础。
- 提供「云端管理 + 本地执行」模式，云端负责账号、积分与任务元数据，桌面端负责实际浏览器执行与结果本地持久化。

---

## 2. 全栈架构设计

整体采用「云端管理 + 本地执行」的混合架构，分为三层：

1. **桌面前端层 (Tauri + Vite + React)**  
   - 主要职责：
     - 登录 / 注册 / 个人中心与积分面板展示。
     - **项目管理**：创建项目模板、编辑项目参数。
     - **任务触发**：从项目列表启动执行，生成新任务。
     - 调用本地 Sidecar 执行任务，展示实时日志与结果预览。

2. **云端后端层 (Golang + Gin + PostgreSQL)**  
   - 主要职责：
     - 用户注册 / 登录 / JWT 鉴权。
     - 用户积分账户管理（`users.balance`）。
     - **项目元数据管理** (`projects` 表)：存储 URL、Prompt 等配置。
     - **任务记录管理** (`tasks` 表)：记录每次执行的状态与消耗。
     - 充值流水与交易记录。

3. **执行层 (Node.js Sidecar + HyperAgent + Playwright)**  
   - 主要职责：
     - 从 Tauri 接收项目配置（URL + Prompt + Schema）。
     - 通过 Playwright 控制浏览器完成网页操作。
     - 回传实时日志与结果 JSON。

---

## 3. 核心技术栈

| 维度       | 技术选型                              | 说明 |
| ---------- | ------------------------------------- | ---- |
| 桌面外壳   | Tauri v2 (Rust)                       | 轻量级跨平台桌面容器 |
| 前端框架   | Vite + React                          | 构建管理后台与执行界面 |
| 自动化引擎 | HyperAgent + Playwright (Node.js)     | 驱动浏览器自动化 |
| 业务后端   | Golang + Gin                          | RESTful API 与业务逻辑 |
| 数据库     | PostgreSQL + Redis                    | 存储配置、状态与原子锁 |

---

## 4. 数据库设计（PostgreSQL）

### 4.1 `users` 表
- `id`：UUID，主键。
- `email`：唯一索引。
- `balance`：积分余额。

### 4.2 `projects` 表（新增核心表）
- `id`：UUID，主键。
- `user_id`：关联用户。
- `name`：项目名称（如「亚马逊竞品监控」）。
- `url`：目标起始地址。
- `prompt`：AI 指令模板。
- `type`：类型（`workflow` / `scrape`）。
- `created_at` / `updated_at`。

### 4.3 `tasks` 表（重定义为执行记录）
- `id`：任务 ID，主键。
- `project_id`：关联所属项目。
- `user_id`：所属用户。
- `status`：执行状态 (`running`, `completed`, `failed`)。
- `cost`：消耗积分。
- `result_path`：本地执行结果存储路径（可选）。
- `created_at`。

---

## 5. 开发阶段规划

### 第一、二阶段：基础设施与后端核心（已完成）
- [x] Tauri 项目初始化与 Sidecar 通信。
- [x] 后端认证 (JWT) 与积分充值系统。
- [x] Redis 原子锁保护余额变动。
- [x] **Auto Agents 自动化发布** (Playwright + XHS)。

### 第三阶段：项目化管理重构（当前任务）
- [ ] **项目管理 API**
  - `POST /api/v1/projects`：创建项目配置。
  - `GET /api/v1/projects`：获取项目列表。
  - `DELETE /api/v1/projects/:id`：删除项目。
- [ ] **执行流重构**
  - 修改 `POST /api/v1/tasks/start`：改为基于 `project_id` 启动。
  - 后端自动从 `projects` 获取配置信息下发给 Sidecar。
- [ ] **前端界面升级**
  - 仪表盘「开始新任务」改为「创建新项目」。
  - 增加「项目列表」页面，每个项目提供「立即执行」按钮。

### 第六阶段：Playwright Agent 对话式代码生成器（进行中）
- [x] **Agent 核心模块** (`playwright-agent/`)
  - [x] 对话解析器 `parser.ts`：自然语言 → 操作意图
  - [x] 代码生成器 `codeGenerator.ts`：操作意图 → Playwright 代码
  - [x] 操作录制器 `actionRecorder.ts`：浏览器事件录制
  - [x] 浏览器管理器 `browserManager.ts`：持久化上下文
  - [x] WebSocket 服务 `wsServer.ts`：实时双向通信
- [x] **前端交互界面** (`desktop/src/`)
  - [x] `AgentStudio.tsx`：左右分栏主页面
  - [x] `ChatPanel.tsx`：对话面板
  - [x] `BrowserPreview.tsx`：浏览器预览 + 代码展示
- [ ] **后端 API**
  - [ ] Agent 会话管理
  - [ ] 脚本存储 (DB/OSS)

### 第四、五阶段：持久化与优化（待进行）
- [ ] 结果本地化存储。
- [x] 自动化结果展示与导出。
  - 已为 HyperAgent Sidecar 定义标准化结果结构（含 `output`、`name`、`content` 字段），便于前端展示与素材中心消费。
  - 已为 HyperAgent 任务启用每步截图与 OSS 上传，并将截图 URL 列表以 JSON 数组形式写入素材中心 `Material.ImageUrls` 字段，用于后续发布与过程回溯。
- [ ] 性能优化与打包发布。

---

## 6. 关键业务逻辑示例（基于项目的执行）

```go
// POST /api/v1/tasks/execute
func ExecuteProjectHandler(c *gin.Context) {
    userID := c.MustGet("userID").(string)
    projectID := c.PostForm("project_id")
    
    // 1. 获取项目配置
    var project Project
    db.Where("id = ? AND user_id = ?", projectID, userID).First(&project)

    // 2. 扣费并生成任务记录 (事务)
    taskID := uuid.NewString()
    err := db.Transaction(func(tx *gorm.DB) error {
        // ... 检查余额 -> 扣费 -> 创建 Task 记录 ...
        return nil
    })

    // 3. 返回 taskID，前端启动 Sidecar 并传入 project 配置
    c.JSON(http.StatusOK, gin.H{"task_id": taskID, "config": project})
}
```
