# OpenCode Server 开发计划书

## 1. 项目概览 (Project Overview)

**项目名称**: opencode-server
**项目描述**: 基于 Go 语言构建的标准化 AI 代码协作服务端。它将 OpenCode 的核心能力封装为 HTTP API，支持多 Agent 协作 (OmO 架构)、实时通信、文件操作及技能执行。
**技术架构**: Go Standard Layout (根据 Rules 修正版)
**核心能力**:
* **Web 服务化**: 基于 Gin 框架提供 RESTful API，支持标准化调用。
* **OmO 智能体编排**: 移植 Oh My OpenCode 的 Sisyphus 调度模式，支持多 Agent (Manager/Worker) 协作。
* **云原生存储**: 集成 **阿里云 OSS** 进行文件对象的持久化存储与签名访问。
* **技能系统 (Skills)**: 动态加载与执行 Python/Shell 脚本，扩展办公与数据处理能力。
* **实时通信**: 支持 SSE (Server-Sent Events) 事件流与 WebSocket 双向通信。
* **核心功能**: 会话管理、文件操作、工具调用、技能执行。
**当前状态**: 规划中 (Planning)

**开源参考**: [anomalyco/opencode](https://github.com/anomalyco/opencode) - 复刻 OpenCode 改造 HTTP 的开源仓库，本项目基于此进行二次开发。

## 2. 目录结构 (Directory Structure)

> ⚠️ **合规性警告**: 严格遵守 `rules.md`。
> 1.  严禁使用 `internal/` 目录，必须重命名为 `core/`。
> 2.  程序入口 `main.go` 必须位于 **项目根目录**。

```text
opencode-server/
├── main.go               # [Rule] 程序入口 (原 cmd/server/main.go 移至此处)
├── conversation.md       # [Rule] 架构决策记录
├── plan.md               # [Rule] 开发计划与进度
├── go.mod
├── README.md
├── Dockerfile            # 构建文件
├── docker-compose.yml    # 编排文件 (Postgres, Redis, App)
├── configs/              # [Rule] 配置文件目录
│   ├── default.yaml      # 默认配置 (OSS, DB, Redis)
│   ├── production.yaml   # 生产环境配置
│   ├── omo_agents.yaml   # OmO 智能体角色定义
│   └── rate_limits.yaml  # 用户等级限流策略
├── core/                 # [Rule] 核心业务逻辑 (替代 internal)
│   ├── config/           # Viper 配置加载
│   ├── server/           # Gin Server 启动与路由注册
│   ├── handler/          # HTTP 接口处理层 (Controller)
│   │   ├── session.go    # 会话管理接口
│   │   ├── file.go       # 文件/OSS 操作接口
│   │   ├── tool.go       # 工具调用接口
│   │   └── skill.go      # 技能管理接口
│   ├── middleware/       # 中间件 (Auth 复用 server/auth, CORS, RateLimit, Logger)
│   ├── service/          # 业务逻辑层
│   │   ├── session_svc.go
│   │   └── oss_svc.go    # 阿里云 OSS 业务封装
│   ├── omo/              # [核心] Oh My OpenCode 编排引擎
│   │   ├── orchestrator.go # Sisyphus 调度器
│   │   └── agents/       # 智能体实现 (Manager, Oracle, Builder)
│   ├── storage/          # 底层存储适配器
│   │   ├── oss.go        # 阿里云 OSS SDK 封装
│   │   └── database.go   # Postgres 连接池 (pgx/v5)
│   ├── repository/       # 数据访问层 (GORM CRUD)
│   ├── model/            # 数据库模型定义 (structs)
│   ├── runtime/          # 代码执行沙箱 (Docker/gVisor)
│   └── types/            # API 请求/响应结构体定义
├── pkg/                  # 通用工具库 (Public Library)
│   ├── sse/              # SSE 推送工具
│   ├── websocket/        # WS 连接管理
│   ├── logger/           # Zerolog 封装
│   └── utils/
├── skills/               # [核心] 技能脚本仓库
│   ├── builtin/          # 内置技能 (Excel, PDF, Git)
│   └── custom/           # 用户自定义/上传的技能
└── scripts/              # 数据库初始化 SQL 等

## 3. 技术栈与版本 (Tech Stack)

    编程语言: Go 1.24

    Web 框架: Gin 1.9+

    数据库: PostgreSQL 18.1

        驱动: pgx/v5

        ORM: GORM v2

    对象存储: Aliyun OSS (aliyun-oss-go-sdk)

    缓存与限流: Redis 7+

    配置管理: Viper (支持 YAML/JSON/Env)

    日志系统: Zerolog

    参数校验: go-playground/validator

    实时通信: SSE (原生实现) / Gorilla WebSocket

## 4. 用户与认证 (User & Authentication)

### 4.1 认证策略

**复用现有 server 项目的认证模块**，通过以下方式集成：

1. **JWT Token 验证**: 复用 `server/handlers.go` 中的 `authMiddleware()` 逻辑
2. **用户信息获取**: 复用 `meHandler()` 获取用户 ID、余额、角色等信息
3. **权限控制**: 复用现有的角色验证 (`requireRole` 中间件)

### 4.2 认证 API (复用)

| 方法 | 路径 | 功能 | 复用来源 |
|------|------|------|----------|
| POST | `/api/v1/auth/register` | 用户注册 | server/handlers.go |
| POST | `/api/v1/auth/login` | 用户登录 | server/handlers.go |
| GET | `/api/v1/auth/me` | 获取当前用户 | server/handlers.go |

### 4.3 用户相关 API (复用)

| 方法 | 路径 | 功能 | 复用来源 |
|------|------|------|----------|
| POST | `/api/v1/users/change-password` | 修改密码 | server/handlers.go |
| PATCH | `/api/v1/users/settings` | 更新设置 | server/handlers.go |

### 4.4 OSS 凭证 API (复用)

| 方法 | 路径 | 功能 | 复用来源 |
|------|------|------|----------|
| GET | `/api/v1/oss/temp-token` | 获取 STS 临时凭证 | server/handlers.go |
| GET | `/api/v1/oss-credentials` | 获取 OSS 配置 | server/handlers.go |

## 5. 核心功能设计 (Core Features)

### 5.1 会话管理 (Session Management)

基于 OpenCode 核心能力的 AI 对话会话，支持 OmO 多智能体协作。

**数据模型**:
```go
type Session struct {
    ID          string    `gorm:"primaryKey;type:varchar(64)" json:"id"`
    UserID      string    `gorm:"type:varchar(64);index;not null" json:"userId"`
    Agent       string    `gorm:"type:varchar(64);not null" json:"agent"` // general, omo
    ModelID     string    `gorm:"type:varchar(128);not null" json:"modelId"`
    ProviderID  string    `gorm:"type:varchar(64);not null" json:"providerId"`
    System      string    `gorm:"type:text" json:"system,omitempty"`
    Tools       string    `gorm:"type:jsonb" json:"tools"`
    MaxSteps    int       `gorm:"default:100" json:"maxSteps,omitempty"`
    Status      string    `gorm:"type:varchar(32);not null;default:'running'" json:"status"`
    Cwd         string    `gorm:"type:varchar(512)" json:"cwd,omitempty"`
    CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`
    UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}
```

**API 端点**:
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/v1/sessions` | 创建会话 |
| GET | `/api/v1/sessions` | 列出用户会话 |
| GET | `/api/v1/sessions/:id` | 获取会话详情 |
| DELETE | `/api/v1/sessions/:id` | 删除会话 |
| POST | `/api/v1/sessions/:id/prompt` | 发送提示 |
| POST | `/api/v1/sessions/:id/abort` | 中止会话 |

### 5.2 文件操作 (File Operations)

支持本地文件操作和阿里云 OSS 集成。

**API 端点**:
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/v1/files` | 列出文件 |
| GET | `/api/v1/files/read` | 读取文件 |
| POST | `/api/v1/files/write` | 写入文件 |
| PUT | `/api/v1/files/edit` | 编辑文件 |
| GET | `/api/v1/files/glob` | 模式匹配文件 |
| POST | `/api/v1/files/search` | 搜索文件内容 |
| POST | `/api/v1/files/upload` | 上传文件到 OSS |
| GET | `/api/v1/files/download/:key` | 从 OSS 下载 |

### 5.3 工具系统 (Tool System)

可扩展的工具调用框架，支持动态注册和执行。

**内置工具**:
- `bash`: 执行 Shell 命令
- `read`: 读取文件
- `write`: 写入文件
- `edit`: 编辑文件
- `glob`: 模式匹配文件
- `grep`: 搜索文件内容

**API 端点**:
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/v1/tools` | 列出可用工具 |
| POST | `/api/v1/tools/execute` | 执行工具 |

### 5.4 技能系统 (Skills System)

动态加载与执行 Python/Shell 脚本的能力扩展。

**架构**: Loader (加载) -> Registry (注册) -> Executor (执行)

**执行环境**: 通过 core/runtime 调用 Docker 容器执行 Python 脚本

**API 端点**:
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/v1/skills` | 列出所有技能 |
| GET | `/api/v1/skills/:id` | 获取技能详情 |
| POST | `/api/v1/skills/:id/execute` | 执行技能 |
| POST | `/api/v1/skills/register` | 注册自定义技能 |

### 5.5 阿里云 OSS 集成

**功能**: 文件上传、下载、生成临时签名 URL (Presigned URL)

**策略**: 大文件直接通过签名 URL 在客户端与 OSS 间传输

**安全**: AccessKey 通过环境变量注入，禁止硬编码

### 5.6 Oh My OpenCode (OmO) 引擎

**Sisyphus 模式**: 实现任务拆解与分发

**角色**:
- Manager: 负责规划与验收
- Builder: 负责代码编写与文件操作
- Oracle: 负责信息检索与知识问答

### 5.7 实时通信

**SSE 端点**:
```
GET /api/v1/events/sessions/:id  // 会话事件流
```

**WebSocket 端点** (可选):
```
WS /api/v1/ws/sessions/:id       // 会话实时更新
```

## 6. 复用现有功能 (Reuse Existing Features)

### 6.1 直接复用模块

| 模块 | 复用来源 | 说明 |
|------|----------|------|
| 用户认证 | `server/handlers.go` | registerHandler, loginHandler, authMiddleware |
| 用户信息 | `server/handlers.go` | meHandler, updateUserSettingsHandler |
| OSS 凭证 | `server/handlers.go` | getOSSTempTokenHandler, getOssCredentialsHandler |
| 数据模型 | `server/models.go` | User, Organization 结构参考 |
| 数据库连接 | `server/config.go` | PostgreSQL + GORM 配置 |
| Redis 缓存 | `server/user_cache.go` | 用户缓存逻辑 |

### 6.2 需要适配的模块

| 模块 | 适配说明 |
|------|----------|
| 余额系统 | 保留消费逻辑，但简化实现 |
| 组织管理 | 仅保留用户关联，不实现完整组织架构 |
| 项目/任务 | 重构为会话 (Session) 概念 |

## 7. 开发路线图 (Development Roadmap)

### 第一阶段：基础设施与复用 (Week 1)

    [ ] 项目初始化: 创建符合 rules.md 的目录结构 (main.go 在根目录, core/ 目录)

    [ ] 复用现有模块:

        [ ] 复制 server/handlers.go 中的认证逻辑到 core/middleware/auth.go

        [ ] 复制 server/models.go 中的 User 模型到 core/model/user.go

        [ ] 适配数据库连接 (core/storage/database.go)

    [ ] 基础模块: 集成 Viper 配置加载和 Zerolog 日志

### 第二阶段：核心 API 开发 (Week 2)

    [ ] 会话管理: 实现 /api/v1/sessions 的增删改查

    [ ] 文件服务: 实现基于 OSS 的文件上传/下载接口

    [ ] 工具系统: 实现工具注册与执行通用接口

    [ ] 中间件: 实现 JWT 认证 (复用)、CORS 跨域、Request ID 追踪

### 第三阶段：实时通信与限流 (Week 3)

    [ ] SSE 推送: 在 pkg/sse 实现事件流，前端通过 /api/v1/events/sessions/:id 监听

    [ ] WebSocket: (可选) 实现双向实时通道

    [ ] 限流系统: 实现 core/middleware/ratelimit.go

### 第四阶段：OmO 引擎与技能集成 (Week 4)

    [ ] 技能系统: 完成 skills/ 目录扫描与 Python 脚本沙箱执行逻辑

    [ ] OmO 编排: 将 Sisyphus 调度逻辑移植到 core/omo/orchestrator.go

    [ ] 联调: 测试 "用户 -> API -> Sisyphus -> Tool/Skill -> OSS -> 响应" 的完整链路

## 8. 部署配置 (Deployment)

环境变量 (.env 示例):
```bash
SERVER_PORT=3000

# 数据库 (复用现有配置)
DB_DSN="host=postgres user=opencode password=secret dbname=opencode port=5432 sslmode=disable"

# 阿里云 OSS
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_ACCESS_KEY_ID=LTAI5txxxxxxxx
OSS_ACCESS_KEY_SECRET=abC123xxxxxxxx
OSS_BUCKET=opencode-files

# Redis
REDIS_ADDR=redis:6379

# JWT Secret (复用现有配置)
JWT_SECRET=your-jwt-secret-key
```

## 9. 规则合规检查表 (Rules Checklist)

    开发过程中请反复核对：

    [ ] 结构合规: 确认没有创建 internal 文件夹，所有私有逻辑都在 core 下

    [ ] 入口合规: main.go 必须在根目录

    [ ] OSS 安全: 绝对禁止将阿里云 AK/SK 提交到代码库，必须走环境变量

    [ ] 文档更新: 每次架构变更需同步更新 conversation.md

    [ ] 原子性: Redis 操作需保证原子性，使用 Lua 脚本处理复杂限流逻辑

    [ ] 复用原则: 优先复用 server/ 目录下的认证、用户、OSS 凭证等模块
