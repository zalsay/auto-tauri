# Python 3.12 离线安装包

本目录用于存放 Python 3.12 离线安装包，支持 Windows 和 macOS 系统。

## 目录结构

```
sandbox/
└── python312/
    ├── README.md
    ├── python-3.12.x-amd64.msi      # Windows 64位离线安装包
    └── python-3.12.x-macos11.pkg    # macOS离线安装包
```

## 下载离线安装包

### Windows
1. 访问 Python 官方下载页面：https://www.python.org/downloads/release/python-3120/
2. 下载 `Windows x86-64 executable installer` (python-3.12.0-amd64.exe)
3. 重命名为 `python-3.12.x-amd64.exe` 并放入本目录

### macOS (Apple Silicon)
1. 访问 Python 官方下载页面：https://www.python.org/downloads/release/python-3120/
2. 下载 `macOS 64-bit universal2 installer` (python-3.12.0-macos11.pkg)
3. 重命名为 `python-3.12.x-macos11.pkg` 并放入本目录

## 安装说明

### Windows 安装
```powershell
# 以管理员身份运行 PowerShell
cd sandbox/python312
.\python-3.12.x-amd64.exe /quiet InstallAllUsers=1 PrependPath=1
```

### macOS 安装
```bash
cd sandbox/python312
sudo installer -pkg python-3.12.x-macos11.pkg -target /
```

## 调用 Python 3.12 执行脚本

根据不同操作系统，调用对应的 Python 3.12 解释器。

### 方法一：使用绝对路径调用

```python
import subprocess
import sys
import platform

def get_python312_path():
    """获取当前系统对应的 Python 3.12 路径"""
    system = platform.system()
    if system == "Windows":
        return r"C:\Python312\python.exe"
    elif system == "Darwin":  # macOS
        return "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12"
    else:
        raise NotImplementedError(f"Unsupported operating system: {system}")

def execute_python_script(script_path):
    """使用 Python 3.12 执行脚本"""
    python_path = get_python312_path()
    result = subprocess.run(
        [python_path, script_path],
        capture_output=True,
        text=True
    )
    return result

# 使用示例
if __name__ == "__main__":
    script = "your_script.py"
    result = execute_python_script(script)
    print("stdout:", result.stdout)
    print("stderr:", result.stderr)
    print("return code:", result.returncode)
```

### 方法二：创建虚拟环境

```bash
# Windows
cd your_project
C:\Python312\python.exe -m venv venv312
.\venv312\Scripts\activate
python your_script.py

# macOS
cd your_project
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m venv venv312
source venv312/bin/activate
python your_script.py
```

### 方法三：使用 shell 脚本调用

#### Windows (run_python.bat)
```batch
@echo off
setlocal

REM 设置 Python 3.12 路径
set PYTHON312_PATH=%~dp0..\python312\python.exe

REM 执行参数中的脚本
"%PYTHON312_PATH%" %*

endlocal
```

使用方法：
```cmd
cd sandbox/python312
.\run_python.bat ..\your_project\your_script.py
```

#### macOS (run_python.sh)
```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON312_PATH="/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12"

# 执行参数中的脚本
"$PYTHON312_PATH" "$@"
```

使用方法：
```bash
chmod +x run_python.sh
cd sandbox/python312
./run_python.sh ../your_project/your_script.py
```

## 验证安装

```bash
# Windows
C:\Python312\python.exe --version

# macOS
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 --version
```

## 注意事项

1. 安装完成后需要将 Python 添加到系统 PATH 环境变量
2. Windows 安装时建议勾选 "Add Python to PATH" 选项
3. macOS 安装后可能需要重启终端或执行 `source ~/.zshrc` 使环境变量生效
4. 确保安装包版本与操作系统架构匹配 (64位)

## 版本信息

- Python 3.12.0
- 发布日期: 2023年10月2日
- 官方文档: https://docs.python.org/3.12/
