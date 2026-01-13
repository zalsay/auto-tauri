# Page Analyzer 模块使用指南

## 概述

在执行 HyperAgent 任务之前，先用 Playwright 分析页面结构，将用户模糊的 prompt 转换为精确可执行的指令。

## 工作流程

```
用户输入模糊需求
       ↓
[PageAnalyzer] 1. 提取页面元素（按钮、输入框、链接等）
       ↓
[PageAnalyzer] 2. 捕获页面上下文（标题、URL、策略）
       ↓
[PageAnalyzer] 3. 调用 LLM 优化 prompt
       ↓
[HyperAgent] 4. 执行优化后的精确指令
```

## 使用方式

### 方式 1: Sidecar 自动优化

在任务输入中添加 `autoOptimizePrompt: true`：

```json
{
  "taskId": "task-001",
  "url": "https://example.com",
  "prompt": "帮我登录账号",
  "autoOptimizePrompt": true
}
```

### 方式 2: 手动调用 PageAnalyzer

```typescript
import { analyzeAndOptimize } from './page_analyzer';

const page = await context.newPage();
await page.goto('https://example.com/login');

const result = await analyzeAndOptimize(page, '帮我登录');

// result.optimizedPrompt 会变成类似：
// "点击右上角 'Sign In' 链接，等待登录表单加载，
//  在邮箱输入框输入 'user@example.com'，
//  在密码框输入密码，点击 'Sign In' 按钮"
```

## 优化示例

| 用户原始输入 | 优化后 |
|------------|--------|
| 帮我登录 | "点击页面右上角的 'Sign In' 链接，等待登录表单加载完成后，在第一个输入框（placeholder='Email address'）输入 'user@example.com'，在第二个输入框输入密码，点击蓝色的 'Sign In' 按钮" |
| 搜索产品 | "点击搜索框（页面顶部中间的长方形输入框，placeholder='搜索产品...'），输入 '机械键盘'，点击搜索图标按钮" |
| 购买这个 | "点击商品图片下方的白色 '加入购物车' 按钮（位于价格 '$99' 的右侧），等待购物车弹窗出现" |

## 实现原理

### 1. 页面元素提取

```typescript
// 提取可交互元素
const elements = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button, input, a, [role="button"]'))
    .slice(0, 15)
    .map(el => ({
      role: el.tagName.toLowerCase(),
      text: el.textContent?.trim() || '',
      placeholder: el.getAttribute('placeholder'),
      type: el.getAttribute('type'),
    }));
});
```

### 2. 页面上下文捕获

```typescript
const context = {
  title: await page.title(),
  url: page.url(),
  strategy: detectStrategy(url), // login / checkout / search / general
};
```

### 3. Prompt 优化策略

使用 LLM 将模糊指令转换为：
- **短句**: 每条指令一个动作
- **具体**: 包含元素描述、位置、视觉特征
- **可执行**: 引用已识别的元素

## API 配置

需要配置 LLM 环境变量：

```bash
# OpenAI
export OPENAI_API_KEY=sk-xxx

# 或其他兼容 API
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_MODEL=gpt-4o
```

## 输出结构

```json
{
  "taskId": "task-001",
  "status": "success",
  "data": {
    "promptOptimization": {
      "originalPrompt": "帮我登录",
      "optimizedPrompt": "点击右上角 'Sign In' 链接...",
      "strategy": "Login detected - focus on credentials",
      "elementsCount": 8
    }
  }
}
```
