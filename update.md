## 更新记录

- 2025-12-28：创建 `auto-tauri` 项目并编写 `plan.md` 开发计划。
- 2025-12-28：搭建基础目录结构，新增 `sidecar/` 与 `server/` 目录，规划 `desktop/` 作为 Tauri 桌面端入口。
- 2025-12-28：使用 `create-tauri-app` 在 `desktop/` 目录初始化 Tauri（React + TS + Vite）。
 - 2025-12-28：在 `server/` 下初始化 Go 模块，接入 Gin + GORM，并通过 env 文件配置 PostgreSQL 连接，添加基础数据模型和 `/health` 接口。
