'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { Button, Checkbox, Input, Textarea, colors } from '@tarodan/ui';
import { PlusIcon, PencilIcon, TrashIcon, TagIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { PageHeader, FilterToolbar, ActionButtons, ActionIconButton } from '@/components/admin-list';

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
    const defaultTagColor = colors.primary[500];
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [formData, setFormData] = useState({ name: '', description: '', color: defaultTagColor, isActive: true });

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

    const openCreate = () => { setEditingTag(null); setFormData({ name: '', description: '', color: defaultTagColor, isActive: true }); setShowModal(true); };
    const openEdit = (t: Tag) => { setEditingTag(t); setFormData({ name: t.name, description: t.description || '', color: t.color || defaultTagColor, isActive: t.isActive }); setShowModal(true); };

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

    const columns: ColumnDef<Tag, any>[] = [
        {
            header: 'Etiket',
            cell: ({ row }) => (
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: row.original.color || defaultTagColor }}></div><span className="font-medium text-heading">{row.original.name}</span></div>
            ),
        },
        {
            header: 'Kullanım',
            cell: ({ row }) => (
                <div className="flex items-center gap-2"><TagIcon className="h-4 w-4 text-muted" /><span className="text-sm text-muted">{row.original.usageCount} ürün</span>{!row.original.isActive && <span className="px-2 text-xs bg-body text-muted rounded">Pasif</span>}</div>
            ),
        },
        {
            id: 'actions',
            header: 'İşlemler',
            cell: ({ row }) => (
                <ActionButtons>
                    <ActionIconButton icon={PencilIcon} onClick={() => openEdit(row.original)} title="Düzenle" />
                    <ActionIconButton icon={TrashIcon} onClick={() => setDeleteConfirm(row.original.id)} title="Sil" variant="danger" disabled={row.original.usageCount > 0} />
                </ActionButtons>
            ),
        },
    ];

    return (
        <>
            <div className="space-y-6">
                <PageHeader title="Etiketler" description="Ürün etiketlerini yönetin">
                    <Button variant="primary" size="md" onClick={openCreate}><PlusIcon className="w-5 h-5" />Yeni Etiket</Button>
                </PageHeader>
                <FilterToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Etiket ara..." />
                <DataTable
                    columns={columns}
                    data={tags}
                    loading={loading}
                    emptyText="Etiket yok"
                    emptyAction={<Button onClick={openCreate}><PlusIcon className="w-5 h-5 mr-2" />İlk etiketi ekle</Button>}
                    getRowId={(t) => t.id}
                />
            </div>
            {showModal && (<div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50"><div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4 border border-border">
                <h2 className="text-xl font-semibold text-heading mb-4 leading-tight">{editingTag ? 'Düzenle' : 'Yeni Etiket'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label className="block text-sm text-muted mb-2">Ad *</label><Input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
                    <div><label className="block text-sm text-muted mb-2">Açıklama</label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
                    <div><label className="block text-sm text-muted mb-2">Renk</label><Input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="w-10 h-10 rounded" /></div>
                    <Checkbox checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} label="Aktif" />
                    <div className="flex gap-3 pt-4"><Button variant="secondary" size="md" type="button" onClick={() => setShowModal(false)} className="flex-1">İptal</Button><Button variant="primary" size="md" type="submit" className="flex-1">{editingTag ? 'Güncelle' : 'Oluştur'}</Button></div>
                </form>
            </div></div>)}
            {deleteConfirm && (<div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50"><div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4 border border-border">
                <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">Etiketi Sil</h3><p className="text-muted mb-6">Bu etiketi silmek istediğinizden emin misiniz?</p>
                <div className="flex gap-3"><Button variant="secondary" size="md" onClick={() => setDeleteConfirm(null)} className="flex-1">İptal</Button><Button variant="danger" size="md" onClick={() => handleDelete(deleteConfirm)} className="flex-1">Sil</Button></div>
            </div></div>)}
        </>
    );
}
