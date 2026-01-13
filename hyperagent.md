# HyperAgent 官方简介

> 官方文档：https://www.hyperbrowser.ai/docs/hyperagent/introduction

**HyperAgent** 是由 **Hyperbrowser** 团队开发的开源浏览器自动化框架，扩展了 Playwright 的 AI 能力。

## 核心功能

- **自然语言交互**：用自然语言描述操作，而非编写复杂的 CSS/XPath 选择器
- **自动处理复杂场景**：自动处理 iframes、shadow DOM、动态内容等
- **AI 智能定位**：描述元素即可，AI 自动找到目标元素

## 核心方法

### page.ai()
执行复杂多步骤任务。

### page.perform()
快速单步操作。

### page.extract()
使用 Zod Schema 提取结构化数据。

### Playwright 兼容
可混合使用标准 Playwright API。

## 主要特性

| 特性 | 说明 |
|------|------|
| 自动元素定位 | 自然语言描述，AI 自动处理 DOM 结构、iframes、shadow DOM |
| 动作缓存 | 录制后无 LLM 调用回放，降低成本 |
| 多 LLM 提供商 | 支持 OpenAI、Anthropic、Google Gemini |
| 云端扩展 | 本地开发，生产环境可扩展到 Hyperbrowser 云服务 |
| CDP-First 架构 | 原生 Chrome DevTools Protocol 集成 |

## 代码示例

```typescript
import { HyperAgent } from "@hyperbrowser/agent";
import { z } from "zod";

const agent = new HyperAgent();
const page = await agent.newPage();

await page.goto("https://flights.google.com");

// AI 处理复杂任务
await page.ai("search for flights from Miami to LAX on Dec 15");

// 单步操作
await page.perform("click the first result");

// 提取结构化数据
const flight = await page.extract(
  "get the price and duration of the selected flight",
  z.object({
    price: z.number(),
    duration: z.string(),
  })
);

// 使用 Playwright
await page.locator('css=button').click();

await agent.closeAgent();
```

## 安装

```bash
npm install @hyperbrowser/agent
```

## 官方链接

- GitHub: https://github.com/hyperbrowserai/HyperAgent
- npm: https://www.npmjs.com/package/@hyperbrowser/agent
- 文档: https://www.hyperbrowser.ai/docs/hyperagent/introduction
