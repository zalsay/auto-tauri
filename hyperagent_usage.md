# HyperAgent 使用指南

## 1. 环境准备

HyperAgent 依赖 Playwright 浏览器内核与 LLM Provider (如 OpenAI) 进行网页理解与自动化操作。

### 1.1 安装依赖
在 `sidecar` 目录下安装所需依赖：
```bash
cd sidecar
npm install
```

### 1.2 安装 Playwright 浏览器内核
```bash
npx playwright install chromium
```

### 1.3 配置 LLM Provider
HyperAgent 需要配置大语言模型 API Key 才能运行 AI 指令（如 `.ai()`）。
请在环境变量中设置 `OPENAI_API_KEY`（或其他支持的 Provider）。

示例 (macOS/Linux):
```bash
export OPENAI_API_KEY=sk-xxxx
```

## 2. 测试运行

### 2.1 基础 Playwright 测试
验证浏览器自动化环境是否正常（不依赖 LLM）。
```bash
cd sidecar
npx ts-node test_playwright.ts
```
预期输出：成功打开浏览器，访问 Hacker News 并输出标题。

### 2.2 HyperAgent AI 测试
验证 AI 驱动的自动化流程（需要 API Key）。
```bash
cd sidecar
# 确保已设置 API KEY
npx ts-node test_hyperagent.ts
```
注意：`test_hyperagent.ts` 代码中需根据使用的 Provider 修改初始化配置：
```typescript
const agent = new HyperAgent({
  llm: {
    provider: "openai", // 或 "anthropic", "gemini"
    model: "gpt-4o",
  },
});
```

## 3. Sidecar 打包与集成
HyperAgent 作为 Tauri 的 Sidecar 运行，生产环境会将 Node.js 代码打包为独立二进制文件。

打包命令：
```bash
cd sidecar
npm run package
```
产物位置：`desktop/src-tauri/binaries/hyperagent-aarch64-apple-darwin` (macOS arm64)

Tauri 调用方式：
在 Rust 主进程中通过 `Command::new_sidecar("hyperagent")` 调用，并通过 stdin/stdout 通信。

## 4. 使用 outputSchema 获取结构化结果示例

HyperAgent 支持通过 `outputSchema`（基于 `zod`）约束 LLM 的输出结构，得到强类型的结构化结果。例如：

```typescript
import { z } from "zod";

const result = await agent.executeTask(
  "Navigate to imdb.com, search for 'The Matrix', and extract the movie details",
  {
    outputSchema: z.object({
      director: z.string().describe("The name of the movie director"),
      releaseYear: z.number().describe("The year the movie was released"),
      rating: z.string().describe("The IMDb rating of the movie"),
    }),
  }
);

console.log(result.output);
// { director: "Lana Wachowski, Lilly Wachowski", releaseYear: 1999, rating: "8.7/10" }
```

在实际项目中，可以将 `outputSchema` 中的字段设计为与业务模型（例如素材中心的 `name`、`content` 等字段）对齐，这样 Sidecar 与后端的集成会更加自然稳定。
