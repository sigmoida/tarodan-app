'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Spinner } from '@tarodan/ui';
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

    return (
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Koleksiyonlar</h1>
                        <p className="text-gray-500 mt-1">Koleksiyon yönetimi</p>
                    </div>
                    <Button variant="primary" size="md" onClick={openCreateModal}>
                        <PlusIcon className="w-5 h-5" />
                        Yeni Koleksiyon
                    </Button>
                </div>

                {/* Search */}
                <div className="admin-card p-4">
                    <input
                        type="text"
                        placeholder="Koleksiyon ara..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="admin-input w-full max-w-md"
                    />
                </div>

                {/* Collections Table */}
                <div className="admin-card overflow-hidden">
                    {loading ? (
                        <div className="text-center py-12">
                            <Spinner size="lg" className="mx-auto" />
                            <p className="text-gray-500 mt-4">Yükleniyor...</p>
                        </div>
                    ) : collections.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            Henüz koleksiyon yok
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Koleksiyon</th>
                                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Sahibi</th>
                                        <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Ürün</th>
                                        <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Görüntüleme</th>
                                        <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Beğeni</th>
                                        <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Durum</th>
                                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {collections.map((collection) => (
                                        <tr key={collection.id} className="hover:bg-gray-100/50">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {collection.coverImageUrl ? (
                                                        <img src={collection.coverImageUrl} alt="" className="w-10 h-10 rounded object-cover" />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-500 text-xs">
                                                            N/A
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="font-medium text-gray-900">{collection.name}</div>
                                                        {collection.description && (
                                                            <div className="text-sm text-gray-500 truncate max-w-xs">{collection.description}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-gray-600">{collection.owner?.displayName || '-'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-gray-600">{collection.itemCount}</td>
                                            <td className="px-4 py-3 text-center text-gray-600">{collection.viewCount}</td>
                                            <td className="px-4 py-3 text-center text-gray-600">{collection.likeCount}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-2">
                                                    {collection.isPublic ? (
                                                        <span className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded">Görünür</span>
                                                    ) : (
                                                        <span className="px-2 py-1 text-xs bg-gray-700 text-gray-500 rounded">Gizli</span>
                                                    )}
                                                    {collection.isFeatured && (
                                                        <span className="px-2 py-1 text-xs bg-yellow-50 text-yellow-700 rounded">Öne Çıkan</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => toggleVisibility(collection)}
                                                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                                                        title={collection.isPublic ? 'Gizle' : 'Görünür yap'}
                                                    >
                                                        {collection.isPublic ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                                                    </button>
                                                    <button
                                                        onClick={() => toggleFeatured(collection)}
                                                        className="p-2 text-gray-500 hover:text-yellow-700 hover:bg-gray-100 rounded-lg"
                                                        title={collection.isFeatured ? 'Öne çıkarmayı kaldır' : 'Öne çıkar'}
                                                    >
                                                        {collection.isFeatured ? <StarSolidIcon className="h-5 w-5 text-yellow-700" /> : <StarIcon className="h-5 w-5" />}
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(collection)}
                                                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                                                        title="Düzenle"
                                                    >
                                                        <PencilIcon className="h-5 w-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirm(collection.id)}
                                                        className="p-2 text-red-600 hover:text-red-300 hover:bg-red-50 rounded-lg"
                                                        title="Sil"
                                                    >
                                                        <TrashIcon className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 bg-gray-100 text-gray-600 rounded disabled:opacity-50"
                            >
                                Önceki
                            </button>
                            <span className="text-gray-500">
                                Sayfa {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1 bg-gray-100 text-gray-600 rounded disabled:opacity-50"
                            >
                                Sonraki
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">
                            {editingCollection ? 'Koleksiyon Düzenle' : 'Yeni Koleksiyon'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Koleksiyon Adı *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="admin-input w-full"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Açıklama</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="admin-input w-full"
                                    rows={3}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Kapak Görseli URL</label>
                                <input
                                    type="url"
                                    value={formData.coverImageUrl}
                                    onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
                                    className="admin-input w-full"
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.isPublic}
                                        onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 bg-gray-100 text-primary-600"
                                    />
                                    <span className="text-sm text-gray-600">Görünür</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.isFeatured}
                                        onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 bg-gray-100 text-primary-600"
                                    />
                                    <span className="text-sm text-gray-600">Öne Çıkan</span>
                                </label>
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Koleksiyonu Sil</h3>
                        <p className="text-gray-500 mb-6">
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
