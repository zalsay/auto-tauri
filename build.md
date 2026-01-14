# Sidecar 构建指南

Sidecar 是基于 TypeScript 的 Node.js 应用程序，打包为独立的可执行文件，供 Tauri 主程序调用。本项目包含两个 Agent：
1. **Sidecar (HyperAgent)**: 用于通用任务执行。
2. **XHS Agent**: 专门用于小红书发布任务。

## 前置要求

- Node.js (v18 或更高版本)
- npm
- Make 工具 (macOS/Linux 自带, Windows 可通过 Git Bash 使用)

## 构建流程

构建过程由 `Makefile` 和各自项目的 `package.json` 脚本协调完成：

1. **安装依赖**: 下载必要的依赖（如 `typescript`, `@vercel/ncc`, `pkg` 等）。
2. **编译与打包 (Build & Bundle)**:
   - `tsc`: 将 TypeScript 源码编译为 JavaScript (`dist/`)。
   - `ncc`: (仅 Sidecar) 将编译后的代码及其所有依赖打包成单一 JS 文件 (`dist/bundle/index.js`)。
3. **封装二进制 (Package)**:
   - `pkg`: 将打包后的 JS 文件封装为特定平台的原生可执行文件。
   - 输出位置：`framework/src-tauri/binaries/`。

## 构建命令

建议使用根目录下的 `Makefile` 进行统一构建。

### 自动构建（推荐）

自动检测当前操作系统架构并构建：

```bash
make build-sidecar
```

### 跨平台构建

可以通过 `PLATFORM` 参数指定目标平台：

```bash
# 构建 Apple Silicon Mac 版本
make build-sidecar PLATFORM=macos-arm64

# 构建 Intel Mac 版本
make build-sidecar PLATFORM=macos-x64

# 构建 Linux x64 版本
make build-sidecar PLATFORM=linux-x64

# 构建 Windows x64 版本
make build-sidecar PLATFORM=windows-x64
```

### 清理构建产物

清理所有临时文件和生成的二进制文件：

```bash
make clean-sidecar
```

## 输出文件说明

构建完成后，二进制文件将位于 `framework/src-tauri/binaries/` 目录下，文件命名格式如下：

- **Sidecar**: `sidecar-<架构>-<系统>` (例如 `sidecar-aarch64-apple-darwin`)
- **XHS Agent**: `xhs-agent-<架构>-<系统>` (例如 `xhs-agent-aarch64-apple-darwin`)

Tauri 配置文件 (`tauri.conf.json`) 会根据当前系统自动选择对应的二进制文件执行。
