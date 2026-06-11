'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { Button, Checkbox, Input, Textarea } from '@tarodan/ui';
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    EyeIcon,
    EyeSlashIcon,
    StarIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { PageHeader, FilterToolbar, ActionButtons, ActionIconButton } from '@/components/admin-list';

interface Collection {
    id: string;
    name: string;
    slug: string;
    description?: string;
    coverImageUrl?: string;
    isPublic: boolean;
    isFeatured: boolean;
    viewCount: number;
    likeCount: number;
    itemCount: number;
    owner: { id: string; displayName: string; avatarUrl?: string };
    createdAt: string;
    updatedAt: string;
}

interface CollectionFormData {
    name: string;
    description: string;
    isPublic: boolean;
    isFeatured: boolean;
    coverImageUrl: string;
}

export default function CollectionsPage() {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [formData, setFormData] = useState<CollectionFormData>({
        name: '',
        description: '',
        isPublic: true,
        isFeatured: false,
        coverImageUrl: '',
    });

    useEffect(() => {
        loadCollections();
    }, [page, search]);

    const loadCollections = async () => {
        setLoading(true);
        try {
            const response = await adminApi.getCollections({ page, limit: 20, search: search || undefined });
            const data = response.data;
            setCollections(data.data || []);
            setTotalPages(data.totalPages || 1);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Koleksiyonlar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingCollection(null);
        setFormData({
            name: '',
            description: '',
            isPublic: true,
            isFeatured: false,
            coverImageUrl: '',
        });
        setShowModal(true);
    };

    const openEditModal = (collection: Collection) => {
        setEditingCollection(collection);
        setFormData({
            name: collection.name,
            description: collection.description || '',
            isPublic: collection.isPublic,
            isFeatured: collection.isFeatured,
            coverImageUrl: collection.coverImageUrl || '',
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingCollection) {
                await adminApi.updateCollection(editingCollection.id, formData);
                toast.success('Koleksiyon güncellendi');
            } else {
                await adminApi.createCollection(formData);
                toast.success('Koleksiyon oluşturuldu');
            }
            setShowModal(false);
            loadCollections();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'İşlem başarısız');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await adminApi.deleteCollection(id);
            toast.success('Koleksiyon silindi');
            setDeleteConfirm(null);
            loadCollections();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
        }
    };

    const toggleVisibility = async (collection: Collection) => {
        try {
            await adminApi.setCollectionVisibility(collection.id, !collection.isPublic);
            toast.success(collection.isPublic ? 'Koleksiyon gizlendi' : 'Koleksiyon görünür yapıldı');
            loadCollections();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'İşlem başarısız');
        }
    };

    const toggleFeatured = async (collection: Collection) => {
        try {
            await adminApi.setCollectionFeatured(collection.id, !collection.isFeatured);
            toast.success(collection.isFeatured ? 'Öne çıkarma kaldırıldı' : 'Koleksiyon öne çıkarıldı');
            loadCollections();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'İşlem başarısız');
        }
    };

    const columns: ColumnDef<Collection, any>[] = [
        {
            header: 'Koleksiyon',
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    {row.original.coverImageUrl ? (
                        <img src={row.original.coverImageUrl} alt="" className="w-10 h-10 rounded object-cover" />
                    ) : (
                        <div className="w-10 h-10 rounded bg-surface-alt flex items-center justify-center text-muted text-xs">
                            N/A
                        </div>
                    )}
                    <div>
                        <div className="font-medium text-heading">{row.original.name}</div>
                        {row.original.description && (
                            <div className="text-sm text-muted truncate max-w-xs">{row.original.description}</div>
                        )}
                    </div>
                </div>
            ),
        },
        {
            header: 'Sahibi',
            cell: ({ row }) => (
                <span className="text-muted">{row.original.owner?.displayName || '-'}</span>
            ),
        },
        {
            id: 'itemCount',
            header: () => <span className="block text-center">Ürün</span>,
            cell: ({ row }) => <div className="text-center text-muted">{row.original.itemCount}</div>,
        },
        {
            id: 'viewCount',
            header: () => <span className="block text-center">Görüntüleme</span>,
            cell: ({ row }) => <div className="text-center text-muted">{row.original.viewCount}</div>,
        },
        {
            id: 'likeCount',
            header: () => <span className="block text-center">Beğeni</span>,
            cell: ({ row }) => <div className="text-center text-muted">{row.original.likeCount}</div>,
        },
        {
            id: 'status',
            header: () => <span className="block text-center">Durum</span>,
            cell: ({ row }) => (
                <div className="flex items-center justify-center gap-2">
                    {row.original.isPublic ? (
                        <span className="px-2 py-1 text-xs bg-success-50 text-success-700 rounded">Görünür</span>
                    ) : (
                        <span className="px-2 py-1 text-xs bg-body text-muted rounded">Gizli</span>
                    )}
                    {row.original.isFeatured && (
                        <span className="px-2 py-1 text-xs bg-warning-50 text-warning-700 rounded">Öne Çıkan</span>
                    )}
                </div>
            ),
        },
        {
            id: 'actions',
            header: 'İşlemler',
            cell: ({ row }) => (
                <ActionButtons>
                    <ActionIconButton
                        icon={row.original.isPublic ? EyeSlashIcon : EyeIcon}
                        onClick={() => toggleVisibility(row.original)}
                        title={row.original.isPublic ? 'Gizle' : 'Görünür yap'}
                    />
                    <Button variant="secondary" onClick={() => toggleFeatured(row.original)}
                        className="p-2 text-muted hover:text-warning-700 hover:bg-surface-alt rounded-lg"
                        title={row.original.isFeatured ? 'Öne çıkarmayı kaldır' : 'Öne çıkar'}>
                        {row.original.isFeatured ? <StarSolidIcon className="h-5 w-5 text-warning-700" /> : <StarIcon className="h-5 w-5" />}
                    </Button>
                    <ActionIconButton
                        icon={PencilIcon}
                        onClick={() => openEditModal(row.original)}
                        title="Düzenle"
                    />
                    <ActionIconButton
                        icon={TrashIcon}
                        onClick={() => setDeleteConfirm(row.original.id)}
                        title="Sil"
                        variant="danger"
                    />
                </ActionButtons>
            ),
        },
    ];

    return (
        <>
            <div className="space-y-6">
                <PageHeader title="Koleksiyonlar" description="Koleksiyon yönetimi">
                    <Button variant="primary" size="md" onClick={openCreateModal}>
                        <PlusIcon className="w-5 h-5" />
                        Yeni Koleksiyon
                    </Button>
                </PageHeader>

                {/* Search */}
                <FilterToolbar
                    search={search}
                    onSearchChange={(v) => { setSearch(v); setPage(1); }}
                    searchPlaceholder="Koleksiyon ara..."
                />

                {/* Collections Table */}
                <DataTable
                    columns={columns}
                    data={collections}
                    loading={loading}
                    emptyText="Henüz koleksiyon yok"
                    emptyAction={<Button onClick={openCreateModal}><PlusIcon className="w-5 h-5 mr-2" />İlk koleksiyonu ekle</Button>}
                    getRowId={(c) => c.id}
                />

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="admin-card flex items-center justify-between px-4 py-3">
                        <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 bg-surface-alt text-muted rounded disabled:opacity-50">
                            Önceki
                        </Button>
                        <span className="text-muted">
                            Sayfa {page} / {totalPages}
                        </span>
                        <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1 bg-surface-alt text-muted rounded disabled:opacity-50">
                            Sonraki
                        </Button>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4 border border-border">
                        <h2 className="text-xl font-semibold text-heading mb-4 leading-tight">
                            {editingCollection ? 'Koleksiyon Düzenle' : 'Yeni Koleksiyon'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-muted mb-2">Koleksiyon Adı *</label>
                                <Input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-muted mb-2">Açıklama</label>
                                <Textarea value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={3} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-muted mb-2">Kapak Görseli URL</label>
                                <Input
                                    type="url"
                                    value={formData.coverImageUrl}
                                    onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="flex items-center gap-4">
                                <Checkbox
                                    checked={formData.isPublic}
                                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                                    label="Görünür"
                                />
                                <Checkbox
                                    checked={formData.isFeatured}
                                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                                    label="Öne Çıkan"
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <Button variant="secondary" size="md" type="button" onClick={() => setShowModal(false)} className="flex-1">
                                    İptal
                                </Button>
                                <Button variant="primary" size="md" type="submit" className="flex-1">
                                    {editingCollection ? 'Güncelle' : 'Oluştur'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4 border border-border">
                        <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">Koleksiyonu Sil</h3>
                        <p className="text-muted mb-6">
                            Bu koleksiyonu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="secondary" size="md" onClick={() => setDeleteConfirm(null)} className="flex-1">
                                İptal
                            </Button>
                            <Button variant="danger" size="md" onClick={() => handleDelete(deleteConfirm)} className="flex-1">
                                Sil
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
