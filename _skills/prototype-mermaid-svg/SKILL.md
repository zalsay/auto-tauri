---
name: "prototype-mermaid-svg"
description: "Convert Axure-style HTML prototypes into Markdown specs with Mermaid flows and render them to SVG. Invoke when user asks for prototype-to-doc conversion or Mermaid SVG outputs."
---

# 原型到 Markdown + Mermaid SVG 转换

## 适用场景
- 用户提供原型 HTML 或原型页面导出的 HTML 代码
- 需要把原型整理成 Markdown 文档
- 需要将 Mermaid 流程图渲染为 SVG 文件

## 输入
- 原型 HTML 文件路径
- 目标 Markdown 文件路径
- 是否需要输出 SVG（默认需要）

## 输出
- 结构化 Markdown 文档（页面结构、文案、规则、流程）
- Mermaid 流程图对应的 SVG 文件（flow-*.svg）

## 操作步骤
1. 读取原型 HTML，抽取页面结构、模块、文案与交互规则。
2. 输出 Markdown 文档：包含页面目标、结构、关键文案、交互规则、字段表、组件清单。Markdown 文档应符合项目文档规范，每个模块对应一个 Markdown 段落。
3. 将流程整理为 Mermaid flowchart，并保存为多个 .mmd 文件。
4. 使用 mermaid-cli 渲染 SVG：
   - 使用 puppeteer-config.json 以兼容无头环境。
   - 命令示例：
     - npx -y @mermaid-js/mermaid-cli -p puppeteer-config.json -i flow-1.mmd -o flow-1.svg
5. 如遇 Mermaid 语法错误，优先将含括号/特殊字符的节点文本加引号。
6. 生成 SVG 后校验文件是否落盘。
7. 更新项目 update.md 与 plan.md 记录本次产出。

## 质量检查
- Mermaid 渲染命令返回码为 0
- SVG 文件数量与流程数量一致
- Markdown 文档包含流程图与字段表
