### Step 1: 项目初始化
创建项目目录并初始化 Python 虚拟环境：
```bash
mkdir zhihu-ai-hot
cd zhihu-ai-hot
python3 -m venv venv
source venv/bin/activate
pip install requests beautifulsoup4 openpyxl apscheduler
```

### Step 2: 项目结构创建
建立以下目录结构：
```
zhihu-ai-hot/
├── src/
│   ├── __init__.py
│   ├── crawler.py      # 知乎爬虫模块
│   ├── excel_handler.py # Excel 操作模块
│   └── scheduler.py    # 定时任务模块
├── data/               # Excel 存储目录
├── tests/
├── main.py             # 入口文件
└── requirements.txt
```

### Step 3: 知乎热门AI爬虫实现
在 `src/crawler.py` 中实现爬虫逻辑：
```python
import requests
from bs4 import BeautifulSoup
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_zhihu_ai_hot_articles():
    url = "https://www.zhihu.com/api/v4/creators/rank/hot"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        articles = []
        for item in data.get("data", [])[:10]:
            articles.append({
                "title": item.get("target", {}).get("title", ""),
                "url": f"https://www.zhihu.com/question/{item.get('target', {}).get('question_id', '')}"
            })
        return articles
    except Exception as e:
        logger.error(f"爬取失败: {e}")
        return []
```

### Step 4: Excel 写入模块实现
在 `src/excel_handler.py` 中实现：
```python
from openpyxl import Workbook
from datetime import datetime
import os

def save_to_excel(articles, filepath="data/zhihu_ai_hot.xlsx"):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "AI热门文章"
    ws.append(["序号", "标题", "链接", "采集时间"])
    for i, article in enumerate(articles, 1):
        ws.append([i, article["title"], article["url"], datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
    ws.column_dimensions['B'].width = 80
    ws.column_dimensions['C'].width = 50
    wb.save(filepath)
    print(f"已保存 {len(articles)} 条记录到 {filepath}")
```

### Step 5: 定时任务模块实现
在 `src/scheduler.py` 中使用 APScheduler：
```python
from apscheduler.schedulers.blocking import BlockingScheduler
from crawler import get_zhihu_ai_hot_articles
from excel_handler import save_to_excel

def daily_task():
    print(f"开始执行任务: {datetime.now()}")
    articles = get_zhihu_ai_hot_articles()
    if articles:
        save_to_excel(articles)
    else:
        print("未获取到文章数据")

def start_scheduler(hour=9, minute=0):
    scheduler = BlockingScheduler()
    scheduler.add_job(daily_task, 'cron', hour=hour, minute=minute)
    print(f"定时任务已启动，每天 {hour:02d}:{minute:02d} 执行")
    scheduler.start()
```

### Step 6: 命令行参数支持
在 `main.py` 中实现 CLI：
```python
import argparse
from crawler import get_zhihu_ai_hot_articles
from excel_handler import save_to_excel
from scheduler import start_scheduler

def main():
    parser = argparse.ArgumentParser(description="知乎热门AI文章采集工具")
    parser.add_argument("--schedule", action="store_true", help="启用定时任务模式")
    parser.add_argument("--hour", type=int, default=9, help="定时任务执行小时(默认9)")
    parser.add_argument("--minute", type=int, default=0, help="定时任务执行分钟(默认0)")
    args = parser.parse_args()

    if args.schedule:
        start_scheduler(args.hour, args.minute)
    else:
        articles = get_zhihu_ai_hot_articles()
        save_to_excel(articles)

if __name__ == "__main__":
    main()
```

### Step 7: requirements.txt 编写
```
requests==2.31.0
beautifulsoup4==4.12.2
openpyxl==3.1.2
APScheduler==3.10.4
```

### Step 8: 测试用例编写
在 `tests/test_crawler.py` 中：
```python
import pytest
from src.crawler import get_zhihu_ai_hot_articles

def test_get_articles():
    articles = get_zhihu_ai_hot_articles()
    assert isinstance(articles, list)
    assert len(articles) <= 10
    if articles:
        assert "title" in articles[0]
        assert "url" in articles[0]
```

### Step 9: 测试与验证
```bash
source venv/bin/activate
pytest tests/ -v
python main.py
ls -la data/
open data/zhihu_ai_hot.xlsx
python main.py --schedule
```
