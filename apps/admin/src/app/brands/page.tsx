'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    GlobeAltIcon,
    CheckCircleIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Brand {
    id: string;
    name: string;
    slug: string;
    logo?: string;
    description?: string;
    website?: string;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

interface BrandFormData {
    name: string;
    logo: string;
    description: string;
    website: string;
    sortOrder: number;
    isActive: boolean;
}

export default function BrandsPage() {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [formData, setFormData] = useState<BrandFormData>({
        name: '',
        logo: '',
        description: '',
        website: '',
        sortOrder: 0,
        isActive: true,
    });

    useEffect(() => {
        loadBrands();
    }, []);

    const loadBrands = async () => {
        setLoading(true);
        try {
            const response = await adminApi.getBrands();
            setBrands(response.data.data || response.data || []);
        } catch (error: any) {
            if (process.env.NODE_ENV === 'development') console.error('Failed to load brands:', error);
            toast.error(error.response?.data?.message || 'Markalar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingBrand(null);
        setFormData({
            name: '',
            logo: '',
            description: '',
            website: '',
            sortOrder: 0,
            isActive: true,
        });
        setShowModal(true);
    };

    const openEditModal = (brand: Brand) => {
        setEditingBrand(brand);
        setFormData({
            name: brand.name,
            logo: brand.logo || '',
            description: brand.description || '',
            website: brand.website || '',
            sortOrder: brand.sortOrder,
            isActive: brand.isActive,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingBrand) {
                await adminApi.updateBrand(editingBrand.id, formData);
                toast.success('Marka güncellendi');
            } else {
                await adminApi.createBrand(formData);
                toast.success('Marka oluşturuldu');
            }
            setShowModal(false);
            loadBrands();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'İşlem başarısız');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await adminApi.deleteBrand(id);
            toast.success('Marka silindi');
            setDeleteConfirm(null);
            loadBrands();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
        }
    };

    const toggleStatus = async (brand: Brand) => {
        try {
            await adminApi.updateBrand(brand.id, { isActive: !brand.isActive });
            toast.success(brand.isActive ? 'Marka pasif yapıldı' : 'Marka aktif yapıldı');
            loadBrands();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Durum değiştirilemedi');
        }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Marka Yönetimi</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Uygulamada gösterilecek markaları buradan yönetebilirsiniz
                        </p>
                    </div>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-gray-900 rounded-lg hover:bg-orange-600 transition-colors"
                    >
                        <PlusIcon className="w-5 h-5" />
                        Yeni Marka Ekle
                    </button>
                </div>

                {/* Brands Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Yükleniyor...</p>
                        </div>
                    ) : brands.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-gray-500">Henüz marka eklenmemiş</p>
                            <button
                                onClick={openCreateModal}
                                className="mt-4 text-orange-500 hover:text-orange-600 font-medium"
                            >
                                İlk markayı ekle
                            </button>
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Marka
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Website
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Sıra
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Durum
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        İşlemler
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {brands.map((brand) => (
                                    <tr key={brand.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                {brand.logo ? (
                                                    <img
                                                        src={brand.logo}
                                                        alt={brand.name}
                                                        className="w-10 h-10 rounded-lg object-contain bg-gray-100"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                                                        {brand.name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-medium text-gray-900">{brand.name}</p>
                                                    <p className="text-sm text-gray-500">{brand.slug}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {brand.website ? (
                                                <a
                                                    href={brand.website}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                >
                                                    <GlobeAltIcon className="w-4 h-4" />
                                                    Ziyaret Et
                                                </a>
                                            ) : (
                                                <span className="text-gray-500 text-sm">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {brand.sortOrder}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => toggleStatus(brand)}
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${brand.isActive
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-gray-100 text-gray-800'
                                                    }`}
                                            >
                                                {brand.isActive ? (
                                                    <>
                                                        <CheckCircleIcon className="w-4 h-4" />
                                                        Aktif
                                                    </>
                                                ) : (
                                                    <>
                                                        <XCircleIcon className="w-4 h-4" />
                                                        Pasif
                                                    </>
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => openEditModal(brand)}
                                                    className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                                    title="Düzenle"
                                                >
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirm(brand.id)}
                                                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                    title="Sil"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Create/Edit Modal */}
                {showModal && (
                    <div className="fixed inset-0 z-50 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
                            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    {editingBrand ? 'Markayı Düzenle' : 'Yeni Marka Ekle'}
                                </h3>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Marka Adı *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            required
                                            placeholder="Örn: Ferrari"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Logo URL
                                        </label>
                                        <input
                                            type="url"
                                            value={formData.logo}
                                            onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            placeholder="https://example.com/logo.png"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Website
                                        </label>
                                        <input
                                            type="url"
                                            value={formData.website}
                                            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            placeholder="https://www.ferrari.com"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Açıklama
                                        </label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            rows={2}
                                            placeholder="Marka hakkında kısa açıklama"
                                        />
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Sıra
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.sortOrder}
                                                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                min="0"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Durum
                                            </label>
                                            <select
                                                value={formData.isActive ? 'true' : 'false'}
                                                onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            >
                                                <option value="true">Aktif</option>
                                                <option value="false">Pasif</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setShowModal(false)}
                                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                        >
                                            İptal
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-orange-500 text-gray-900 rounded-lg hover:bg-orange-600"
                                        >
                                            {editingBrand ? 'Güncelle' : 'Ekle'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {deleteConfirm && (
                    <div className="fixed inset-0 z-50 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
                            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Markayı Sil
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    Bu markayı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setDeleteConfirm(null)}
                                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        onClick={() => handleDelete(deleteConfirm)}
                                        className="px-4 py-2 bg-red-500 text-gray-900 rounded-lg hover:bg-red-600"
                                    >
                                        Sil
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
