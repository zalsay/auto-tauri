import React from 'react';

interface ModeSelectionProps {
    onSelectMode: (mode: 'coding' | 'ai_assistant') => void;
    userEmail: string;
}

export default function ModeSelection({ onSelectMode, userEmail }: ModeSelectionProps) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-6xl">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        任务大师
                    </h1>
                    <p className="text-purple-300">
                        {userEmail}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <button
                        onClick={() => {
                            console.log('ModeSelection: clicking coding mode');
                            onSelectMode('coding');
                        }}
                        className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 p-8 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-500/25"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />

                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-4xl text-white">
                                    code
                                </span>
                            </div>

                            <h2 className="text-3xl font-bold text-white mb-4">
                                Coding全能大师
                            </h2>

                            <p className="text-orange-100 mb-6 leading-relaxed">
                                您的 AI 代码开发助手，支持多代理协同工作。
                            </p>

                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-white/90">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    <span>AI Workers 并行任务执行</span>
                                </div>
                                <div className="flex items-center gap-3 text-white/90">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    <span>Open-Cowork 自主代码重构</span>
                                </div>
                                <div className="flex items-center gap-3 text-white/90">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    <span>8 个专业 AI 代理协同</span>
                                </div>
                                <div className="flex items-center gap-3 text-white/90">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    <span>系统健康监控与快速修复</span>
                                </div>
                            </div>
                        </div>
                    </button>

                    <button
                        onClick={() => {
                            console.log('ModeSelection: clicking ai_assistant mode');
                            onSelectMode('ai_assistant');
                        }}
                        className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 p-8 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/25"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />

                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-4xl text-white">
                                    robot_2
                                </span>
                            </div>

                            <h2 className="text-3xl font-bold text-white mb-4">
                                AI 助理
                            </h2>

                            <p className="text-purple-100 mb-6 leading-relaxed">
                                智能浏览器自动化助手，对话式生成 Playwright 脚本。
                            </p>

                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-white/90">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    <span>自然语言交互生成代码</span>
                                </div>
                                <div className="flex items-center gap-3 text-white/90">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    <span>实时浏览器预览与调试</span>
                                </div>
                                <div className="flex items-center gap-3 text-white/90">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    <span>WebSocket 实时双向通信</span>
                                </div>
                                <div className="flex items-center gap-3 text-white/90">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                    <span>脚本保存与复用管理</span>
                                </div>
                            </div>
                        </div>
                    </button>
                </div>

                <div className="text-center mt-12">
                    <p className="text-white/50 text-sm">
                        选择一个模式开始您的 AI 助手之旅
                    </p>
                </div>
            </div>
        </div>
    );
}
