# HyperAgent Desktop：AI 自动化助手开发计划书

> 本项目为「auto-tauri」桌面应用，整合 **Tauri 桌面端外壳**、**HyperAgent 自动化引擎** 与 **Gin + PostgreSQL 积分后端系统**，面向个人与企业用户提供可商业化运营的 AI 自动化浏览器爬虫与网页操作助手。

---
## 0. 项目配置
github： git@github.com:zalsay/auto-tauri.git

## 1. 项目愿景

- 打造一款「自然语言驱动的桌面 AI 爬虫与网页自动化工具」。
- 用户只需输入任务描述（例如：
  - 「帮我抓取亚马逊某类商品的价格和评价」
  - 「登录某后台导出昨天的销售报表」
 ），系统即可自动完成浏览器打开、登录、表单输入、翻页与数据提取。
- 支持多租户用户体系和积分计费模型，为后续 SaaS 化、按量计费和企业授权版打下基础。
- 提供「云端管理 + 本地执行」模式，云端负责账号、积分与任务元数据，桌面端负责实际浏览器执行与结果本地持久化，兼顾隐私、安全与性能。

---

## 2. 全栈架构设计

整体采用「云端管理 + 本地执行」的混合架构，分为三层：

1. **桌面前端层（Tauri + Vite + React/Vue）**  
   - 主要职责：
     - 登录 / 注册 / 个人中心与积分面板展示。
     - 本地任务创建、管理与状态展示。
     - 调用本地 Sidecar 执行任务，展示实时日志与结果预览。
   - 通信方式：
     - 与 Gin 后端通过 HTTPS + JWT 通信（登录、积分、任务元数据）。
     - 与 Node.js Sidecar 通过 Tauri `Command` / stdio 通道交互（下发任务、接收日志和执行状态）。

2. **云端后端层（Golang + Gin + PostgreSQL）**  
   - 主要职责：
     - 用户注册 / 登录 / JWT 鉴权中间件。
     - 用户积分账户管理（`users.balance`）。
     - 充值流水、消费记录、退款记录（`transactions`）。
     - 任务元数据记录（`tasks`）——任务指令、状态、积分成本等。
   - 安全要求：
     - 所有积分变动必须走服务端事务，前端仅展示状态。
     - 所有受保护接口必须由 JWT 中间件验证用户身份。

3. **执行层（Node.js Sidecar + HyperAgent + Playwright）**  
   - 主要职责：
     - 将来自 Tauri 的任务（URL + Prompt + Schema）翻译为 HyperAgent 任务。
     - 通过 Playwright 控制浏览器完成网页操作与数据抓取。
     - 通过 stdio 将执行过程日志、关键事件和结果 JSON 回传给 Tauri。
   - 部署方式：
     - 作为 Tauri 的 Sidecar 可执行文件随应用分发。
     - 支持多平台（macOS / Windows），尽量使用无头浏览器模式以节省资源。

> 关键原则：**云端只做「账户 + 计费 + 元数据」，不直接运行浏览器；本地只做「执行 + 结果本地化」，不保存用户敏感账户数据到云端。**

---

## 3. 核心技术栈

| 维度       | 技术选型                              | 说明 |
| ---------- | ------------------------------------- | ---- |
| 桌面外壳   | Tauri v2 (Rust)                       | 轻量级跨平台桌面容器，封装前端 UI 与本地能力 |
| 前端框架   | Vite + React 或 Vue                   | 构建登录、任务管理、结果预览等界面 |
| 自动化引擎 | HyperAgent + Playwright (Node.js)     | 负责 LLM 驱动的高层自动化与浏览器控制 |
| 业务后端   | Golang + Gin                          | RESTful API、JWT 鉴权、中间件与业务逻辑 |
| 数据库     | PostgreSQL                            | 存储用户、交易流水与任务元数据 |
| ORM        | GORM                                  | 提供模型迁移和数据库访问封装 |
| 认证方案   | JWT (JSON Web Token)                  | 前后端分离认证方案，配合 Gin 中间件使用 |

---

## 4. 数据库设计（PostgreSQL）

### 4.1 `users` 表

- `id`：UUID，主键，唯一标识用户。
- `email`：用户邮箱，唯一索引，用于登录。
- `password_hash`：加密后的密码（使用 PBKDF2 / bcrypt / Argon2 等安全算法）。
- `balance`：积分余额（`INT` 或 `DECIMAL`），所有消费与充值均以此为基准。
- `created_at`：账户创建时间。

### 4.2 `transactions` 表

- `id`：交易 ID，主键，可使用 UUID。
- `user_id`：关联 `users.id`，外键。
- `amount`：变动金额（正数为充值，负数为消费，退款可为正数）。
- `type`：交易类型，枚举值：`recharge` / `consume` / `refund`。
- `description`：备注说明，例如：`执行任务: 抓取亚马逊商品`。
- `created_at`：交易时间。

### 4.3 `tasks` 表

- `id`：任务 ID，主键。
- `user_id`：所属用户 ID。
- `prompt`：AI 指令内容（自然语言 Prompt）。
- `status`：任务状态：`pending` / `running` / `completed` / `failed`。
- `cost`：本次任务实际消耗积分（与 `transactions.amount` 对应）。
- `created_at`：任务创建时间。
- `updated_at`：任务最近更新时间。

> 后续可扩展：例如新增 `result_summary`、`result_url`、`retry_of_task_id` 等字段，增强审计与重试能力。

---

## 5. 开发阶段规划

> 时间标记为 Week1–Week5，可根据实际节奏调整。重点阶段为 **第二阶段（Gin 后端与积分认证）**。

### 第一阶段：基础设施与 Sidecar 搭建（Week 1）

- [x] **Tauri 项目初始化**
  - 初始化 `auto-tauri` Tauri v2 项目，配置应用名称与基础窗口。
  - 配置图标、窗口权限、安全设置（`tauri.conf.json`）。
  - 规划与后端域名、端口的通信策略（CORS / HTTPS）。

- [ ] **Node.js Sidecar 构建**
  - 将 HyperAgent 调用逻辑封装为 CLI：支持 `--url`、`--prompt`、`--schema` 等参数。
  - 约定 stdio 通信协议：
    - 输入：JSON 任务参数（用户 ID、任务 ID、目标 URL、Prompt、Schema 等）。
    - 输出：结构化日志事件流 + 最终结果 JSON。
  - 确保 CLI 在 macOS/Windows 上打包为独立可执行文件，并能由 Tauri 调用。

- [ ] **环境检测**
  - 应用启动时检测本地浏览器环境：
    - 若未安装 Playwright 所需浏览器内核，提示用户一键安装或自动执行 `playwright install`。
  - 在设置页或首次启动时提供诊断页面，展示：Node 版本、Playwright 状态等。

### 第二阶段：Gin 后端服务与积分认证（Week 2）【当前重点】

- [ ] **后端基础框架**
  - 基于 Gin 搭建 REST API：
    - 用户注册：`POST /api/v1/auth/register`。
    - 用户登录：`POST /api/v1/auth/login`。
    - 用户信息查询：`GET /api/v1/users/me`。
  - 集成 GORM 连接 PostgreSQL，定义 `User`、`Transaction`、`Task` 模型与自动迁移。
  - 实现 JWT 生成与解析逻辑，封装 Gin 中间件：
    - 校验 Token 合法性与过期时间。
    - 将 `userID` 注入 `context`，供业务处理使用。

- [ ] **积分系统开发**
  - 充值接口：
    - `POST /api/v1/credits/recharge`，模拟或集成真实支付渠道前的临时充值逻辑。
    - 写入 `transactions` 记录，更新 `users.balance`。
  - 扣费逻辑：
    - 抽象为 `ConsumeCredits` 服务方法，必须在数据库事务中执行：
      - 查询当前用户余额。
      - 若余额不足，返回错误。
      - 扣减余额，写入 `transactions` 消费记录。
    - 为任务启动接口提供统一扣费能力。

- [ ] **前端对接（Tauri 内嵌页面）**
  - 在 Tauri 前端实现登录 / 注册页，与 Gin 后端完成 JWT 登录流程。
  - 将 Token 安全存储（例如：加密写入本地配置文件或安全存储）。
  - 在应用主界面的头部或侧栏展示积分余额，支持手动刷新与自动轮询。

### 第三阶段：任务管理与执行流（Week 3）

- [ ] **任务配置界面**
  - 用户在桌面端输入：目标 URL、AI Prompt、可选 Schema 或模式（列表页采集 / 详情页采集等）。
  - 前端调用 Gin 接口进行「预扣费」，例如：`POST /api/v1/tasks/start`。

- [ ] **执行引擎对接**
  - 扣费成功后，Tauri 通过 Rust 命令启动 Sidecar CLI，将任务参数通过 stdio 传入。
  - Tauri 实时捕获 Sidecar 的输出：
    - 将结构化日志流渲染到 UI（例如：步骤日志、当前 URL、元素定位情况等）。
  - 将任务执行状态回写给后端（可选）：记录任务完成/失败状态。

- [ ] **HyperAgent 深度集成**
  - 对接 `page.extract()`，支持将页面结构映射到预定义 Schema。
  - 在前端提供 Schema 配置 UI（简单场景可先使用固定 Schema）。

### 第四阶段：数据持久化与结果展示（Week 4）

- [ ] **结果存储**
  - 本地：将爬取到的结构化数据（JSON）存储在用户本机（例如 `~/.hyperagent-desktop/tasks/{taskId}.json`）。
  - 云端：将结果摘要（统计信息、样例数据、记录条数等）同步到 Postgres 中对应任务记录。

- [ ] **结果预览器**
  - 在桌面端提供结果预览页面：
    - 表格展示任务结果数据，支持分页与搜索。
    - 支持导出为 Excel / CSV 文件，方便用户二次分析。

- [ ] **断点续传 / 重试机制**
  - 对执行失败的任务，支持：
    - 管理员或系统策略决定是否退还部分/全部积分。
    - 提供「免费重试一次」的策略，提升用户体验。

### 第五阶段：优化与打磨（Week 5）

- [ ] **性能优化**
  - 引入 HyperAgent 的缓存机制，复用相似 Prompt 与页面结构，减少 LLM Token 消耗。
  - 优化 Playwright 启动速度：复用浏览器上下文、尽量采用无头模式。

- [ ] **UI/UX 增强**
  - 增加暗黑模式、任务进度条、步骤可视化时间线。
  - 在任务执行过程中展示关键截图预览（如登录成功页面、列表页截屏等）。

- [ ] **打包发布**
  - 配置 GitHub Actions / CI 流水线：自动构建 macOS / Windows 安装包。
  - 集成自动版本号管理与 Release 产物上传。

---

## 6. 关键业务逻辑示例（Gin 积分消费逻辑）

> 下方为任务启动时的典型扣费逻辑伪代码，实际实现需补充模型定义、错误处理与日志。

```go
// POST /api/v1/tasks/start
func StartTaskHandler(c *gin.Context) {
    userID := c.MustGet("userID").(uint)
    taskCost := 10 // 单次任务固定消耗 10 积分，可后续改为动态计算

    err := db.Transaction(func(tx *gorm.DB) error {
        var user User
        if err := tx.First(&user, userID).Error; err != nil {
            return err
        }

        if user.Balance < taskCost {
            return errors.New("积分余额不足")
        }

        // 1. 扣除余额
        if err := tx.Model(&user).Update("balance", user.Balance-taskCost).Error; err != nil {
            return err
        }

        // 2. 记录交易流水
        if err := tx.Create(&Transaction{
            UserID: userID,
            Amount: -taskCost,
            Type:   "consume",
        }).Error; err != nil {
            return err
        }

        return nil
    })

    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, gin.H{"message": "扣费成功，任务启动中..."})
}
```

---

## 7. 风险评估与对策

1. **Token 成本控制**
   - 风险：HyperAgent 依赖 LLM，大量复杂任务可能导致 Token 成本过高。
   - 对策：
     - 在前端对用户展示「任务预估积分消耗」与历史平均成本。
     - 控制定价策略：限制单任务最大 Token 配额，或设置任务等级。

2. **Sidecar 性能与资源占用**
   - 风险：Playwright 启动浏览器开销较大，可能导致内存与 CPU 占用偏高。
   - 对策：
     - 优先使用无头模式（headless），并配置浏览器池复用实例。
     - 在任务执行之间重用上下文，避免频繁完全重启浏览器。

3. **安全性与积分绕过风险**
   - 风险：恶意用户可能尝试通过修改前端代码或绕过 Tauri UI，直接调用后端或本地 Sidecar，跳过积分校验。
   - 对策：
     - 所有积分扣费必须在 Gin 后端完成，并基于 JWT 身份。
     - 后端接口在未扣费成功时不得返回可执行任务的关键参数（如外网可访问的执行令牌）。
     - 对关键接口增加频率限制与审计日志，必要时加入风控策略。

4. **数据隐私**
   - 风险：任务执行过程中可能涉及用户账号、订单数据等敏感信息。
   - 对策：
     - 默认仅在本地存储完整执行结果，云端仅保存必要摘要。
     - 提供本地加密选项，允许用户开启结果文件加密存储。

---

> 本文档作为 `auto-tauri` 项目的初始开发蓝图，可在实际开发过程中根据需求演进持续更新。
