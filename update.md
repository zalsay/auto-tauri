## 更新记录

- 2025-12-28：创建 `auto-tauri` 项目并编写 `plan.md` 开发计划。
- 2025-12-28：搭建基础目录结构，新增 `sidecar/` 与 `server/` 目录，规划 `desktop/` 作为 Tauri 桌面端入口。
- 2025-12-28：使用 `create-tauri-app` 在 `desktop/` 目录初始化 Tauri（React + TS + Vite）。
 - 2025-12-28：在 `server/` 下初始化 Go 模块，接入 Gin + GORM，并通过 env 文件配置 PostgreSQL 连接，添加基础数据模型和 `/health` 接口。
- 2025-12-28：在 `server` 中实现 `POST /api/v1/auth/register`、`POST /api/v1/auth/login`（JWT）、`POST /api/v1/credits/recharge` 与 `POST /api/v1/tasks/start` 的接口骨架和事务扣费逻辑。
- 2025-12-28：在 `server` 中新增 `GET /api/v1/auth/me` 接口，用于返回当前用户信息，并在 `desktop` 中替换默认示例页面，接入注册、登录、积分充值与任务启动的前端界面，使用本地存储保存 JWT，并通过环境变量支持后端地址配置。
 - 2025-12-28：在 `server` 中集成 Redis 客户端，通过用户级 Redis 锁保护积分充值与任务扣费的原子性，更新 `.env.example` 和 `plan.md` 以反映配置与设计。
