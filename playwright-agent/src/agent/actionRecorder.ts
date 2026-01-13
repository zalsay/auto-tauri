import { Page, BrowserContext } from 'playwright';
import { ActionIntent } from '../types';

/**
 * 操作录制器
 * 监听浏览器事件并记录用户操作
 */
export class ActionRecorder {
    private actions: ActionIntent[] = [];
    private isRecording: boolean = false;

    /**
     * 开始录制
     */
    async startRecording(page: Page): Promise<void> {
        this.isRecording = true;
        this.actions = [];

        // 监听导航事件
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame() && this.isRecording) {
                this.actions.push({
                    action: 'navigate',
                    url: frame.url(),
                    description: `导航到 ${frame.url()}`
                });
            }
        });

        // 注入录制脚本
        await page.exposeFunction('__recordAction', (action: ActionIntent) => {
            if (this.isRecording) {
                this.actions.push(action);
            }
        });

        await page.addInitScript(() => {
            // 监听点击事件
            document.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const selector = getSelector(target);
                (window as any).__recordAction({
                    action: 'click',
                    selector,
                    description: `点击 ${target.tagName.toLowerCase()}`
                });
            }, true);

            // 监听输入事件
            document.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                    const selector = getSelector(target);
                    (window as any).__recordAction({
                        action: 'fill',
                        selector,
                        value: target.value,
                        description: `输入 "${target.value}"`
                    });
                }
            }, true);

            // 生成元素选择器
            function getSelector(el: HTMLElement): string {
                if (el.id) return `#${el.id}`;
                if (el.className && typeof el.className === 'string') {
                    const classes = el.className.split(' ').filter(c => c).slice(0, 2).join('.');
                    if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
                }
                return el.tagName.toLowerCase();
            }
        });
    }

    /**
     * 停止录制
     */
    stopRecording(): ActionIntent[] {
        this.isRecording = false;
        return [...this.actions];
    }

    /**
     * 获取当前录制的操作
     */
    getActions(): ActionIntent[] {
        return [...this.actions];
    }

    /**
     * 清空录制
     */
    clear(): void {
        this.actions = [];
    }
}

export const actionRecorder = new ActionRecorder();
