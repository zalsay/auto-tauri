# 知乎爬虫项目测试计划

## 测试概述
本测试计划针对知乎文章爬虫系统进行全面的质量保证测试，确保系统各个模块功能正常，模块间协作顺畅，满足业务需求。

## 1. Unit Tests（单元测试）

### 1.1 Article类测试
**测试目标**: 验证文章数据结构封装和字段操作
**测试类**: `test_article.py`

**测试用例**:
- `test_article_creation()`: 测试Article对象创建和字段赋值
- `test_article_validation()`: 测试文章数据验证逻辑
- `test_article_to_dict()`: 测试对象转字典方法
- `test_article_from_dict()`: 测试字典转对象方法

**Mock数据**:
```python
mock_article_data = {
    "title": "测试文章标题",
    "url": "https://www.zhihu.com/question/123456",
    "publish_time": "2024-01-25 10:30:00",
    "fetch_time": "2024-01-25 14:30:00"
}
```

### 1.2 ZhihuSpider类测试
**测试目标**: 验证知乎爬虫功能和数据解析
**测试类**: `test_zhihu_spider.py`

**测试用例**:
- `test_fetch_page()`: 测试页面获取功能
- `test_parse_articles()`: 测试文章解析功能
- `test_request_headers()`: 测试请求头设置
- `test_rate_limiting()`: 测试请求频率控制
- `test_error_handling()`: 测试网络异常处理

**Mock数据**:
```python
mock_html_response = """
<html>
    <body>
        <div class="ContentItem">
            <h2 class="ContentItem-title">
                <a href="/question/123456">测试文章标题</a>
            </h2>
            <div class="ContentItem-meta">
                <time>2024-01-25 10:30:00</time>
            </div>
        </div>
    </body>
</html>
"""

mock_network_error = ConnectionError("Network connection failed")
mock_timeout_error = TimeoutError("Request timeout")
```

### 1.3 ExcelHandler类测试
**测试目标**: 验证Excel文件操作和数据存储
**测试类**: `test_excel_handler.py`

**测试用例**:
- `test_create_workbook()`: 测试工作簿创建
- `test_write_headers()`: 测试表头写入
- `test_append_articles()`: 测试文章数据追加
- `test_format_cells()`: 测试单元格格式化
- `test_file_exists()`: 测试文件存在性检查

**Mock数据**:
```python
mock_articles = [
    Article("标题1", "url1", "2024-01-25 10:00:00", "2024-01-25 14:00:00"),
    Article("标题2", "url2", "2024-01-25 11:00:00", "2024-01-25 14:00:00")
]

mock_excel_path = "/tmp/test_articles.xlsx"
```

### 1.4 配置管理测试
**测试目标**: 验证配置参数加载和管理
**测试类**: `test_config.py`

**测试用例**:
- `test_load_config()`: 测试配置文件加载
- `test_get_spider_config()`: 测试爬虫配置获取
- `test_get_schedule_config()`: 测试调度配置获取
- `test_validate_config()`: 测试配置参数验证

**Mock数据**:
```python
mock_config = {
    "zhihu_url": "https://www.zhihu.com/api/v4/topstory/hot-list",
    "request_headers": {"User-Agent": "test-agent"},
    "schedule_time": "09:00",
    "excel_path": "/tmp/articles.xlsx",
    "request_delay": 1.0
}
```

### 1.5 日志记录测试
**测试目标**: 验证日志记录功能
**测试类**: `test_logging.py`

**测试用例**:
- `test_log_setup()`: 测试日志系统初始化
- `test_log_levels()`: 测试不同日志级别
- `test_log_format()`: 测试日志格式
- `test_log_rotation()`: 测试日志轮转

## 2. Integration Tests（集成测试）

### 2.1 爬虫到Excel流程测试
**测试目标**: 验证爬虫获取数据到Excel存储的完整流程
**测试类**: `test_spider_to_excel_integration.py`

**测试步骤**:
1. 启动模拟知乎服务器
2. 执行爬虫获取数据
3. 验证数据存储到Excel
4. 检查Excel文件完整性和格式

### 2.2 定时任务集成测试
**测试目标**: 验证定时任务调度功能
**测试类**: `test_schedule_integration.py`

**测试步骤**:
1. 配置测试用定时任务（1分钟执行一次）
2. 验证任务按计划执行
3. 检查任务执行状态记录
4. 验证异常情况处理

### 2.3 主程序集成测试
**测试目标**: 验证main.py主程序完整流程
**测试类**: `test_main_integration.py`

**测试步骤**:
1. 模拟完整运行周期
2. 验证所有模块正确加载
3. 检查配置参数传递
4. 验证错误处理机制

### 2.4 端到端测试
**测试目标**: 验证完整业务流程
**测试类**: `test_e2e.py`

**测试场景**:
- 正常业务流程：启动→爬取→存储→定时执行
- 异常恢复流程：网络异常→重试→成功执行
- 长时间运行测试：24小时稳定性测试

## 3. Manual Verification（手动验证）

### 3.1 开发环境验证
**验证步骤**:
1. **环境检查**
   ```bash
   python --version
   pip list | grep -E "requests|beautifulsoup4|openpyxl|pandas|schedule"
   ```

2. **依赖安装验证**
   ```bash
   pip install -r requirements.txt
   python -c "import requests, bs4, openpyxl, pandas, schedule; print('All dependencies OK')"
   ```

3. **项目结构验证**
   ```bash
   ls -la
   # 验证目录结构包含：src/, tests/, config/, logs/
   ```

### 3.2 功能模块验证
**验证步骤**:
1. **爬虫功能验证**
   ```bash
   python -m src.zhihu_spider
   # 检查输出日志和获取的数据量
   ```

2. **Excel操作验证**
   ```bash
   python -c "from src.excel_handler import ExcelHandler; eh = ExcelHandler(); print('ExcelHandler OK')"
   ```

3. **定时任务验证**
   ```bash
   python -c "import schedule; schedule.every().minute.do(lambda: print('test')).run_pending(); print('Schedule OK')"
   ```

### 3.3 配置管理验证
**验证步骤**:
1. **配置文件检查**
   ```bash
   python -c "from config import config; print('Config loaded:', config.get('zhihu_url'))"
   ```

2. **配置参数验证**
   ```bash
   python -c "from config import validate_config; validate_config()"
   ```

### 3.4 日志系统验证
**验证步骤**:
1. **日志文件生成**
   ```bash
   ls logs/
   # 检查日志文件是否存在
   ```

2. **日志内容检查**
   ```bash
   tail -f logs/app.log
   # 验证日志格式和内容
   ```

### 3.5 程序启动验证
**验证步骤**:
1. **程序启动**
   ```bash
   python main.py &
   # 验证程序正常启动
   ```

2. **进程检查**
   ```bash
   ps aux | grep python
   # 验证程序进程存在
   ```

3. **停止程序**
   ```bash
   pkill -f "python main.py"
   ```

## 4. Success Criteria（成功标准）

### 4.1 代码质量标准
- [ ] 所有单元测试用例通过率 ≥ 95%
- [ ] 代码覆盖率 ≥ 80%
- [ ] 无Pylint严重警告（评分 ≥ 8.0/10）
- [ ] 符合PEP 8代码规范

### 4.2 功能性标准
- [ ] 爬虫能够成功获取知乎热门AI文章数据
- [ ] Excel文件能够正确存储文章信息
- [ ] 定时任务能够按配置时间执行
- [ ] 配置文件能够正常加载和验证
- [ ] 日志系统能够正常记录运行状态

### 4.3 性能标准
- [ ] 单次爬虫执行时间 ≤ 30秒
- [ ] Excel文件写入性能 ≤ 10秒（100篇文章）
- [ ] 内存使用量 ≤ 512MB
- [ ] CPU使用率 ≤ 80%

### 4.4 稳定性标准
- [ ] 连续运行24小时无崩溃
- [ ] 网络异常情况下能够自动重试
- [ ] 配置文件缺失时程序能够优雅降级
- [ ] 磁盘空间不足时能够正确处理

### 4.5 安全标准
- [ ] 无敏感信息硬编码
- [ ] 网络请求使用适当的请求头
- [ ] 文件操作具有适当的权限控制
- [ ] 日志不包含敏感信息

### 4.6 用户体验标准
- [ ] 错误信息清晰易懂
- [ ] 程序启动时间 ≤ 10秒
- [ ] 配置文件修改后能够自动生效
- [ ] 提供完整的帮助文档和使用说明

## 5. 测试执行计划

### 5.1 测试阶段
1. **开发阶段测试**（并行进行）
   - 单元测试：每个模块开发完成后立即执行
   - 代码审查：每日的代码提交前进行

2. **集成测试阶段**
   - 模块集成：开发完成后进行
   - 系统集成：所有模块完成后进行

3. **验收测试阶段**
   - 功能验收：业务需求验证
   - 性能验收：性能指标验证
   - 用户验收：用户体验验证

### 5.2 测试环境
- **操作系统**: macOS（与生产环境一致）
- **Python版本**: 3.8+
- **测试数据**: 使用模拟数据和真实知乎数据进行混合测试
- **网络环境**: 稳定的互联网连接

### 5.3 风险评估
1. **网络依赖风险**: 知乎网站结构变化可能导致爬虫失效
2. **反爬虫风险**: 知乎可能加强反爬虫措施
3. **数据格式风险**: 文章数据格式变化可能影响解析
4. **第三方库风险**: 依赖库版本兼容性可能存在问题

### 5.4 测试报告
- **每日测试报告**: 记录测试执行情况和问题
- **阶段测试报告**: 详细记录测试结果和覆盖率
- **最终验收报告**: 完整的测试结果和发布建议