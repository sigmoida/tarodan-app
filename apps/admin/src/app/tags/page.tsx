'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import { PlusIcon, PencilIcon, TrashIcon, TagIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Tag {
    id: string;
    name: string;
    slug: string;
    description?: string;
    color?: string;
    isActive: boolean;
    usageCount: number;
}

export default function TagsPage() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [formData, setFormData] = useState({ name: '', description: '', color: '#6366f1', isActive: true });

    useEffect(() => { loadTags(); }, [search]);

    const loadTags = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getTags({ search: search || undefined, limit: 100 });
            setTags(res.data.data || []);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Etiketler yüklenemedi');
        } finally { setLoading(false); }
    };

    const openCreate = () => { setEditingTag(null); setFormData({ name: '', description: '', color: '#6366f1', isActive: true }); setShowModal(true); };
    const openEdit = (t: Tag) => { setEditingTag(t); setFormData({ name: t.name, description: t.description || '', color: t.color || '#6366f1', isActive: t.isActive }); setShowModal(true); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingTag) { await adminApi.updateTag(editingTag.id, formData); toast.success('Güncellendi'); }
            else { await adminApi.createTag(formData); toast.success('Oluşturuldu'); }
            setShowModal(false); loadTags();
        } catch (e: any) { toast.error(e.response?.data?.message || 'Hata'); }
    };

    const handleDelete = async (id: string) => {
        try { await adminApi.deleteTag(id); toast.success('Silindi'); setDeleteConfirm(null); loadTags(); }
        catch (e: any) { toast.error(e.response?.data?.message || 'Silinemedi'); }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div><h1 className="text-2xl font-bold text-gray-900">Etiketler</h1><p className="text-gray-500">Ürün etiketlerini yönetin</p></div>
                    <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-gray-900 rounded-lg hover:bg-primary-700"><PlusIcon className="w-5 h-5" />Yeni Etiket</button>
                </div>
                <div className="admin-card p-4"><input type="text" placeholder="Etiket ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="admin-input w-full max-w-md" /></div>
                <div className="admin-card p-6">
                    {loading ? (<div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary-500 mx-auto"></div></div>)
                        : tags.length === 0 ? (<div className="text-center py-12 text-gray-500">Etiket yok</div>)
                            : (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {tags.map((t) => (<div key={t.id} className="p-4 rounded-lg border border-gray-200 hover:border-gray-400">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color || '#6366f1' }}></div><span className="font-medium text-gray-900">{t.name}</span></div>
                                        <div className="flex gap-1"><button onClick={() => openEdit(t)} className="p-1 text-gray-500 hover:text-gray-900"><PencilIcon className="h-4 w-4" /></button><button onClick={() => setDeleteConfirm(t.id)} className="p-1 text-red-600 hover:text-red-300" disabled={t.usageCount > 0}><TrashIcon className="h-4 w-4" /></button></div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2"><TagIcon className="h-4 w-4 text-gray-500" /><span className="text-sm text-gray-500">{t.usageCount} ürün</span>{!t.isActive && <span className="px-2 text-xs bg-gray-700 text-gray-500 rounded">Pasif</span>}</div>
                                </div>))}
                            </div>)}
                </div>
            </div>
            {showModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"><div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">{editingTag ? 'Düzenle' : 'Yeni Etiket'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label className="block text-sm text-gray-600 mb-2">Ad *</label><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="admin-input w-full" required /></div>
                    <div><label className="block text-sm text-gray-600 mb-2">Açıklama</label><textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="admin-input w-full" rows={2} /></div>
                    <div><label className="block text-sm text-gray-600 mb-2">Renk</label><input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="w-10 h-10 rounded" /></div>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="w-4 h-4 rounded" /><span className="text-sm text-gray-600">Aktif</span></label>
                    <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg">İptal</button><button type="submit" className="flex-1 px-4 py-2 bg-primary-600 text-gray-900 rounded-lg">{editingTag ? 'Güncelle' : 'Oluştur'}</button></div>
                </form>
            </div></div>)}
            {deleteConfirm && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"><div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Etiketi Sil</h3><p className="text-gray-500 mb-6">Bu etiketi silmek istediğinizden emin misiniz?</p>
                <div className="flex gap-3"><button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg">İptal</button><button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-gray-900 rounded-lg">Sil</button></div>
            </div></div>)}
        </AdminLayout>
    );
}
