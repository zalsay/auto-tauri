import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getMaterials, createMaterial, deleteMaterial, Material } from './api';
import { getStoredToken } from './api';

// This interface should be in a shared types file, but for now, we define it here.
interface Project {
    id: string;
    name: string;
    // Add other project fields if needed for other functionalities
}

interface MaterialCenterProps {
    projectsList: Project[];
}

const MaterialCenter: React.FC<MaterialCenterProps> = ({ projectsList }) => {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [newName, setNewName] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newType, setNewType] = useState<'text' | 'image' | 'file'>('text');

    const projectMap = useMemo(() => {
        return new Map(projectsList.map(p => [p.id, p.name]));
    }, [projectsList]);

    const fetchMaterials = useCallback(async () => {
        setLoading(true);
        try {
            const token = getStoredToken();
            if (!token) throw new Error("Authentication token not found.");
            const data = await getMaterials(token);
            setMaterials(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch materials.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMaterials();
    }, [fetchMaterials]);

    const handleCreateMaterial = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim() || !newContent.trim()) {
            setError('名称和内容不能为空。');
            return;
        }

        const token = getStoredToken();
        if (!token) {
            setError("认证令牌未找到。");
            return;
        }
        
        try {
            await createMaterial(token, { name: newName, type: newType, content: newContent });
            setNewName('');
            setNewContent('');
            fetchMaterials(); // Refresh list
        } catch (err: any) {
            setError(err.message || '创建素材失败。');
        }
    };

    const handleDeleteMaterial = async (id: string) => {
        const token = getStoredToken();
        if (!token) {
            setError("认证令牌未找到。");
            return;
        }

        if (window.confirm('您确定要删除此素材吗？')) {
            try {
                await deleteMaterial(token, id);
                fetchMaterials(); // Refresh list
            } catch (err: any) {
                setError(err.message || '删除素材失败。');
            }
        }
    };

    return (
        <div className="mx-auto max-w-7xl flex flex-col gap-8">
            {/* Create Material Form */}
            <div className="rounded-2xl bg-surface-light p-8 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-purple-500">add_circle</span>
                    创建新素材
                </h3>
                {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-500 dark:bg-red-900/20 dark:text-red-400">{error}</div>}
                <form onSubmit={handleCreateMaterial} className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">名称</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                placeholder="例如：广告文案片段"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">类型</label>
                            <select
                                className="custom-select w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                value={newType}
                                onChange={(e) => setNewType(e.target.value as any)}
                            >
                                <option value="text">文本</option>
                                <option value="image">图片 URL</option>
                                <option value="file">文件 URL</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">内容</label>
                        <textarea
                            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                            rows={4}
                            placeholder={newType === 'text' ? '输入您的文本内容...' : '输入 URL...'}
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                            required
                        />
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={loading} className="bg-gradient-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg">
                            {loading ? '保存中...' : '保存素材'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Materials List */}
            <div className="flex flex-col gap-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent-blue">topic</span>
                    我的素材
                </h3>
                {loading && <p>正在加载素材...</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {materials.length === 0 && !loading ? (
                        <div className="col-span-full text-center py-20 text-slate-500 bg-surface-light dark:bg-surface-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                            未找到素材。请在上方创建一个。
                        </div>
                    ) : (
                        materials.map(material => (
                            <div key={material.id} className="rounded-xl bg-surface-light p-5 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-slate-900 dark:text-white truncate flex-1" title={material.name}>{material.name}</h4>
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 whitespace-nowrap">{material.type}</span>
                                </div>
                                
                                {material.projectId && projectMap.has(material.projectId) && (
                                    <div className="text-[11px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-md flex items-center gap-1.5">
                                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>link</span>
                                        <span>来源项目: {projectMap.get(material.projectId)}</span>
                                    </div>
                                )}
                                
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 h-12 flex-grow">{material.content}</p>

                                <div className="flex gap-2 mt-2 items-center">
                                    <p className="text-xs text-slate-400">{new Date(material.createdAt).toLocaleDateString()}</p>
                                    <div className="flex-grow"></div>
                                    <button onClick={() => handleDeleteMaterial(material.id)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                        <span className="material-symbols-outlined">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default MaterialCenter;