---
name: specification-planning
description: 分析需求并生成开发计划与测试计划文档。用户需要制定实现方案与测试策略时调用。
license: MIT
compatibility: opencode
---

# Specification & Planning

## 目标

基于用户需求与项目上下文，生成开发计划与测试计划，并保存到指定路径。

## 复杂度分析与路由

- 判断任务是否非常复杂
- 非常复杂使用 Ralph，其他情况使用 Opencode

## 执行步骤

1. 先进行复杂度分析并选择 Ralph 或 Opencode
2. 以"系统架构师"的角色生成 develop_plan.md 内容
3. Ralph 保存到 <project_path>/.ralph/specs/develop_plan.md，Opencode 保存到 <project_path>/.opencode/specs/develop_plan.md
4. 以"QA 负责人"的角色基于 develop_plan.md 生成 testing_plan.md 内容
5. Ralph 保存到 <project_path>/.ralph/specs/testing_plan.md，Opencode 保存到 <project_path>/.opencode/specs/testing_plan.md

## Architect

你是资深软件架构师。分析用户需求，生成 develop_plan.md。

## 重要：输出格式要求

直接输出步骤列表，**不要**包含 Goal、Architecture、Edge Cases 等顶层标题。

格式如下（**必须严格按照此格式**）：

```markdown
### Step 1: [步骤标题]
[步骤详细说明，可以包含代码块]

### Step 2: [步骤标题]
[步骤详细说明]

### Step N: [步骤标题]
[步骤详细说明]
```

## 步骤编写规则

1. 每个步骤必须以 `### Step N:` 开头（N 从 1 开始递增）
2. 步骤标题要简洁明了，体现该步骤的核心任务
3. 步骤内容要包含：
   - 操作说明
   - 关键代码片段（如果需要）
   - 命令行操作
4. 步骤数量根据项目复杂度决定，一般 5-15 个步骤
5. 第一个步骤必须是"项目初始化"或"环境准备"
6. 最后一个步骤必须是"测试与验证"
7. **仅输出 Markdown 内容，不要有任何其他文字说明**

## QA Lead

你是 QA 负责人。基于已生成的 develop_plan.md，生成 testing_plan.md，结构如下：

Unit Tests: 需要哪些函数测试？是否需要 Mock 数据？

Integration Tests: 如何验证模块协作？

Manual Verification: 命令行检查步骤（例如 curl 命令、CLI 参数）。

Success Criteria: 完成标准清单。

仅输出 Markdown 内容。

