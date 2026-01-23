# 知乎热门AI文章定时抓取系统开发计划

## Goal
开发一个定时任务系统，每天自动抓取知乎热门AI分类的10条文章链接，并保存到Excel文件中。

## Architecture
### 新增文件
- `src/crawler/zhihu_crawler.py` - 知乎文章抓取器
- `src/scheduler/task_scheduler.py` - 定时任务调度器  
- `src/excel/excel_handler.py` - Excel文件操作处理器
- `src/utils/config.py` - 配置文件管理
- `src/main.py` - 主程序入口
- `requirements.txt` - 依赖包列表
- `.env` - 环境变量配置
- `config/schedule.yaml` - 定时任务配置

### 数据结构
- `Article` 数据类：包含 title, url, author, publish_time, hot_score 字段
- `ExcelData` 数据类：包含文章列表和元数据信息

## Step-by-Step Implementation

### 1. 项目基础设置
```bash
# 创建虚拟环境并安装依赖
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### 2. 配置文件实现
```python
# src/utils/config.py
import os
from typing import Dict, Any

class Config:
    def __init__(self):
        self.zhihu_base_url = "https://www.zhihu.com"
        self.ai_topic_url = f"{self.zhihu_base_url}/topic/19550517"
        self.excel_file_path = "data/zhihu_ai_articles.xlsx"
        self.target_article_count = 10
        self.schedule_time = "09:00"  # 每天上午9点执行
        
    def get_user_agent(self) -> str:
        return os.getenv('USER_AGENT', 'Mozilla/5.0 (compatible; ArticleBot/1.0)')
```

### 3. 知乎爬虫实现
```python
# src/crawler/zhihu_crawler.py
import requests
from bs4 import BeautifulSoup
import time
from typing import List
from dataclasses import dataclass

@dataclass
class Article:
    title: str
    url: str
    author: str = ""
    publish_time: str = ""
    hot_score: int = 0

class ZhihuCrawler:
    def __init__(self, config):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': config.get_user_agent()})
        
    def get_hot_ai_articles(self) -> List[Article]:
        """获取知乎热门AI文章列表"""
        try:
            # 模拟真实浏览器行为
            time.sleep(2)
            response = self.session.get(self.config.ai_topic_url)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            articles = self._parse_articles(soup)
            
            return articles[:self.config.target_article_count]
            
        except Exception as e:
            print(f"抓取文章失败: {e}")
            return []
    
    def _parse_articles(self, soup: BeautifulSoup) -> List[Article]:
        """解析文章列表"""
        articles = []
        # 根据实际页面结构调整选择器
        article_items = soup.find_all('div', class_='ContentItem')
        
        for item in article_items:
            try:
                title_element = item.find('h2')
                title = title_element.get_text().strip() if title_element else ""
                
                link_element = item.find('a', href=True)
                url = link_element['href'] if link_element else ""
                if url.startswith('/'):
                    url = f"https://www.zhihu.com{url}"
                    
                author_element = item.find('span', class_='UserLink')
                author = author_element.get_text().strip() if author_element else ""
                
                articles.append(Article(
                    title=title,
                    url=url,
                    author=author
                ))
                
            except Exception as e:
                print(f"解析文章项失败: {e}")
                continue
                
        return articles
```

### 4. Excel处理器实现
```python
# src/excel/excel_handler.py
import pandas as pd
from datetime import datetime
from typing import List
import os

class ExcelHandler:
    def __init__(self, file_path: str):
        self.file_path = file_path
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
    def save_articles(self, articles: List[Article], sheet_name: str = None):
        """保存文章到Excel文件"""
        if not sheet_name:
            sheet_name = datetime.now().strftime("%Y-%m-%d")
            
        # 准备数据
        data = []
        for article in articles:
            data.append({
                '标题': article.title,
                '链接': article.url,
                '作者': article.author,
                '发布时间': article.publish_time,
                '热度分数': article.hot_score,
                '抓取时间': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
            
        df = pd.DataFrame(data)
        
        # 使用ExcelWriter支持多sheet
        with pd.ExcelWriter(self.file_path, engine='openpyxl', mode='a', 
                           if_sheet_exists='replace') as writer:
            df.to_excel(writer, sheet_name=sheet_name, index=False)
            
    def create_summary_sheet(self):
        """创建汇总信息sheet"""
        summary_data = {
            '统计项目': ['最后更新', '总文章数', '数据源'],
            '数值': [
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                '待计算',
                '知乎热门AI'
            ]
        }
        
        summary_df = pd.DataFrame(summary_data)
        
        with pd.ExcelWriter(self.file_path, engine='openpyxl', mode='a',
                           if_sheet_exists='replace') as writer:
            summary_df.to_excel(writer, sheet_name='汇总信息', index=False)
```

### 5. 定时任务调度器实现
```python
# src/scheduler/task_scheduler.py
import schedule
import time
from datetime import datetime
import logging
from ..crawler.zhihu_crawler import ZhihuCrawler
from ..excel.excel_handler import ExcelHandler
from ..utils.config import Config

class TaskScheduler:
    def __init__(self):
        self.config = Config()
        self.crawler = ZhihuCrawler(self.config)
        self.excel_handler = ExcelHandler(self.config.excel_file_path)
        self._setup_logging()
        
    def _setup_logging(self):
        """设置日志"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('logs/scheduler.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
    def run_daily_task(self):
        """执行每日抓取任务"""
        self.logger.info("开始执行每日抓取任务")
        
        try:
            # 抓取文章
            articles = self.crawler.get_hot_ai_articles()
            
            if articles:
                # 保存到Excel
                self.excel_handler.save_articles(articles)
                self.logger.info(f"成功抓取并保存 {len(articles)} 篇文章")
            else:
                self.logger.warning("未获取到任何文章")
                
        except Exception as e:
            self.logger.error(f"任务执行失败: {e}")
            
    def start(self):
        """启动定时任务"""
        schedule.every().day.at(self.config.schedule_time).do(self.run_daily_task)
        self.logger.info(f"定时任务已启动，将在每天 {self.config.schedule_time} 执行")
        
        while True:
            schedule.run_pending()
            time.sleep(60)  # 每分钟检查一次
```

### 6. 主程序入口
```python
# src/main.py
import sys
import os
from scheduler.task_scheduler import TaskScheduler

def main():
    print("知乎热门AI文章定时抓取系统启动")
    
    # 创建日志目录
    os.makedirs('logs', exist_ok=True)
    
    # 启动定时任务
    scheduler = TaskScheduler()
    scheduler.start()

if __name__ == "__main__":
    main()
```

## Edge Cases
1. **网络请求失败**: 需要重试机制和错误恢复
2. **知乎反爬虫**: 可能需要使用代理池、请求频率控制
3. **Excel文件权限**: 确保有写入权限，避免文件被占用
4. **页面结构变化**: 需要监控解析逻辑，及时更新选择器
5. **定时任务中断**: 需要持久化运行状态，支持断点续传
6. **内存泄漏**: 长时间运行需要监控内存使用
7. **数据去重**: 避免重复保存相同文章
8. **并发控制**: 确保单例运行，避免重复执行