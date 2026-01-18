# Local OpenCode Server with Oh-My-OpenCode

🚀 **开箱即用的 OpenCode 本地服务** - 集成 Oh-My-OpenCode 高级插件，包含 8 个专业 AI 代理和 Open-Cowork 自主任务执行。

## ✨ 特性

- **🎯 开箱即用** - 配置都在项目目录内，无需额外设置
- **🤖 8 个专业代理** - Sisyphus、Oracle、Librarian、Explore、Cowork、Frontend Engineer 等
- **🤝 Open-Cowork 集成** - 自主文件操作，如同事般完成复杂任务
- **⚡ 并行执行** - 支持后台任务和并行代理执行
- **🔧 完整工具链** - LSP、AST-grep、内置 MCP 服务器
- **📦 独立分发** - 用户只需 `npm install && npm run serve`

## 📦 安装

```bash
cd local-server
npm install
```

## 🚀 快速开始

```bash
# 启动 OpenCode 服务（使用项目内配置）
npm run serve

# 或启动 Web 界面
npm run web
```

## 📁 项目结构

```
local-server/
├── .opencode/              # 项目内配置目录
│   ├── opencode.json       # OpenCode 主配置（启用插件）
│   ├── oh-my-opencode.json # Oh-My-OpenCode 完整配置
│   ├── agents/             # 代理配置
│   │   ├── sisyphus.md
│   │   ├── oracle.md
│   │   ├── librarian.md
│   │   ├── explore.md
│   │   └── cowork.md       # Open-Cowork 自主任务代理
│   └── command/            # 命令配置
│       └── cowork.md       # /cowork 命令
├── package.json
└── README.md
```

## 🤖 可用代理

| 代理 | 用途 | 默认模型 |
|------|------|---------|
| **Sisyphus** | 主协调器 - 计划、委派、执行 | Claude Opus 4.5 |
| **Oracle** | 架构 & 代码审查 | GPT-5.2 |
| **Librarian** | 文档 & 研究 | GLM-4.7 Free |
| **Explore** | 快速代码探索 | Grok Code |
| **Cowork** | 自主任务执行 - 如同事般工作 | Claude Opus 4.5 |
| **Frontend Engineer** | UI/UX 开发 | Gemini 3 Pro |
| **Document Writer** | 技术文档 | Gemini 3 Flash |
| **Multimodal Looker** | 视觉内容分析 | Gemini 3 Flash |

## 💡 使用方法

### 调用特定代理

```
Ask @oracle 审查这个架构设计
Ask @librarian 查找这个 API 的文档
Ask @explore 探索这个代码库结构
Ask @cowork 重构认证模块，提取验证逻辑
Ask @frontend-ui-ux-engineer 改进这个 UI
```

### Open-Cowork 自主任务执行

使用 `/cowork` 命令让 AI 自主完成复杂任务：

```
/cowork 重构认证模块，提取验证逻辑到独立文件
/cowork 重新组织 components 目录，按功能而非类型分类
/cowork 分析代码库并生成 API 文档
/cowork 找到登录失败的原因并修复
```

Cowork 会：
1. 📖 探索代码库理解结构
2. 📝 创建执行计划
3. ✏️ 逐步执行文件修改
4. ✅ 验证结果正确性
5. 📋 总结完成的工作

### Ultrawork 模式

在提示中包含 **"ultrawork"** 或 **"ulw"** 激活最大并行执行：

```
ulw - 构建一个完整的 REST API，包含认证、验证和测试
```

## 🔌 API 端点

服务启动后访问：
- **服务**: http://127.0.0.1:4096
- **API 文档**: http://127.0.0.1:4096/doc
- **健康检查**: http://127.0.0.1:4096/global/health

## 📜 可用脚本

| 命令 | 描述 |
|------|------|
| `npm start` | 启动服务（随机端口） |
| `npm run serve` | 启动服务（端口 4096） |
| `npm run web` | 启动 Web 界面（端口 3000） |
| `npm test` | 运行所有测试 |
| `npm run test:omo` | 测试 Oh-My-OpenCode 集成 |
| `npm run demo` | 会话演示 |

## 🔐 认证

```bash
# 认证提供商
opencode auth login

# 选择提供商（Claude、ChatGPT、Gemma）
# 按照浏览器中的 OAuth 说明操作
```

## ⚙️ 配置说明

所有配置都在 `.opencode/` 目录内：

- **opencode.json** - OpenCode 主配置
- **oh-my-opencode.json** - 8 个代理 + MCP 服务器配置
- **agents/*.md** - 每个代理的系统提示
- **command/cowork.md** - /cowork 命令配置

## 🛑 停止服务

```bash
# 查找进程
lsof -ti :4096

# 停止
kill $(lsof -ti :4096)

# 或使用辅助脚本
./stop-server.sh
```

## 📚 了解更多

- [OpenCode 文档](https://opencode.ai/docs)
- [Oh-My-OpenCode GitHub](https://github.com/code-yeongyu/oh-my-opencode)
- [Open-Cowork GitHub](https://github.com/Lucifer1H/open-cowork)
- [API 文档](http://127.0.0.1:4096/doc)

---

**使用 local-server，让每个用户都能轻松拥有强大的 AI 开发助手！** 🚀
