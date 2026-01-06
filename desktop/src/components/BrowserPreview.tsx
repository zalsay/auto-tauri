import React, { useState } from 'react';

interface BrowserState {
    url: string;
    title: string;
    isLoading: boolean;
    screenshot?: string;
}

interface BrowserPreviewProps {
    browserState: BrowserState;
    generatedCode: string;
    onSaveScript: () => void;
    onExecuteScript?: () => void;
}

export const BrowserPreview: React.FC<BrowserPreviewProps> = ({
    browserState,
    generatedCode,
    onSaveScript,
    onExecuteScript,
}) => {
    const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
    const [copied, setCopied] = useState(false);

    const handleCopyCode = () => {
        navigator.clipboard.writeText(generatedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="browser-preview">
            <div className="preview-header">
                <div className="tab-buttons">
                    <button
                        className={activeTab === 'preview' ? 'active' : ''}
                        onClick={() => setActiveTab('preview')}
                    >
                        🌐 浏览器预览
                    </button>
                    <button
                        className={activeTab === 'code' ? 'active' : ''}
                        onClick={() => setActiveTab('code')}
                    >
                        📝 生成代码
                    </button>
                </div>

                {activeTab === 'code' && generatedCode && (
                    <div className="code-actions">
                        <button onClick={handleCopyCode}>
                            {copied ? '✓ 已复制' : '📋 复制'}
                        </button>
                        <button onClick={onSaveScript} className="save-btn">
                            💾 保存脚本
                        </button>
                        {onExecuteScript && (
                            <button onClick={onExecuteScript} className="execute-btn">
                                ▶️ 执行脚本
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="preview-content">
                {activeTab === 'preview' ? (
                    <div className="browser-view">
                        <div className="url-bar">
                            <span className="url-icon">🔒</span>
                            <span className="url-text">{browserState.url || '等待导航...'}</span>
                            {browserState.isLoading && <span className="loading-spinner">⏳</span>}
                        </div>

                        <div className="browser-frame">
                            {browserState.screenshot ? (
                                <img
                                    src={`data:image/png;base64,${browserState.screenshot}`}
                                    alt="Browser Screenshot"
                                    className="screenshot"
                                />
                            ) : (
                                <div className="placeholder">
                                    <p>🖥️ 浏览器预览区域</p>
                                    <p>通过左侧对话框发送指令开始操作</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="code-view">
                        {generatedCode ? (
                            <pre className="code-block">
                                <code>{generatedCode}</code>
                            </pre>
                        ) : (
                            <div className="placeholder">
                                <p>📝 代码生成区域</p>
                                <p>操作完成后将在此显示生成的 Playwright 代码</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BrowserPreview;
