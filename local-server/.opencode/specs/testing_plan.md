# 测试计划 (Testing Plan)

**项目**: 知乎热门AI文章采集工具  
**版本**: v1.0  
**QA负责人**: [待定]  
**创建日期**: 2026-01-29

---

## 1. 单元测试 (Unit Tests)

### 1.1 测试范围概述

| 模块 | 函数/类 | 测试优先级 | 复杂度 |
|------|---------|-----------|--------|
| crawler.py | `get_zhihu_ai_hot_articles()` | 高 | 中 |
| excel_handler.py | `save_to_excel()` | 高 | 低 |
| scheduler.py | `start_scheduler()`, `daily_task()` | 中 | 中 |
| main.py | `main()` CLI入口 | 中 | 低 |

### 1.2 crawler.py 单元测试

#### 测试用例 1.2.1: 成功获取文章列表

**测试目标**: 验证 `get_zhihu_ai_hot_articles()` 函数在API响应成功时能正确解析数据

**Mock 数据**:
```python
mock_response_data = {
    "data": [
        {
            "target": {
                "title": "AI时代的编程语言之争",
                "question_id": "123456"
            }
        },
        {
            "target": {
                "title": "ChatGPT使用技巧大全",
                "question_id": "789012"
            }
        }
    ]
}
```

**测试断言**:
- 返回值为 list 类型
- 列表长度等于 mock 数据中的条目数 (2)
- 每个元素包含 `title` 和 `url` 键
- URL 格式正确: `https://www.zhihu.com/question/{question_id}`

**测试代码**:
```python
def test_get_zhihu_ai_hot_articles_success(mock_requests):
    with patch('requests.get') as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = mock_response_data
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        articles = get_zhihu_ai_hot_articles()
        
        assert isinstance(articles, list)
        assert len(articles) == 2
        assert articles[0]["title"] == "AI时代的编程语言之争"
        assert "zhihu.com/question/123456" in articles[0]["url"]
```

#### 测试用例 1.2.2: 空数据处理

**测试目标**: 验证 API 返回空数据时函数返回空列表

**Mock 数据**:
```python
mock_empty_data = {"data": []}
```

**测试断言**:
- 返回空列表 `[]`
- 不抛出异常

**测试代码**:
```python
def test_get_zhihu_ai_hot_articles_empty(mock_requests):
    with patch('requests.get') as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = mock_empty_data
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        articles = get_zhihu_ai_hot_articles()
        
        assert articles == []
```

#### 测试用例 1.2.3: 网络请求异常处理

**测试目标**: 验证网络异常时函数能正确捕获并返回空列表

**Mock 场景**:
- `requests.get` 抛出 `ConnectionError`
- `requests.get` 抛出 `Timeout`
- `response.raise_for_status()` 抛出 `HTTPError`

**测试断言**:
- 返回空列表 `[]`
- 错误被正确捕获 (不向上抛出)
- logger 记录错误信息

**测试代码**:
```python
@pytest.mark.parametrize("exception", [
    requests.ConnectionError("连接失败"),
    requests.Timeout("请求超时"),
    requests.HTTPError("404 Not Found")
])
def test_get_zhihu_ai_hot_articles_exception(mock_requests, exception):
    with patch('requests.get') as mock_get:
        mock_get.side_effect = exception
        
        articles = get_zhihu_ai_hot_articles()
        
        assert articles == []
```

#### 测试用例 1.2.4: 限制返回数量

**测试目标**: 验证函数最多返回10条数据

**Mock 数据**: 15条数据的完整响应

**测试断言**:
- 返回列表长度不超过 10

**测试代码**:
```python
def test_get_zhihu_ai_hot_articles_limit():
    mock_data = {"data": [{"target": {"title": f"Article {i}", "question_id": str(i)}} for i in range(15)]}
    
    with patch('requests.get') as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = mock_data
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        articles = get_zhihu_ai_hot_articles()
        
        assert len(articles) <= 10
```

### 1.3 excel_handler.py 单元测试

#### 测试用例 1.3.1: 成功创建Excel文件

**测试目标**: 验证 `save_to_excel()` 函数能正确创建Excel文件并写入数据

**Mock 输入数据**:
```python
test_articles = [
    {"title": "测试文章1", "url": "https://www.zhihu.com/question/123"},
    {"title": "测试文章2", "url": "https://www.zhihu.com/question/456"}
]
```

**测试断言**:
- 文件被创建在正确路径
- 工作表标题为 "AI热门文章"
- 存在表头: 序号、标题、链接、采集时间
- 数据行数等于输入文章数量 (2)
- B列宽度为 80
- C列宽度为 50

**测试代码**:
```python
def test_save_to_excel_success(tmp_path):
    filepath = tmp_path / "test_output.xlsx"
    
    save_to_excel(test_articles, str(filepath))
    
    assert filepath.exists()
    
    wb = load_workbook(str(filepath))
    ws = wb.active
    assert ws.title == "AI热门文章"
    assert ws.cell(row=1, column=1).value == "序号"
    assert ws.cell(row=1, column=2).value == "标题"
    assert ws.cell(row=1, column=3).value == "链接"
    assert ws.cell(row=1, column=4).value == "采集时间"
    assert ws.max_row == 3  # 1 header + 2 data
    assert ws.column_dimensions['B'].width == 80
    assert ws.column_dimensions['C'].width == 50
    wb.close()
```

#### 测试用例 1.3.2: 空数据处理

**测试目标**: 验证空列表输入时仍能创建带表头的Excel文件

**测试断言**:
- 文件被创建
- 只有表头行
- 不抛出异常

**测试代码**:
```python
def test_save_to_excel_empty(tmp_path):
    filepath = tmp_path / "empty_output.xlsx"
    
    save_to_excel([], str(filepath))
    
    assert filepath.exists()
    
    wb = load_workbook(str(filepath))
    ws = wb.active
    assert ws.max_row == 1  # Only header
    assert ws.cell(row=1, column=1).value == "序号"
    wb.close()
```

#### 测试用例 1.3.3: 目录自动创建

**测试目标**: 验证当输出目录不存在时自动创建

**测试断言**:
- 父目录被自动创建
- 文件创建成功

**测试代码**:
```python
def test_save_to_excel_create_directory(tmp_path):
    nested_path = tmp_path / "nested" / "deep" / "output.xlsx"
    
    save_to_excel(test_articles, str(nested_path))
    
    assert nested_path.exists()
    assert tmp_path / "nested" / "deep".exists()
```

### 1.4 scheduler.py 单元测试

#### 测试用例 1.4.1: 定时任务配置正确

**测试目标**: 验证 `start_scheduler()` 函数正确配置 cron 定时任务

**Mock 依赖**:  mocking `BlockingScheduler` 和 `daily_task`

**测试断言**:
- BlockingScheduler 实例被创建
- add_job 被正确调用，参数包含 'cron' trigger、hour、minute
- scheduler.start() 被调用

**测试代码**:
```python
def test_start_scheduler_configuration():
    with patch('src.scheduler.BlockingScheduler') as mock_scheduler_class:
        mock_scheduler = Mock()
        mock_scheduler_class.return_value = mock_scheduler
        
        start_scheduler(hour=10, minute=30)
        
        mock_scheduler_class.assert_called_once()
        mock_scheduler.add_job.assert_called_once()
        call_args = mock_scheduler.add_job.call_args
        assert call_args[0][0] == daily_task
        assert call_args[1]['trigger'] == 'cron'
        assert call_args[1]['hour'] == 10
        assert call_args[1]['minute'] == 30
        mock_scheduler.start.assert_called_once()
```

#### 测试用例 1.4.2: daily_task 集成调用

**测试目标**: 验证 `daily_task()` 函数正确调用爬虫和Excel模块

**Mock 依赖**:
- `get_zhihu_ai_hot_articles()` 返回测试数据
- `save_to_excel()` 验证被调用

**测试断言**:
- get_zhihu_ai_hot_articles 被调用
- save_to_excel 被调用，参数正确

**测试代码**:
```python
def test_daily_task_success():
    with patch('src.scheduler.get_zhihu_ai_hot_articles') as mock_crawler:
        with patch('src.scheduler.save_to_excel') as mock_excel:
            mock_crawler.return_value = test_articles
            
            daily_task()
            
            mock_crawler.assert_called_once()
            mock_excel.assert_called_once_with(test_articles)
```

#### 测试用例 1.4.3: daily_task 无数据处理

**测试目标**: 验证 `daily_task()` 在无数据时正确处理

**Mock 依赖**: `get_zhihu_ai_hot_articles()` 返回空列表

**测试断言**:
- save_to_excel 不被调用
- 打印 "未获取到文章数据"

**测试代码**:
```python
def test_daily_task_no_data():
    with patch('src.scheduler.get_zhihu_ai_hot_articles') as mock_crawler:
        with patch('src.scheduler.save_to_excel') as mock_excel:
            mock_crawler.return_value = []
            
            daily_task()
            
            mock_crawler.assert_called_once()
            mock_excel.assert_not_called()
```

### 1.5 main.py 单元测试

#### 测试用例 1.5.1: 默认单次执行模式

**测试目标**: 验证无参数运行时执行单次采集

**Mock 依赖**: mocking 所有子模块函数

**测试断言**:
- get_zhihu_ai_hot_articles 被调用
- save_to_excel 被调用
- start_scheduler 不被调用

**测试代码**:
```python
def test_main_default_mode():
    with patch('main.get_zhihu_ai_hot_articles') as mock_crawler:
        with patch('main.save_to_excel') as mock_excel:
            with patch('main.start_scheduler') as mock_scheduler:
                mock_crawler.return_value = test_articles
                
                with patch('sys.argv', ['main.py']):
                    main()
                
                mock_crawler.assert_called_once()
                mock_excel.assert_called_once_with(test_articles)
                mock_scheduler.assert_not_called()
```

#### 测试用例 1.5.2: 定时模式启用

**测试目标**: 验证 `--schedule` 参数触发定时模式

**Mock 依赖**: mocking 子模块

**测试断言**:
- start_scheduler 被调用，默认时间 9:00
- get_zhihu_ai_hot_articles 不被直接调用

**测试代码**:
```python
def test_main_schedule_mode():
    with patch('main.get_zhihu_ai_hot_articles') as mock_crawler:
        with patch('main.save_to_excel') as mock_excel:
            with patch('main.start_scheduler') as mock_scheduler:
                with patch('sys.argv', ['main.py', '--schedule']):
                    main()
                
                mock_scheduler.assert_called_once_with(9, 0)
                mock_crawler.assert_not_called()
                mock_excel.assert_not_called()
```

#### 测试用例 1.5.3: 自定义定时时间

**测试目标**: 验证 `--hour` 和 `--minute` 参数正确传递

**测试代码**:
```python
def test_main_schedule_custom_time():
    with patch('main.start_scheduler') as mock_scheduler:
        with patch('sys.argv', ['main.py', '--schedule', '--hour', '15', '--minute', '30']):
            main()
        
        mock_scheduler.assert_called_once_with(15, 30)
```

---

## 2. 集成测试 (Integration Tests)

### 2.1 测试目标

验证模块间协作正确性，确保数据流从爬取到保存的完整链路正常工作。

### 2.2 测试用例

#### 集成测试 2.2.1: 完整数据流测试

**测试场景**: 模拟从 API 响应到 Excel 文件的完整流程

**测试步骤**:
1. Mock API 响应数据 (5条有效文章)
2. 调用 `get_zhihu_ai_hot_articles()` 获取数据
3. 调用 `save_to_excel()` 保存数据
4. 验证 Excel 文件内容正确

**验证点**:
- 数据完整性: 所有5条记录被正确写入
- 字段正确性: 标题、链接、时间戳正确
- 文件可读性: 使用 openpyxl 可正常打开和读取

**测试代码**:
```python
def test_full_data_flow(tmp_path):
    api_response = {
        "data": [
            {"target": {"title": f"Article {i}", "question_id": str(i)}} 
            for i in range(5)
        ]
    }
    
    with patch('requests.get') as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = api_response
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        articles = get_zhihu_ai_hot_articles()
        
        assert len(articles) == 5
        
        output_file = tmp_path / "output.xlsx"
        save_to_excel articles, str(output_file)
        
        wb = load_workbook(str(output_file))
        ws = wb.active
        assert ws.max_row == 6  # 1 header + 5 data
        
        for i in range(5):
            assert ws.cell(row=i+2, column=1).value == i+1
            assert ws.cell(row=i+2, column=2).value == f"Article {i}"
            assert "zhihu.com/question/" in ws.cell(row=i+2, column=3).value
        
        wb.close()
```

#### 集成测试 2.2.2: Scheduler 与业务逻辑集成

**测试场景**: 验证定时任务正确调用数据采集和保存

**Mock 依赖**:
- requests.get 返回有效数据
- BlockingScheduler 不实际启动

**验证点**:
- daily_task 被调度器正确执行
- 数据流完整: 采集 -> 保存

**测试代码**:
```python
def test_scheduler_integration():
    test_data = [{"title": "Test", "url": "https://test.com"}]
    
    with patch('src.scheduler.requests.get') as mock_requests:
        mock_response = Mock()
        mock_response.json.return_value = {"data": [{"target": {"title": "Test", "question_id": "1"}}]}
        mock_response.raise_for_status = Mock()
        mock_requests.return_value = mock_response
        
        with patch('src.scheduler.BlockingScheduler') as mock_scheduler_class:
            mock_scheduler = Mock()
            mock_scheduler_class.return_value = mock_scheduler
            
            start_scheduler(hour=8, minute=0)
            
            mock_scheduler.add_job.assert_called_once()
```

#### 集成测试 2.2.3: CLI 参数解析集成

**测试场景**: 验证命令行参数正确传递到各模块

**测试矩阵**:

| 输入参数 | 预期行为 |
|---------|---------|
| `python main.py` | 执行单次采集 |
| `python main.py --schedule` | 启动定时任务 (9:00) |
| `python main.py --schedule --hour 14 --minute 30` | 启动定时任务 (14:30) |

**验证点**:
- 参数解析无错误
- 正确模块被调用
- 参数值正确传递

---

## 3. 手动验证 (Manual Verification)

### 3.1 环境准备检查

**验证项**:
- [ ] Python 3.8+ 已安装
- [ ] 虚拟环境已创建并激活
- [ ] 依赖已安装: `pip install -r requirements.txt`

### 3.2 CLI 命令行验证

#### 验证 3.2.1: 帮助信息验证

**命令**:
```bash
python main.py --help
```

**预期输出**:
```
usage: main.py [-h] [--schedule] [--hour HOUR] [--minute MINUTE]

知乎热门AI文章采集工具

optional arguments:
  -h, --help         show this help message and exit
  --schedule         启用定时任务模式
  --hour HOUR        定时任务执行小时(默认9)
  --minute MINUTE    定时任务执行分钟(默认0)
```

**通过标准**: 帮助信息显示完整且格式正确

#### 验证 3.2.2: 单次执行模式验证

**命令**:
```bash
python main.py
```

**预期行为**:
- 显示爬取进度日志
- 显示保存成功信息: "已保存 X 条记录到 data/zhihu_ai_hot.xlsx"

**验证项**:
- [ ] 命令执行成功，无错误
- [ ] 终端显示采集到的文章数量
- [ ] 文件 `data/zhihu_ai_hot.xlsx` 被创建

#### 验证 3.2.3: Excel 文件内容验证

**命令**:
```bash
ls -la data/
open data/zhihu_ai_hot.xlsx
```

**验证项**:
- [ ] 文件存在且非空
- [ ] 可用 Excel 或 Numbers 正常打开
- [ ] 包含正确的表头: 序号、标题、链接、采集时间
- [ ] 包含数据行 (1-10条)
- [ ] 链接可点击跳转

#### 验证 3.2.4: 定时模式启动验证

**命令**:
```bash
python main.py --schedule --hour 10 --minute 30
```

**预期输出**:
```
定时任务已启动，每天 10:30 执行
```

**验证项**:
- [ ] 程序保持运行状态 (阻塞式)
- [ ] 显示正确的定时信息
- 使用 `Ctrl+C` 正常停止

**注意**: 定时任务验证建议在测试环境中进行，避免长时间运行。

### 3.3 功能性验证

#### 验证 3.3.1: 数据获取验证

**验证项**:
- [ ] 能成功获取知乎 API 响应
- [ ] 返回文章数量 ≤ 10条
- [ ] 每条记录包含标题和链接
- [ ] 链接格式正确

#### 验证 3.3.2: 数据保存验证

**验证项**:
- [ ] Excel 文件格式正确 (xlsx)
- [ ] 中文字符正确显示 (无乱码)
- [ ] 采集时间戳正确 (YYYY-MM-DD HH:MM:SS)
- [ ] 多次执行覆盖同一文件或创建新文件

#### 验证 3.3.3: 错误处理验证

**验证项**:
- [ ] 网络断开时显示错误信息，不崩溃
- [ ] API 返回异常时优雅处理
- [ ] 文件目录不存在时自动创建

---

## 4. 成功标准 (Success Criteria)

### 4.1 功能性标准

| 标准ID | 描述 | 优先级 | 验证方式 |
|--------|------|--------|----------|
| FS-01 | 能成功获取知乎热门AI文章数据 | P0 | 手动验证 |
| FS-02 | 每次最多返回10条文章 | P0 | 单元测试 |
| FS-03 | 文章数据包含标题和链接 | P0 | 单元测试 + 手动验证 |
| FS-04 | 能成功保存为Excel文件 | P0 | 手动验证 |
| FS-05 | Excel文件包含正确表头 | P0 | 手动验证 |
| FS-06 | 支持单次执行模式 | P0 | 手动验证 |
| FS-07 | 支持定时执行模式 | P1 | 手动验证 |
| FS-08 | 支持自定义定时时间 | P1 | 手动验证 |

### 4.2 质量标准

| 标准ID | 描述 | 优先级 | 验证方式 |
|--------|------|--------|----------|
| QS-01 | 所有单元测试通过 (100%) | P0 | pytest |
| QS-02 | 所有集成测试通过 | P0 | pytest |
| QS-03 | 代码无语法错误 | P0 | python -m py_compile |
| QS-04 | 依赖版本符合 requirements.txt | P1 | pip list |

### 4.3 性能标准

| 标准ID | 描述 | 优先级 | 目标值 |
|--------|------|--------|--------|
| PS-01 | 单次执行响应时间 | P1 | < 30秒 |
| PS-02 | 内存占用 | P2 | < 100MB |

### 4.4 可靠性标准

| 标准ID | 描述 | 优先级 | 验证方式 |
|--------|------|--------|----------|
| RS-01 | 网络异常时返回空列表 | P0 | 单元测试 |
| RS-02 | API异常时捕获错误并记录 | P0 | 单元测试 |
| RS-03 | 目录不存在时自动创建 | P1 | 单元测试 |

### 4.5 完成检查清单

**测试阶段完成标准**:
- [ ] 所有 P0 标准已满足
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 手动验证所有功能项通过
- [ ] 无已知阻塞性缺陷
- [ ] 代码审查通过

**发布阶段完成标准**:
- [ ] 所有质量标准已满足
- [ ] 性能测试结果符合预期
- [ ] 文档完整 (README, requirements.txt)
- [ ] CI/CD 流水线绿色

---

## 5. 测试环境

### 5.1 环境配置

| 组件 | 版本 | 说明 |
|------|------|------|
| Python | 3.8+ | 运行时环境 |
| requests | 2.31.0 | HTTP客户端 |
| beautifulsoup4 | 4.12.2 | HTML解析 (备用) |
| openpyxl | 3.1.2 | Excel处理 |
| APScheduler | 3.10.4 | 定时任务 |
| pytest | 最新版 | 测试框架 |
| pytest-mock | 最新版 | Mock支持 |

### 5.2 测试数据

- Mock API 响应数据 (5-15条记录)
- 空响应数据
- 异常响应数据 (网络错误、HTTP错误)

---

## 6. 缺陷管理

### 6.1 缺陷等级

| 等级 | 描述 | 示例 |
|------|------|------|
| P0 | 阻塞性缺陷 | 程序崩溃、核心功能不可用 |
| P1 | 严重缺陷 | 主要功能异常、数据错误 |
| P2 | 一般缺陷 | 非核心功能问题、界面问题 |
| P3 | 轻微缺陷 | 建议改进、文档错误 |

### 6.2 缺陷处理流程

1. 发现缺陷 → 记录到缺陷追踪系统
2. 分析复现 → 确认缺陷可复现
3. 分配修复 → 指定开发人员
4. 开发修复 → 代码修改
5. 验证修复 → 重新测试
6. 关闭缺陷 → 验证通过后关闭

---

## 7. 测试进度跟踪

| 阶段 | 计划开始 | 计划结束 | 状态 |
|------|---------|---------|------|
| 单元测试编写 | - | - | 待开始 |
| 单元测试执行 | - | - | 待开始 |
| 集成测试编写 | - | - | 待开始 |
| 集成测试执行 | - | - | 待开始 |
| 手动验证 | - | - | 待开始 |
| 回归测试 | - | - | 待开始 |

---

**文档版本**: 1.0  
**最后更新**: 2026-01-29  
**审核状态**: 待审核
