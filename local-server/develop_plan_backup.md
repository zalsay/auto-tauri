# 知乎热门AI文章定时抓取系统开发计划

## Goal
每天定时抓取知乎热门AI专栏的10条文章链接，自动保存为Excel格式数据文件

## Architecture

### 需要新增的文件：
1. **src/crawler/zhihu_crawler.py** - 知乎数据爬虫（使用requests + BeautifulSoup）
2. **src/scheduler/task_scheduler.py** - 定时任务调度器（使用schedule库）
3. **src/utils/excel_handler.py** - Excel文件处理器（基于现有create_esp32_excel.py）
4. **src/main.py** - 主程序入口，启动定时任务
5. **src/config/config.py** - 配置文件（抓取规则、时间间隔等）

### 需要修改的文件：
1. **requirements.txt** - 添加Python依赖包（requests, beautifulsoup4, openpyxl, schedule）
2. **package.json** - 添加爬虫启动脚本

### 数据结构：
```python
# 文章数据格式
{
    "id": "序号",
    "title": "标题", 
    "link": "链接",
    "author": "作者",
    "publish_time": "发布时间",
    "category": "文章类型"
}
```

### 外部依赖：
- **requests**: HTTP请求处理
- **beautifulsoup4**: HTML解析
- **openpyxl**: Excel文件生成
- **schedule**: 定时任务调度
- **lxml**: HTML解析加速

## Step-by-Step Implementation

### Step 1: 环境准备和依赖安装
```bash
pip install requests beautifulsoup4 openpyxl schedule lxml
```

### Step 2: 创建配置文件 (src/config/config.py)
```python
import os

class Config:
    # 定时设置
    SCHEDULE_TIME = "09:00"  # 每天上午9点执行
    TIMEZONE = "Asia/Shanghai"
    
    # 知乎爬取配置
    ZHIHU_CONFIG = {
        "base_url": "https://www.zhihu.com/topic/AI",
        "headers": {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        },
        "selectors": {
            "article_title": ".ContentItem-title a",
            "article_link": ".ContentItem-title a[href]",
            "author": ".AuthorInfo .UserLink-link",
            "time": ".ContentItem-time"
        }
    }
    
    # 输出配置
    OUTPUT_CONFIG = {
        "excel_file": "zhihu_ai_articles.xlsx",
        "backup_dir": "backups"
    }
    
    # 抓取限制
    MAX_ARTICLES = 10
    REQUEST_TIMEOUT = 10
    RETRY_TIMES = 3
```

### Step 3: 实现Excel处理器 (src/utils/excel_handler.py)
```python
import openpyxl
from openpyxl import Workbook
from datetime import datetime
import os

class ExcelHandler:
    def __init__(self, file_path):
        self.file_path = file_path
        self.wb = Workbook()
        self.ws = self.wb.active
        self.ws.title = "知乎AI文章"
        
        # 设置表头
        headers = ["序号", "标题", "链接", "作者", "发布时间", "文章类型", "抓取时间"]
        for col, header in enumerate(headers, 1):
            self.ws.cell(row=1, column=col, value=header)
            
        # 设置列宽
        column_widths = [8, 80, 60, 20, 20, 15, 20]
        for col, width in enumerate(column_widths, 1):
            self.ws.column_dimensions[self.ws.cell(row=1, column=col).column_letter].width = width
    
    def add_articles(self, articles):
        """添加文章数据"""
        for idx, article in enumerate(articles, 2):
            self.ws.cell(row=idx, column=1, value=idx-1)  # 序号
            self.ws.cell(row=idx, column=2, value=article.get('title', ''))
            self.ws.cell(row=idx, column=3, value=article.get('link', ''))
            self.ws.cell(row=idx, column=4, value=article.get('author', ''))
            self.ws.cell(row=idx, column=5, value=article.get('publish_time', ''))
            self.ws.cell(row=idx, column=6, value=article.get('category', 'AI相关'))
            self.ws.cell(row=idx, column=7, value=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    
    def save(self):
        """保存Excel文件"""
        # 确保目录存在
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        
        # 使用临时文件避免损坏
        temp_file = f"{self.file_path}.tmp"
        self.wb.save(temp_file)
        
        # 原子操作：重命名临时文件
        if os.path.exists(self.file_path):
            os.remove(self.file_path)
        os.rename(temp_file, self.file_path)
        
        print(f"Excel文件已保存: {self.file_path}")
    
    @classmethod
    def read_existing(cls, file_path):
        """读取现有Excel文件"""
        if not os.path.exists(file_path):
            return []
            
        wb = openpyxl.load_workbook(file_path)
        ws = wb.active
        articles = []
        
        for row in range(2, ws.max_row + 1):
            article = {
                'id': ws.cell(row=row, column=1).value,
                'title': ws.cell(row=row, column=2).value,
                'link': ws.cell(row=row, column=3).value,
                'author': ws.cell(row=row, column=4).value,
                'publish_time': ws.cell(row=row, column=5).value,
                'category': ws.cell(row=row, column=6).value
            }
            articles.append(article)
        
        return articles
```

### Step 4: 实现知乎爬虫 (src/crawler/zhihu_crawler.py)
```python
import requests
from bs4 import BeautifulSoup
import time
import random
from urllib.parse import urljoin
import json

class ZhihuCrawler:
    def __init__(self, config):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(config['headers'])
    
    def fetch_articles(self, limit=10):
        """获取知乎AI文章"""
        articles = []
        retry_count = 0
        
        while len(articles) < limit and retry_count < self.config['RETRY_TIMES']:
            try:
                response = self.session.get(
                    self.config['base_url'],
                    timeout=self.config['REQUEST_TIMEOUT']
                )
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'lxml')
                articles = self._parse_articles(soup, limit)
                
                if not articles:
                    retry_count += 1
                    time.sleep(random.uniform(1, 3))
                    
            except requests.RequestException as e:
                print(f"请求失败 (尝试 {retry_count + 1}/{self.config['RETRY_TIMES']}): {e}")
                retry_count += 1
                time.sleep(random.uniform(2, 5))
        
        return articles[:limit]
    
    def _parse_articles(self, soup, limit):
        """解析HTML获取文章信息"""
        articles = []
        
        # 查找文章链接
        title_links = soup.select(self.config['selectors']['article_link'])
        
        for idx, link in enumerate(title_links[:limit]):
            try:
                title = link.get_text(strip=True)
                href = link.get('href', '')
                
                # 构造完整链接
                if href.startswith('/'):
                    href = urljoin('https://www.zhihu.com', href)
                elif not href.startswith('http'):
                    href = urljoin('https://www.zhihu.com', href)
                
                article = {
                    'id': idx + 1,
                    'title': title,
                    'link': href,
                    'author': self._extract_author(soup, idx),
                    'publish_time': self._extract_time(soup, idx),
                    'category': 'AI相关'
                }
                
                articles.append(article)
                
            except Exception as e:
                print(f"解析第{idx}篇文章时出错: {e}")
                continue
        
        return articles
    
    def _extract_author(self, soup, index):
        """提取作者信息"""
        try:
            authors = soup.select(self.config['selectors']['author'])
            if index < len(authors):
                return authors[index].get_text(strip=True)
        except:
            pass
        return "未知作者"
    
    def _extract_time(self, soup, index):
        """提取发布时间"""
        try:
            times = soup.select(self.config['selectors']['time'])
            if index < len(times):
                return times[index].get_text(strip=True)
        except:
            pass
        return "未知时间"
```

### Step 5: 实现定时任务调度器 (src/scheduler/task_scheduler.py)
```python
import schedule
import time
import threading
from datetime import datetime
import os
from ..crawler.zhihu_crawler import ZhihuCrawler
from ..utils.excel_handler import ExcelHandler
from ..config.config import Config

class TaskScheduler:
    def __init__(self):
        self.config = Config()
        self.crawler = ZhihuCrawler(self.config.ZHIHU_CONFIG)
        self.is_running = False
        self.thread = None
    
    def start(self):
        """启动定时任务"""
        if self.is_running:
            print("任务已在运行中")
            return
        
        # 设置定时任务
        schedule.every().day.at(self.config.SCHEDULE_TIME).do(self._run_task)
        
        self.is_running = True
        self.thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self.thread.start()
        
        print(f"定时任务已启动，将在每日 {self.config.SCHEDULE_TIME} 执行")
    
    def stop(self):
        """停止定时任务"""
        self.is_running = False
        schedule.clear()
        if self.thread:
            self.thread.join()
        print("定时任务已停止")
    
    def run_once(self):
        """立即执行一次任务"""
        self._run_task()
    
    def _run_scheduler(self):
        """运行调度器"""
        while self.is_running:
            schedule.run_pending()
            time.sleep(60)  # 每分钟检查一次
    
    def _run_task(self):
        """执行抓取任务"""
        print(f"开始执行定时任务: {datetime.now()}")
        
        try:
            # 获取文章
            articles = self.crawler.fetch_articles(self.config.MAX_ARTICLES)
            
            if not articles:
                print("未获取到任何文章")
                return
            
            # 读取现有数据并去重
            existing_file = self.config.OUTPUT_CONFIG['excel_file']
            existing_articles = ExcelHandler.read_existing(existing_file)
            
            # 去重逻辑
            existing_links = {article['link'] for article in existing_articles}
            new_articles = [a for a in articles if a['link'] not in existing_links]
            
            if not new_articles:
                print("没有新文章需要添加")
                return
            
            # 生成Excel文件
            excel_handler = ExcelHandler(existing_file)
            
            # 合并新旧数据
            all_articles = existing_articles + new_articles
            
            # 重新设置序号
            for idx, article in enumerate(all_articles, 1):
                article['id'] = idx
            
            # 清除现有数据并添加合并后的数据
            excel_handler.ws.delete_rows(2, excel_handler.ws.max_row)
            excel_handler.add_articles(all_articles)
            excel_handler.save()
            
            print(f"任务完成，新增 {len(new_articles)} 篇文章，总计 {len(all_articles)} 篇")
            
        except Exception as e:
            print(f"任务执行失败: {e}")
```

### Step 6: 实现主程序 (src/main.py)
```python
import sys
import argparse
from scheduler.task_scheduler import TaskScheduler

def main():
    parser = argparse.ArgumentParser(description='知乎AI文章定时抓取系统')
    parser.add_argument('--once', action='store_true', help='立即执行一次任务')
    parser.add_argument('--start', action='store_true', help='启动定时任务')
    parser.add_argument('--stop', action='store_true', help='停止定时任务')
    
    args = parser.parse_args()
    
    scheduler = TaskScheduler()
    
    if args.once:
        print("立即执行任务...")
        scheduler.run_once()
    elif args.start:
        print("启动定时任务...")
        scheduler.start()
        
        try:
            # 保持主线程运行
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n收到停止信号...")
            scheduler.stop()
    elif args.stop:
        scheduler.stop()
    else:
        # 默认立即执行一次
        print("执行单次任务...")
        scheduler.run_once()

if __name__ == "__main__":
    main()
```

### Step 7: 更新package.json脚本
```json
{
  "scripts": {
    "start": "opencode serve",
    "serve": "opencode serve --port 54096 --hostname 127.0.0.1 --cors http://localhost:1420 tauri://localhost",
    "serve:opencode": "./start-opencode.sh",
    "web": "opencode web --port 3000",
    "test": "node test-client.js && node test-omo-integration.js",
    "test:omo": "node test-omo-integration.js",
    "demo": "node session-demo.js",
    "crawler": "python src/main.py --once",
    "crawler:start": "python src/main.py --start",
    "crawler:stop": "python src/main.py --stop"
  }
}
```

### Step 8: 创建requirements.txt
```
requests>=2.28.0
beautifulsoup4>=4.11.0
openpyxl>=3.0.0
schedule>=1.2.0
lxml>=4.9.0
```

## Edge Cases

### 可能出现的问题：

1. **网络请求失败**
   - 问题：知乎反爬虫机制，可能返回403或需要验证码
   - 解决：添加User-Agent伪装、请求间隔、错误重试机制

2. **HTML结构变化**
   - 问题：知乎页面结构更新，选择器失效
   - 解决：增加多种选择器备选方案，定期检查解析成功率

3. **定时任务异常**
   - 问题：任务执行过程中抛出未捕获异常
   - 解决：添加完整异常处理和日志记录机制

4. **Excel文件冲突**
   - 问题：多个任务同时写入Excel文件
   - 解决：使用临时文件+原子操作避免文件损坏

5. **内存泄漏**
   - 问题：长期运行导致内存积累
   - 解决：及时释放BeautifulSoup对象，定期重启进程

6. **时区问题**
   - 问题：定时任务执行时间不准确
   - 解决：明确设置系统时区为Asia/Shanghai

7. **数据重复**
   - 问题：重复文章被多次保存
   - 解决：基于链接去重，读取历史数据避免重复

8. **Excel格式错误**
   - 问题：写入过程中程序崩溃导致文件损坏
   - 解决：先写入临时文件，成功后原子性重命名

### 监控和日志：
- 添加详细执行日志
- 监控任务成功率
- 设置失败告警机制
- 提供手动重试功能
- 数据备份和恢复机制

### 性能优化：
- 使用连接池复用HTTP连接
- 缓存解析结果减少重复请求
- 异步处理提高并发性能
- 定期清理历史数据控制文件大小