import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getMaterials, createMaterial, deleteMaterial, updateMaterial, Material } from './api';
import { getStoredToken } from './api';
import { uploadToOSSSimple } from './ossUpload';

// This interface should be in a shared types file, but for now, we define it here.
interface Project {
    id: string;
    name: string;
    // Add other project fields if needed for other functionalities
}

interface MaterialCenterProps {
    projectsList: Project[];
    onPublish: (material: Material, platform: string, title: string, imageUrl: string) => void;
}

const MaterialCenter: React.FC<MaterialCenterProps> = ({ projectsList, onPublish }) => {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [newName, setNewName] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newProjectId, setNewProjectId] = useState('');

    // Image upload state
    const [imageInputMode, setImageInputMode] = useState<'url' | 'upload'>('url');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Publish Modal State
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
    const [publishTitle, setPublishTitle] = useState('');
    const [publishPlatform, setPublishPlatform] = useState('xhs');
    const [publishImageUrl, setPublishImageUrl] = useState('');

    // View Modal State
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [viewingMaterial, setViewingMaterial] = useState<Material | null>(null);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [editName, setEditName] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editProjectId, setEditProjectId] = useState('');
    const [editLoading, setEditLoading] = useState(false);
    const [editImageInputMode, setEditImageInputMode] = useState<'url' | 'upload'>('url');
    const [editImageUrl, setEditImageUrl] = useState('');
    const [editIsUploading, setEditIsUploading] = useState(false);
    const [editUploadProgress, setEditUploadProgress] = useState(0);
    const editFileInputRef = useRef<HTMLInputElement>(null);

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
        if (!newProjectId) {
            setError('请选择关联项目。');
            return;
        }

        const token = getStoredToken();
        if (!token) {
            setError("认证令牌未找到。");
            return;
        }

        try {
            await createMaterial(token, { name: newName, type: 'text', content: newContent, projectId: newProjectId });
            setNewName('');
            setNewContent('');
            setNewProjectId('');
            setPreviewUrl('');
            fetchMaterials(); // Refresh list
        } catch (err: any) {
            setError(err.message || '创建素材失败。');
        }
    };

    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [materialToDelete, setMaterialToDelete] = useState<string | null>(null);

    const handleDeleteClick = (id: string) => {
        setMaterialToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!materialToDelete) return;

        const id = materialToDelete;
        const token = getStoredToken();
        if (!token) {
            const msg = "认证令牌未找到。";
            setError(msg);
            alert(msg);
            setIsDeleteModalOpen(false);
            return;
        }

        setDeletingIds(prev => {
            const newSet = new Set(prev);
            newSet.add(id);
            return newSet;
        });

        // Close modal immediately to show loading state on button (or keep modal open with loading? better to close and show spinner on item)
        // actually let's keep modal open or just close it and let the item show spinner. 
        // User prefers feedback. Let's close modal and let the item spinner show.
        setIsDeleteModalOpen(false);

        try {
            console.log(`[MaterialCenter] Deleting material: ${id}`);
            await deleteMaterial(token, id);
            await fetchMaterials(); // Refresh list
        } catch (err: any) {
            console.error("[MaterialCenter] Delete failed:", err);
            const msg = err.message || '删除素材失败。';
            setError(msg);
            alert(msg);
        } finally {
            setDeletingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
            setMaterialToDelete(null);
        }
    };

    const openPublishModal = (material: Material) => {
        setSelectedMaterial(material);
        setPublishTitle(material.name);
        setPublishImageUrl(material.type === 'image' ? material.content : '');
        setIsPublishModalOpen(true);
    };

    const openViewModal = (material: Material) => {
        setViewingMaterial(material);
        setIsViewModalOpen(true);
    };

    const openEditModal = (material: Material) => {
        setEditingMaterial(material);
        setEditName(material.name);
        setEditContent(material.content);
        setEditProjectId(material.projectId || '');
        setEditImageUrl((material as any).imageUrl || '');
        setEditImageInputMode('url');
        setIsEditModalOpen(true);
    };

    const handleEditSave = async () => {
        if (!editingMaterial) return;
        const token = getStoredToken();
        if (!token) {
            setError('认证令牌未找到。');
            return;
        }
        setEditLoading(true);
        try {
            await updateMaterial(token, editingMaterial.id, {
                name: editName,
                type: 'text',
                content: editContent,
                projectId: editProjectId,
            });
            setIsEditModalOpen(false);
            await fetchMaterials();
        } catch (err: any) {
            setError(err.message || '更新素材失败。');
        } finally {
            setEditLoading(false);
        }
    };

    const handlePublishClick = () => {
        if (selectedMaterial) {
            if (typeof onPublish !== 'function') {
                console.error('onPublish is not a function:', onPublish);
                return;
            }
            // If it's an image material, use its content as image URL if not overridden
            const finalImageUrl = publishImageUrl || (selectedMaterial.type === 'image' ? selectedMaterial.content : '');
            onPublish(selectedMaterial, publishPlatform, publishTitle, finalImageUrl);
            setIsPublishModalOpen(false);
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
                    </div>

                    {/* Project selection */}
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            关联项目 <span className="text-red-500">*</span>
                        </label>
                        <select
                            className="custom-select w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                            value={newProjectId}
                            onChange={(e) => setNewProjectId(e.target.value)}
                            required
                        >
                            <option value="">请选择项目...</option>
                            {projectsList.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Content */}
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">内容</label>
                        <textarea
                            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                            rows={4}
                            placeholder="输入您的文本内容..."
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                        />
                    </div>

                    {/* Image Upload */}
                    <div className="flex flex-col gap-3">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">图片</label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setImageInputMode('url')}
                                className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${imageInputMode === 'url' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                            >
                                <span className="text-sm font-bold text-slate-900 dark:text-white">输入URL</span>
                                <span className="text-[10px] text-slate-500">粘贴图片链接地址</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setImageInputMode('upload')}
                                className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${imageInputMode === 'upload' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                            >
                                <span className="text-sm font-bold text-slate-900 dark:text-white">上传文件</span>
                                <span className="text-[10px] text-slate-500">从本地选择图片</span>
                            </button>
                        </div>

                        {imageInputMode === 'url' ? (
                            <div>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                    placeholder="输入图片 URL（可选）..."
                                    value={previewUrl}
                                    onChange={(e) => {
                                        setPreviewUrl(e.target.value);
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        setIsUploading(true);
                                        setUploadProgress(0);
                                        try {
                                            const url = await uploadToOSSSimple(file);
                                            setPreviewUrl(url);
                                            setUploadProgress(100);
                                        } catch (err: any) {
                                            setError(err.message || '上传失败');
                                        } finally {
                                            setIsUploading(false);
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className="flex items-center justify-center gap-2 w-full p-4 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 transition-colors disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-slate-400">cloud_upload</span>
                                    <span className="text-sm text-slate-500">
                                        {isUploading ? `上传中... ${uploadProgress}%` : '点击选择图片（可选）'}
                                    </span>
                                </button>
                                {isUploading && (
                                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                                        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Preview */}
                        {previewUrl && (
                            <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                                <img src={previewUrl} alt="预览" className="w-full max-h-40 object-contain bg-slate-50 dark:bg-slate-900" />
                            </div>
                        )}
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

                                <div className="flex gap-1.5 mt-2 items-center flex-wrap">
                                    <p className="text-xs text-slate-400 mr-auto">{new Date(material.createdAt).toLocaleDateString()}</p>
                                    <button onClick={() => openViewModal(material)} className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 text-slate-500 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap" title="查看">
                                        <span className="material-symbols-outlined text-[14px]">visibility</span>
                                    </button>
                                    <button onClick={() => openEditModal(material)} className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors whitespace-nowrap" title="编辑">
                                        <span className="material-symbols-outlined text-[14px]">edit</span>
                                    </button>
                                    <button onClick={() => openPublishModal(material)} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-accent-blue px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors whitespace-nowrap" title="工作流">
                                        <span className="material-symbols-outlined text-[14px]">account_tree</span>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteClick(material.id)}
                                        disabled={deletingIds.has(material.id)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                        title="删除"
                                    >
                                        <span className={`material-symbols-outlined text-[14px] ${deletingIds.has(material.id) ? 'animate-spin' : ''}`}>
                                            {deletingIds.has(material.id) ? 'sync' : 'delete'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-sm rounded-xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">确认删除</h3>
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                删除后无法恢复，确定要继续吗？
                            </p>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg transition-colors"
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && editingMaterial && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">编辑素材</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">名称</label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">内容</label>
                                <textarea
                                    className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                    rows={4}
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    关联项目 <span className="text-red-500">*</span>
                                </label>
                                <select
                                    className="custom-select w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                    value={editProjectId}
                                    onChange={(e) => setEditProjectId(e.target.value)}
                                    required
                                >
                                    <option value="">请选择项目...</option>
                                    {projectsList.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Image Upload for Edit */}
                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">图片</label>
                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setEditImageInputMode('url')}
                                        className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${editImageInputMode === 'url' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                                    >
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">输入URL</span>
                                        <span className="text-[10px] text-slate-500">粘贴图片链接地址</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditImageInputMode('upload')}
                                        className={`flex-1 p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${editImageInputMode === 'upload' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                                    >
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">上传文件</span>
                                        <span className="text-[10px] text-slate-500">从本地选择图片</span>
                                    </button>
                                </div>

                                {editImageInputMode === 'url' ? (
                                    <div>
                                        <input
                                            type="text"
                                            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                            placeholder="输入图片 URL（可选）..."
                                            value={editImageUrl}
                                            onChange={(e) => setEditImageUrl(e.target.value)}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <input
                                            ref={editFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                setEditIsUploading(true);
                                                setEditUploadProgress(0);
                                                try {
                                                    const url = await uploadToOSSSimple(file);
                                                    setEditImageUrl(url);
                                                    setEditUploadProgress(100);
                                                } catch (err: any) {
                                                    setError(err.message || '上传失败');
                                                } finally {
                                                    setEditIsUploading(false);
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => editFileInputRef.current?.click()}
                                            disabled={editIsUploading}
                                            className="flex items-center justify-center gap-2 w-full p-4 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 transition-colors disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-slate-400">cloud_upload</span>
                                            <span className="text-sm text-slate-500">
                                                {editIsUploading ? `上传中... ${editUploadProgress}%` : '点击选择图片（可选）'}
                                            </span>
                                        </button>
                                        {editIsUploading && (
                                            <div className="w-full bg-slate-200 rounded-full h-1.5">
                                                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${editUploadProgress}%` }}></div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Preview */}
                                {editImageUrl && (
                                    <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                                        <img src={editImageUrl} alt="预览" className="w-full max-h-40 object-contain bg-slate-50 dark:bg-slate-900" />
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex justify-end gap-3">
                                <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-500">取消</button>
                                <button onClick={handleEditSave} disabled={editLoading} className="bg-gradient-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg disabled:opacity-50">
                                    {editLoading ? '保存中...' : '保存修改'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Publish Modal */}
            {isPublishModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">执行工作流</h3>
                            <button onClick={() => setIsPublishModalOpen(false)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">目标平台</label>
                                <select
                                    className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                    value={publishPlatform}
                                    onChange={(e) => setPublishPlatform(e.target.value)}
                                >
                                    <option value="xhs">小红书 (XHS)</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">笔记标题</label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                    value={publishTitle}
                                    onChange={(e) => setPublishTitle(e.target.value)}
                                    placeholder="输入笔记标题..."
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    图片 URL {selectedMaterial?.type !== 'image' && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                    value={publishImageUrl}
                                    onChange={(e) => setPublishImageUrl(e.target.value)}
                                    placeholder="https://..."
                                />
                                {selectedMaterial?.type !== 'image' && (
                                    <p className="text-[10px] text-slate-500 mt-1">小红书发布必须包含图片。由于当前素材是文本，请提供一个图片 URL。</p>
                                )}
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                                <p className="text-xs text-slate-500 mb-1 font-bold">发布内容预览:</p>
                                <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-4 italic">{selectedMaterial?.content}</p>
                            </div>
                            <div className="mt-4 flex justify-end gap-3">
                                <button onClick={() => setIsPublishModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-500">取消</button>
                                <button onClick={handlePublishClick} className="bg-gradient-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg">执行工作流</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* View Modal */}
            {isViewModalOpen && viewingMaterial && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-2xl max-h-[80vh] rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">素材详情</h3>
                            <button onClick={() => setIsViewModalOpen(false)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <span className="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold">{viewingMaterial.type}</span>
                                    <span className="text-sm text-slate-500 dark:text-slate-400">创建于 {new Date(viewingMaterial.createdAt).toLocaleString()}</span>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">名称</label>
                                    <p className="text-lg font-bold text-slate-900 dark:text-white">{viewingMaterial.name}</p>
                                </div>

                                {viewingMaterial.projectId && projectMap.has(viewingMaterial.projectId) && (
                                    <div className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-lg flex items-center gap-1.5">
                                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>link</span>
                                        <span>来源项目: {projectMap.get(viewingMaterial.projectId)}</span>
                                    </div>
                                )}

                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">内容</label>
                                    {viewingMaterial.type === 'image' ? (
                                        <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                                            <img src={viewingMaterial.content} alt={viewingMaterial.name} className="w-full h-auto max-h-96 object-contain bg-slate-50 dark:bg-slate-900" />
                                        </div>
                                    ) : (
                                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{viewingMaterial.content}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                            <button onClick={() => setIsViewModalOpen(false)} className="px-6 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">关闭</button>
                            <button onClick={() => {
                                setIsViewModalOpen(false);
                                openPublishModal(viewingMaterial);
                            }} className="flex items-center gap-1 bg-gradient-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg">
                                <span className="material-symbols-outlined text-[16px]">account_tree</span>工作流
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MaterialCenter;
