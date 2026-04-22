'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { Button, Checkbox, Input, Spinner, Textarea, colors } from '@tarodan/ui';
import { PlusIcon, PencilIcon, TrashIcon, Squares2X2Icon, ChevronRightIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface AttributeGroup {
    id: string;
    name: string;
    slug: string;
    description?: string;
    isRequired: boolean;
    isActive: boolean;
    sortOrder: number;
    attributeCount?: number;
}

interface Attribute {
    id: string;
    groupId: string;
    value: string;
    slug: string;
    displayValue?: string;
    color?: string;
    sortOrder: number;
    isActive: boolean;
}

export default function AttributesPage() {
    const defaultAttributeColor = colors.primary[500];
    const searchParams = useSearchParams();
    const groupIdFromUrl = searchParams.get('groupId');
    const [groups, setGroups] = useState<AttributeGroup[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<AttributeGroup | null>(null);
    const [attributes, setAttributes] = useState<Attribute[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingAttrs, setLoadingAttrs] = useState(false);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [showAttrModal, setShowAttrModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState<AttributeGroup | null>(null);
    const [editingAttr, setEditingAttr] = useState<Attribute | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'group' | 'attr'; id: string } | null>(null);
    const [groupForm, setGroupForm] = useState({ name: '', description: '', isRequired: false, isActive: true, sortOrder: 0 });
    const [attrForm, setAttrForm] = useState({ value: '', displayValue: '', color: defaultAttributeColor, sortOrder: 0, isActive: true });

    useEffect(() => { loadGroups(); }, []);

    useEffect(() => {
        if (groups.length > 0 && groupIdFromUrl) {
            const g = groups.find((gr) => gr.id === groupIdFromUrl);
            if (g) { setSelectedGroup(g); loadAttributes(g.id); }
        }
    }, [groups, groupIdFromUrl]);

    const loadGroups = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getAttributeGroups({ limit: 100 });
            setGroups(res.data.data || []);
        } catch (e: any) { toast.error('Gruplar yüklenemedi'); }
        finally { setLoading(false); }
    };

    const loadAttributes = async (groupId: string) => {
        setLoadingAttrs(true);
        try {
            const res = await adminApi.getAttributes({ groupId, limit: 100 });
            setAttributes(res.data.data || []);
        } catch (e: any) { toast.error('Özellikler yüklenemedi'); }
        finally { setLoadingAttrs(false); }
    };

    const selectGroup = (g: AttributeGroup) => { setSelectedGroup(g); loadAttributes(g.id); };

    const openGroupCreate = () => { setEditingGroup(null); setGroupForm({ name: '', description: '', isRequired: false, isActive: true, sortOrder: 0 }); setShowGroupModal(true); };
    const openGroupEdit = (g: AttributeGroup) => { setEditingGroup(g); setGroupForm({ name: g.name, description: g.description || '', isRequired: g.isRequired, isActive: g.isActive, sortOrder: g.sortOrder }); setShowGroupModal(true); };
    const openAttrCreate = () => { setEditingAttr(null); setAttrForm({ value: '', displayValue: '', color: defaultAttributeColor, sortOrder: 0, isActive: true }); setShowAttrModal(true); };
    const openAttrEdit = (a: Attribute) => { setEditingAttr(a); setAttrForm({ value: a.value, displayValue: a.displayValue || '', color: a.color || defaultAttributeColor, sortOrder: a.sortOrder, isActive: a.isActive }); setShowAttrModal(true); };

    const handleGroupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingGroup) { await adminApi.updateAttributeGroup(editingGroup.id, groupForm); toast.success('Güncellendi'); }
            else { await adminApi.createAttributeGroup(groupForm); toast.success('Oluşturuldu'); }
            setShowGroupModal(false); loadGroups();
        } catch (e: any) { toast.error('Hata'); }
    };

    const handleAttrSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGroup) return;
        try {
            if (editingAttr) { await adminApi.updateAttribute(editingAttr.id, attrForm); toast.success('Güncellendi'); }
            else { await adminApi.createAttribute({ ...attrForm, groupId: selectedGroup.id }); toast.success('Oluşturuldu'); }
            setShowAttrModal(false); loadAttributes(selectedGroup.id);
        } catch (e: any) { toast.error('Hata'); }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        try {
            if (deleteConfirm.type === 'group') { await adminApi.deleteAttributeGroup(deleteConfirm.id); loadGroups(); setSelectedGroup(null); setAttributes([]); }
            else { await adminApi.deleteAttribute(deleteConfirm.id); if (selectedGroup) loadAttributes(selectedGroup.id); }
            toast.success('Silindi'); setDeleteConfirm(null);
        } catch (e: any) { toast.error('Silinemedi'); }
    };

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div><h1 className="text-2xl font-bold text-heading">Ürün Özellikleri</h1><p className="text-muted">Özellik grupları ve değerleri</p></div>
                    <Button variant="primary" size="md" onClick={openGroupCreate}><PlusIcon className="w-5 h-5" />Yeni Grup</Button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Groups Panel */}
                    <div className="admin-card p-4">
                        <h3 className="text-lg font-medium text-heading mb-4">Gruplar</h3>
                        {loading ? <div className="text-center py-8"><Spinner size="md" className="mx-auto" /></div>
                            : groups.filter((g) => g.slug !== 'vehicle_type').length === 0 ? <div className="text-center py-8 text-muted">Grup yok</div>
                                : <div className="space-y-2">{groups.filter((g) => g.slug !== 'vehicle_type').map((g) => (
                                    <div key={g.id} onClick={() => selectGroup(g)} className={`p-3 rounded-lg cursor-pointer flex items-center justify-between ${selectedGroup?.id === g.id ? 'bg-primary-50 border border-primary-600' : 'bg-surface-alt hover:bg-surface-alt'}`}>
                                        <div className="flex items-center gap-2"><Squares2X2Icon className="h-5 w-5 text-muted" /><span className="text-heading">{g.name}</span>{!g.isActive && <span className="px-1.5 text-xs bg-body text-muted rounded">Pasif</span>}</div>
                                        <div className="flex items-center gap-1">
                                            <Button variant="secondary" onClick={(e) => { e.stopPropagation(); openGroupEdit(g); }} className="p-1 text-muted hover:text-heading"><PencilIcon className="h-4 w-4" /></Button>
                                            <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'group', id: g.id }); }} className="p-1 text-danger-600 hover:text-danger-300"><TrashIcon className="h-4 w-4" /></Button>
                                            <ChevronRightIcon className="h-4 w-4 text-muted" />
                                        </div>
                                    </div>
                                ))}</div>}
                    </div>
                    {/* Attributes Panel */}
                    <div className="admin-card p-4 lg:col-span-2">
                        {!selectedGroup ? <div className="text-center py-12 text-muted">Değerleri görmek için bir grup seçin</div>
                            : (<>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-medium text-heading">{selectedGroup.name} Değerleri</h3>
                                    <Button variant="primary" size="sm" onClick={openAttrCreate}><PlusIcon className="w-4 h-4" />Değer Ekle</Button>
                                </div>
                                {loadingAttrs ? <div className="text-center py-8"><Spinner size="md" className="mx-auto" /></div>
                                    : attributes.length === 0 ? <div className="text-center py-8 text-muted">Değer yok</div>
                                        : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{attributes.map((a) => (
                                            <div key={a.id} className="p-3 rounded-lg bg-surface-alt flex items-center justify-between">
                                                <div className="flex items-center gap-2">{a.color && <div className="w-4 h-4 rounded-full" style={{ backgroundColor: a.color }}></div>}<span className="text-heading">{a.displayValue || a.value}</span>{!a.isActive && <span className="px-1.5 text-xs bg-body text-muted rounded">Pasif</span>}</div>
                                                <div className="flex gap-1"><Button variant="secondary" onClick={() => openAttrEdit(a)} className="p-1 text-muted hover:text-heading"><PencilIcon className="h-4 w-4" /></Button><Button variant="secondary" onClick={() => setDeleteConfirm({ type: 'attr', id: a.id })} className="p-1 text-danger-600 hover:text-danger-300"><TrashIcon className="h-4 w-4" /></Button></div>
                                            </div>
                                        ))}</div>}
                            </>)}
                    </div>
                </div>
            </div>
            {/* Group Modal */}
            {showGroupModal && (<div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50"><div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4 border border-border">
                <h2 className="text-xl font-semibold text-heading mb-4">{editingGroup ? 'Grubu Düzenle' : 'Yeni Grup'}</h2>
                <form onSubmit={handleGroupSubmit} className="space-y-4">
                    <div><label className="block text-sm text-muted mb-2">Ad *</label><Input type="text" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} required /></div>
                    <div><label className="block text-sm text-muted mb-2">Açıklama</label><Textarea value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} rows={2} /></div>
                    <div><label className="block text-sm text-muted mb-2">Sıra</label><Input type="number" value={groupForm.sortOrder} onChange={(e) => setGroupForm({ ...groupForm, sortOrder: parseInt(e.target.value) || 0 })} className="w-24" /></div>
                    <div className="flex gap-4"><Checkbox checked={groupForm.isRequired} onChange={(e) => setGroupForm({ ...groupForm, isRequired: e.target.checked })} label="Zorunlu" />
                        <Checkbox checked={groupForm.isActive} onChange={(e) => setGroupForm({ ...groupForm, isActive: e.target.checked })} label="Aktif" /></div>
                    <div className="flex gap-3 pt-4"><Button variant="secondary" size="md" type="button" onClick={() => setShowGroupModal(false)} className="flex-1">İptal</Button><Button variant="primary" size="md" type="submit" className="flex-1">{editingGroup ? 'Güncelle' : 'Oluştur'}</Button></div>
                </form>
            </div></div>)}
            {/* Attribute Modal */}
            {showAttrModal && (<div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50"><div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4 border border-border">
                <h2 className="text-xl font-semibold text-heading mb-4">{editingAttr ? 'Değeri Düzenle' : 'Yeni Değer'}</h2>
                <form onSubmit={handleAttrSubmit} className="space-y-4">
                    <div><label className="block text-sm text-muted mb-2">Değer *</label><Input type="text" value={attrForm.value} onChange={(e) => setAttrForm({ ...attrForm, value: e.target.value })} required /></div>
                    <div><label className="block text-sm text-muted mb-2">Görüntülenen Değer</label><Input type="text" value={attrForm.displayValue} onChange={(e) => setAttrForm({ ...attrForm, displayValue: e.target.value })} /></div>
                    <div className="flex gap-4"><div><label className="block text-sm text-muted mb-2">Renk</label><Input type="color" value={attrForm.color || defaultAttributeColor} onChange={(e) => setAttrForm({ ...attrForm, color: e.target.value })} className="w-10 h-10 rounded" /></div>
                        <div><label className="block text-sm text-muted mb-2">Sıra</label><Input type="number" value={attrForm.sortOrder} onChange={(e) => setAttrForm({ ...attrForm, sortOrder: parseInt(e.target.value) || 0 })} className="w-20" /></div></div>
                    <Checkbox checked={attrForm.isActive} onChange={(e) => setAttrForm({ ...attrForm, isActive: e.target.checked })} label="Aktif" />
                    <div className="flex gap-3 pt-4"><Button variant="secondary" size="md" type="button" onClick={() => setShowAttrModal(false)} className="flex-1">İptal</Button><Button variant="primary" size="md" type="submit" className="flex-1">{editingAttr ? 'Güncelle' : 'Oluştur'}</Button></div>
                </form>
            </div></div>)}
            {/* Delete Confirm */}
            {deleteConfirm && (<div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50"><div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4 border border-border">
                <h3 className="text-lg font-semibold text-heading mb-4">{deleteConfirm.type === 'group' ? 'Grubu Sil' : 'Değeri Sil'}</h3><p className="text-muted mb-6">Silmek istediğinizden emin misiniz?</p>
                <div className="flex gap-3"><Button variant="secondary" size="md" onClick={() => setDeleteConfirm(null)} className="flex-1">İptal</Button><Button variant="danger" size="md" onClick={handleDelete} className="flex-1">Sil</Button></div>
            </div></div>)}
        </>
    );
}
