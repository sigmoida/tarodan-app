'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Spinner } from '@tarodan/ui';
import { Fragment } from 'react';
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    GlobeAltIcon,
    CheckCircleIcon,
    XCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    TruckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface CarModel {
    id: string;
    name: string;
    slug: string;
    brandId: string;
    yearStart?: number | null;
    yearEnd?: number | null;
    isActive: boolean;
    brand?: { id: string; name: string; slug: string };
}

interface Brand {
    id: string;
    name: string;
    slug: string;
    logo?: string;
    description?: string;
    website?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

interface BrandFormData {
    name: string;
    logo: string;
    description: string;
    website: string;
    isActive: boolean;
}

interface CarModelFormData {
    brandId: string;
    name: string;
    yearStart: number | '';
    yearEnd: number | '';
    isActive: boolean;
}

export default function BrandsPage() {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);
    const [modelsForBrand, setModelsForBrand] = useState<CarModel[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [showModelModal, setShowModelModal] = useState(false);
    const [editingModel, setEditingModel] = useState<CarModel | null>(null);
    const [deleteConfirmModel, setDeleteConfirmModel] = useState<string | null>(null);
    const [modelFormData, setModelFormData] = useState<CarModelFormData>({
        brandId: '',
        name: '',
        yearStart: '',
        yearEnd: '',
        isActive: true,
    });
    const [formData, setFormData] = useState<BrandFormData>({
        name: '',
        logo: '',
        description: '',
        website: '',
        isActive: true,
    });

    useEffect(() => {
        loadBrands();
    }, []);

    useEffect(() => {
        if (expandedBrandId) {
            loadModelsForBrand(expandedBrandId);
        } else {
            setModelsForBrand([]);
        }
    }, [expandedBrandId]);

    const loadModelsForBrand = async (brandId: string) => {
        setModelsLoading(true);
        try {
            const response = await adminApi.getCarModels(brandId);
            setModelsForBrand(response.data.data || response.data || []);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Modeller yüklenemedi');
            setModelsForBrand([]);
        } finally {
            setModelsLoading(false);
        }
    };

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

    const toggleExpand = (brandId: string) => {
        setExpandedBrandId(prev => prev === brandId ? null : brandId);
    };

    const openModelCreateModal = (brandId: string) => {
        setEditingModel(null);
        setModelFormData({
            brandId,
            name: '',
            yearStart: '',
            yearEnd: '',
            isActive: true,
        });
        setShowModelModal(true);
    };

    const openModelEditModal = (m: CarModel) => {
        setEditingModel(m);
        setModelFormData({
            brandId: m.brandId,
            name: m.name,
            yearStart: m.yearStart ?? '',
            yearEnd: m.yearEnd ?? '',
            isActive: m.isActive,
        });
        setShowModelModal(true);
    };

    const handleModelSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                brandId: modelFormData.brandId,
                name: modelFormData.name,
                yearStart: modelFormData.yearStart !== '' ? Number(modelFormData.yearStart) : undefined,
                yearEnd: modelFormData.yearEnd !== '' ? Number(modelFormData.yearEnd) : undefined,
                isActive: modelFormData.isActive,
            };
            if (editingModel) {
                await adminApi.updateCarModel(editingModel.id, { name: payload.name, yearStart: payload.yearStart, yearEnd: payload.yearEnd, isActive: payload.isActive });
                toast.success('Model güncellendi');
            } else {
                await adminApi.createCarModel(payload);
                toast.success('Model eklendi');
            }
            setShowModelModal(false);
            if (expandedBrandId) loadModelsForBrand(expandedBrandId);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'İşlem başarısız');
        }
    };

    const handleModelDelete = async (id: string) => {
        try {
            await adminApi.deleteCarModel(id);
            toast.success('Model silindi');
            setDeleteConfirmModel(null);
            if (expandedBrandId) loadModelsForBrand(expandedBrandId);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
        }
    };

    const toggleModelStatus = async (m: CarModel) => {
        try {
            await adminApi.updateCarModel(m.id, { isActive: !m.isActive });
            toast.success(m.isActive ? 'Model pasif yapıldı' : 'Model aktif yapıldı');
            if (expandedBrandId) loadModelsForBrand(expandedBrandId);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Durum değiştirilemedi');
        }
    };

    return (
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Marka Yönetimi</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Uygulamada gösterilecek markaları buradan yönetebilirsiniz
                        </p>
                    </div>
                    <Button variant="primary" size="md" onClick={openCreateModal}>
                        <PlusIcon className="w-5 h-5" />
                        Yeni Marka Ekle
                    </Button>
                </div>

                {/* Brands Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center">
                            <Spinner size="lg" color="border-orange-500 border-t-transparent" className="mx-auto" />
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
                                        Durum
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Modeller
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        İşlemler
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {brands.map((brand) => (
                                    <Fragment key={brand.id}>
                                    <tr className="hover:bg-gray-50">
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
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => toggleExpand(brand.id)}
                                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                            >
                                                {expandedBrandId === brand.id ? (
                                                    <ChevronDownIcon className="w-4 h-4" />
                                                ) : (
                                                    <ChevronRightIcon className="w-4 h-4" />
                                                )}
                                                <TruckIcon className="w-4 h-4" />
                                                Modeller
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
                                    {expandedBrandId === brand.id && (
                                        <tr key={`${brand.id}-models`}>
                                            <td colSpan={5} className="px-6 py-4 bg-gray-50">
                                                {modelsLoading ? (
                                                    <div className="flex items-center gap-2 text-gray-500">
                                                        <Spinner size="sm" color="border-orange-500 border-t-transparent" />
                                                        Modeller yükleniyor...
                                                    </div>
                                                ) : modelsForBrand.length === 0 ? (
                                                    <div className="flex items-center gap-4">
                                                        <p className="text-gray-500">Bu marka için henüz model eklenmemiş</p>
                                                        <button
                                                            onClick={() => openModelCreateModal(brand.id)}
                                                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg"
                                                        >
                                                            <PlusIcon className="w-4 h-4" />
                                                            Model Ekle
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-medium text-gray-700">Modeller ({modelsForBrand.length})</span>
                                                            <button
                                                                onClick={() => openModelCreateModal(brand.id)}
                                                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg"
                                                            >
                                                                <PlusIcon className="w-4 h-4" />
                                                                Model Ekle
                                                            </button>
                                                        </div>
                                                        <div className="max-h-48 overflow-y-auto">
                                                            <table className="min-w-full divide-y divide-gray-200">
                                                                <tbody className="divide-y divide-gray-100">
                                                                    {modelsForBrand.map((m) => (
                                                                        <tr key={m.id} className="hover:bg-gray-100">
                                                                            <td className="py-2 pr-4">
                                                                                <div>
                                                                                    <p className="font-medium text-gray-900">{m.name}</p>
                                                                                    <p className="text-xs text-gray-500">{m.slug}</p>
                                                                                </div>
                                                                            </td>
                                                                            <td className="py-2 pr-4 text-sm text-gray-500">
                                                                                {m.yearStart || m.yearEnd ? `${m.yearStart ?? '?'} - ${m.yearEnd ?? '?'}` : '-'}
                                                                            </td>
                                                                            <td className="py-2">
                                                                                <button
                                                                                    onClick={() => toggleModelStatus(m)}
                                                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                                                                                >
                                                                                    {m.isActive ? 'Aktif' : 'Pasif'}
                                                                                </button>
                                                                            </td>
                                                                            <td className="py-2 text-right">
                                                                                <div className="flex items-center justify-end gap-1">
                                                                                    <button onClick={() => openModelEditModal(m)} className="p-1.5 text-gray-500 hover:text-gray-600 hover:bg-gray-200 rounded" title="Düzenle">
                                                                                        <PencilIcon className="w-4 h-4" />
                                                                                    </button>
                                                                                    <button onClick={() => setDeleteConfirmModel(m.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Sil">
                                                                                        <TrashIcon className="w-4 h-4" />
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                    </Fragment>
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

                                    <div>
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

                                    <div className="flex justify-end gap-3 pt-4">
                                        <Button variant="secondary" size="md" type="button" onClick={() => setShowModal(false)}>
                                            İptal
                                        </Button>
                                        <Button variant="primary" size="md" type="submit">
                                            {editingBrand ? 'Güncelle' : 'Ekle'}
                                        </Button>
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
                                    <Button variant="secondary" size="md" onClick={() => setDeleteConfirm(null)}>
                                        İptal
                                    </Button>
                                    <Button variant="danger" size="md" onClick={() => handleDelete(deleteConfirm)}>
                                        Sil
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Model Add/Edit Modal */}
                {showModelModal && (
                    <div className="fixed inset-0 z-50 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <div className="fixed inset-0 bg-black/50" onClick={() => setShowModelModal(false)} />
                            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    {editingModel ? 'Modeli Düzenle' : 'Yeni Model Ekle'}
                                </h3>
                                <form onSubmit={handleModelSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Marka *</label>
                                        <select
                                            value={modelFormData.brandId}
                                            onChange={(e) => setModelFormData({ ...modelFormData, brandId: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            required
                                            disabled={!!editingModel}
                                        >
                                            <option value="">Seçiniz</option>
                                            {brands.map((b) => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Model Adı *</label>
                                        <input
                                            type="text"
                                            value={modelFormData.name}
                                            onChange={(e) => setModelFormData({ ...modelFormData, name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            required
                                            placeholder="Örn: M4, 911 GT3"
                                        />
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç Yılı</label>
                                            <input
                                                type="number"
                                                value={modelFormData.yearStart}
                                                onChange={(e) => setModelFormData({ ...modelFormData, yearStart: e.target.value ? parseInt(e.target.value) : '' })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                min="1900"
                                                max="2100"
                                                placeholder="2014"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Bitiş Yılı</label>
                                            <input
                                                type="number"
                                                value={modelFormData.yearEnd}
                                                onChange={(e) => setModelFormData({ ...modelFormData, yearEnd: e.target.value ? parseInt(e.target.value) : '' })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                min="1900"
                                                max="2100"
                                                placeholder="Boş = devam ediyor"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
                                        <select
                                            value={modelFormData.isActive ? 'true' : 'false'}
                                            onChange={(e) => setModelFormData({ ...modelFormData, isActive: e.target.value === 'true' })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        >
                                            <option value="true">Aktif</option>
                                            <option value="false">Pasif</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4">
                                        <Button variant="secondary" size="md" type="button" onClick={() => setShowModelModal(false)}>
                                            İptal
                                        </Button>
                                        <Button variant="primary" size="md" type="submit">
                                            {editingModel ? 'Güncelle' : 'Ekle'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Model Delete Confirmation Modal */}
                {deleteConfirmModel && (
                    <div className="fixed inset-0 z-50 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirmModel(null)} />
                            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Modeli Sil</h3>
                                <p className="text-gray-600 mb-4">Bu modeli silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
                                <div className="flex justify-end gap-3">
                                    <Button variant="secondary" size="md" onClick={() => setDeleteConfirmModel(null)}>
                                        İptal
                                    </Button>
                                    <Button variant="danger" size="md" onClick={() => handleModelDelete(deleteConfirmModel)}>
                                        Sil
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
