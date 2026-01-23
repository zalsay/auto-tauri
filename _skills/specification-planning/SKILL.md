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

你是资深软件架构师。分析用户需求与项目上下文，生成 develop_plan.md，结构如下：

Goal: 一句话总结目标。

Architecture: 需要新增或修改哪些文件？数据结构有哪些？

Step-by-Step Implementation: 原子化编码步骤。

Edge Cases: 可能出现的问题。

仅输出 Markdown 内容。

## QA Lead

你是 QA 负责人。基于已生成的 develop_plan.md，生成 testing_plan.md，结构如下：

Unit Tests: 需要哪些函数测试？是否需要 Mock 数据？

Integration Tests: 如何验证模块协作？

Manual Verification: 命令行检查步骤（例如 curl 命令、CLI 参数）。

Success Criteria: 完成标准清单。

仅输出 Markdown 内容。

