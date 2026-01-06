import { ActionIntent } from '../types';

/**
 * 对话解析器
 * 将用户的自然语言指令解析为操作意图
 */
export class Parser {

    /**
     * 解析用户输入，提取操作意图
     * 只处理简单明确的命令，复杂请求返回 null 交给 LLM
     */
    parse(userInput: string): ActionIntent | null {
        const input = userInput.toLowerCase().trim();

        // 如果输入太复杂（包含多个动作词或太长），交给 LLM 处理
        if (this.isComplexRequest(input)) {
            return null;
        }

        // 导航操作 - 只匹配已知网站
        const navigateMatch = input.match(/^(?:打开|访问|去|进入|跳转(?:到)?)\s*(.+)$/);
        if (navigateMatch) {
            const target = navigateMatch[1].trim();
            const url = this.extractUrl(target);
            // 只有成功匹配已知网站才返回，否则交给 LLM
            if (url) {
                return {
                    action: 'navigate',
                    url,
                    description: `导航到 ${url}`
                };
            }
            return null;
        }

        // 点击操作
        const clickMatch = input.match(/^(?:点击|按|选择|点)\s*(.+)$/);
        if (clickMatch) {
            const target = clickMatch[1].trim();
            return {
                action: 'click',
                selector: this.inferSelector(target),
                description: `点击 ${target}`
            };
        }

        // 输入操作
        const fillMatch = input.match(/(?:输入|填写|写入|填入)\s*["""]?(.+?)["""]?\s*(?:到|在)\s*(.+)/);
        if (fillMatch) {
            return {
                action: 'fill',
                value: fillMatch[1].trim(),
                selector: this.inferSelector(fillMatch[2].trim()),
                description: `在 ${fillMatch[2]} 输入 "${fillMatch[1]}"`
            };
        }

        // 搜索操作（简化输入）- 需要先打开页面
        // 暂时禁用，交给 LLM 处理复杂搜索流程
        // const searchMatch = input.match(/(?:搜索|搜)\s*(.+)/);

        // 等待操作
        const waitMatch = input.match(/^(?:等待|等)\s*(\d+)\s*秒?$/);
        if (waitMatch) {
            return {
                action: 'wait',
                value: waitMatch[1],
                description: `等待 ${waitMatch[1]} 秒`
            };
        }

        // 截图操作
        if (input === '截图' || input === '截屏' || input === 'screenshot') {
            return {
                action: 'screenshot',
                description: '截取当前页面'
            };
        }

        // 滚动操作
        const scrollMatch = input.match(/^(?:滚动|向下|向上)\s*(到底部|到顶部)?$/);
        if (scrollMatch) {
            return {
                action: 'scroll',
                value: scrollMatch[1] || 'down',
                description: `滚动页面 ${scrollMatch[1] || '向下'}`
            };
        }

        return null;
    }

    /**
     * 检测是否为复杂请求
     */
    private isComplexRequest(input: string): boolean {
        // 包含多个动作词
        const actionWords = ['打开', '访问', '搜索', '点击', '输入', '查找', '获取', '抓取'];
        const matchedActions = actionWords.filter(word => input.includes(word));
        if (matchedActions.length > 1) return true;

        // 输入太长（可能是复杂描述）
        if (input.length > 30) return true;

        // 包含数字+条/个等量词（如"10条热点"）
        if (/\d+\s*(条|个|篇|项)/.test(input)) return true;

        return false;
    }

    /**
     * 提取或构造 URL
     * 返回 null 表示未知网站，交给 LLM 处理
     */
    private extractUrl(target: string): string | null {
        // 已经是完整 URL
        if (target.startsWith('http://') || target.startsWith('https://')) {
            return target;
        }

        // 常见网站简写
        const siteMap: Record<string, string> = {
            '淘宝': 'https://www.taobao.com',
            'taobao': 'https://www.taobao.com',
            '京东': 'https://www.jd.com',
            'jd': 'https://www.jd.com',
            '百度': 'https://www.baidu.com',
            'baidu': 'https://www.baidu.com',
            'google': 'https://www.google.com',
            '谷歌': 'https://www.google.com',
            '小红书': 'https://www.xiaohongshu.com',
            'xhs': 'https://www.xiaohongshu.com',
            'github': 'https://github.com',
            '微博': 'https://weibo.com',
            'weibo': 'https://weibo.com',
            'bilibili': 'https://www.bilibili.com',
            'b站': 'https://www.bilibili.com',
            '知乎': 'https://www.zhihu.com',
            'zhihu': 'https://www.zhihu.com',
        };

        // 精确匹配
        if (siteMap[target]) {
            return siteMap[target];
        }

        // 包含匹配
        for (const [key, url] of Object.entries(siteMap)) {
            if (target === key) {
                return url;
            }
        }

        // 已包含域名后缀的情况
        if (target.includes('.') && !target.includes(' ')) {
            return target.startsWith('www.') ? `https://${target}` : `https://${target}`;
        }

        // 未知网站，返回 null 交给 LLM
        return null;
    }

    /**
     * 推断选择器
     */
    private inferSelector(target: string): string {
        // 常见元素映射
        const selectorMap: Record<string, string> = {
            '搜索框': 'input[type="search"], input[name*="search"], input[placeholder*="搜索"], #q',
            '搜索按钮': 'button[type="submit"], .btn-search, .search-btn, [class*="search"] button',
            '登录': '[class*="login"], [id*="login"], a:has-text("登录"), button:has-text("登录")',
            '注册': '[class*="register"], [id*="register"], a:has-text("注册"), button:has-text("注册")',
            '提交': 'button[type="submit"], input[type="submit"], .submit-btn',
            '确认': 'button:has-text("确认"), button:has-text("确定"), .confirm-btn',
            '取消': 'button:has-text("取消"), .cancel-btn',
        };

        for (const [key, selector] of Object.entries(selectorMap)) {
            if (target.includes(key)) {
                return selector;
            }
        }

        // 返回文本选择器
        return `text="${target}"`;
    }
}

export const parser = new Parser();
