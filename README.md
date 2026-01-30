# Auto-Tauri

> AI 自动化助手开发平台 - 自然语言驱动的桌面 AI 爬虫与网页自动化工具

## 项目定位

Auto-Tauri 是一个开源的 AI 自动化助手开发平台，核心目标是打造一款「自然语言驱动的桌面 AI 爬虫与网页自动化工具」。该平台采用多模块化架构设计，整合了 Tauri 桌面端外壳、HyperAgent 自动化引擎、OpenCode 本地服务以及多个专业 AI 代理，面向个人与企业用户提供可商业化运营的 AI 自动化浏览器爬虫与网页操作助手。

项目引入了「项目 (Project)」与「任务 (Task)」分离的概念设计，用户可以预先定义自动化模板（包含目标 URL、AI 指令和执行逻辑），然后多次复用这些模板来生成具体的执行任务。系统支持「云端管理 + 本地执行」的混合模式，云端负责账号管理、积分结算与任务元数据存储，而桌面端负责实际的浏览器执行与结果本地持久化。

---

## 核心模块

### HyperAgent Desktop

| 特性 | 说明 |
|------|------|
| 桌面容器 | Tauri v2 (Rust) 构建的跨平台桌面应用 |
| 前端框架 | Vite + React |
| 自动化引擎 | HyperAgent + Playwright (Node.js) |
| 用户体系 | 多租户 + 积分制计费 |
| 核心功能 | 项目管理、任务执行、实时日志展示 |

### Local OpenCode Server

| 特性 | 说明 |
|------|------|
| 8 个专业 AI 代理 | Sisyphus、Oracle、Librarian、Explore、Cowork、Frontend Engineer 等 |
| Open-Cowork | 自主任务执行，如同事般完成复杂任务 |
| 开箱即用 | 所有配置在 `.opencode/` 目录内 |
| 并行执行 | 支持后台任务和 Ultrawork 模式 |

### Playwright Agent

| 组件 | 功能 |
|------|------|
| parser.ts | 对话解析器：自然语言 → 操作意图 |
| codeGenerator.ts | 代码生成器：操作意图 → Playwright 代码 |
| actionRecorder.ts | 操作录制器：浏览器事件录制 |
| browserManager.ts | 浏览器管理器：持久化上下文 |
| wsServer.ts | WebSocket 服务：实时双向通信 |

### @auto-tauri/framework

跨平台共享框架，支持：
- 自动检测 OS 和架构选择二进制
- 小红书 (XHS) 内容发布集成
- HyperAgent 运行支持
- macOS / Windows / Linux 全平台覆盖

---

## 技术栈

| 维度 | 技术选型 |
|------|----------|
| 桌面外壳 | Tauri v2 (Rust) |
| 前端框架 | Vite + React + TypeScript |
| 自动化引擎 | HyperAgent + Playwright |
| 业务后端 | Golang + Gin |
| 数据库 | PostgreSQL + Redis |
| 本地 AI 服务 | OpenCode + Oh-My-OpenCode |

---

## 快速开始

```bash
# 启动桌面应用
cd desktop
npm install
npm run dev

# 启动本地 OpenCode 服务
cd local-server
npm install
npm run serve

# 运行 Playwright Agent
cd playwright-agent
npm install
npm start
```

---

## 项目结构

```
auto-tauri/
├── desktop/           # Tauri 桌面应用
├── local-server/      # OpenCode 本地服务
├── playwright-agent/  # 对话式代码生成器
├── framework/         # 共享框架包
├── server-go/         # Golang 后端
├── xhs_agent/         # 小红书发布代理
└── sandbox/           # 沙箱环境
```

---

## 文档

- [开发计划](./plan.md)
- [构建说明](./build.md)
- [HyperAgent 文档](./hyperagent.md)
- [框架使用说明](./framework/README.md)
