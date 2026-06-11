'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Input, Select, Spinner, Textarea } from '@tarodan/ui';
import { DataTable, type ColumnDef } from '@/components/DataTable';
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
import { PageHeader, ActionButtons, ActionIconButton } from '@/components/admin-list';

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

    const columns: ColumnDef<Brand, any>[] = [
        {
            header: 'Marka',
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    {row.original.logo ? (
                        <img
                            src={row.original.logo}
                            alt={row.original.name}
                            className="w-10 h-10 rounded-lg object-contain bg-surface-alt"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-lg bg-border-subtle flex items-center justify-center text-muted font-bold">
                            {row.original.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <p className="font-medium text-heading">{row.original.name}</p>
                        <p className="text-sm text-muted">{row.original.slug}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'Website',
            cell: ({ row }) => (
                row.original.website ? (
                    <a
                        href={row.original.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-info-600 hover:text-info-800 flex items-center gap-1"
                    >
                        <GlobeAltIcon className="w-4 h-4" />
                        Ziyaret Et
                    </a>
                ) : (
                    <span className="text-muted text-sm">-</span>
                )
            ),
        },
        {
            header: 'Durum',
            cell: ({ row }) => (
                <Button variant="secondary" onClick={() => toggleStatus(row.original)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${row.original.isActive
                            ? 'bg-success-100 text-success-800'
                            : 'bg-surface-alt text-body'
                        }`}>
                    {row.original.isActive ? (
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
                </Button>
            ),
        },
        {
            header: 'Modeller',
            cell: ({ row }) => (
                <>
                    <Button variant="secondary" onClick={() => toggleExpand(row.original.id)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                        {expandedBrandId === row.original.id ? (
                            <ChevronDownIcon className="w-4 h-4" />
                        ) : (
                            <ChevronRightIcon className="w-4 h-4" />
                        )}
                        <TruckIcon className="w-4 h-4" />
                        Modeller
                    </Button>
                    {expandedBrandId === row.original.id && (
                        <div className="mt-4">
                            {modelsLoading ? (
                                <div className="flex items-center gap-2 text-muted">
                                    <Spinner size="sm" color="border-primary-500 border-t-transparent" />
                                    Modeller yükleniyor...
                                </div>
                            ) : modelsForBrand.length === 0 ? (
                                <div className="flex items-center gap-4">
                                    <p className="text-muted">Bu marka için henüz model eklenmemiş</p>
                                    <Button variant="secondary" onClick={() => openModelCreateModal(row.original.id)}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg">
                                        <PlusIcon className="w-4 h-4" />
                                        Model Ekle
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-body">Modeller ({modelsForBrand.length})</span>
                                        <Button variant="secondary" onClick={() => openModelCreateModal(row.original.id)}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg">
                                            <PlusIcon className="w-4 h-4" />
                                            Model Ekle
                                        </Button>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        <table className="min-w-full divide-y divide-border">
                                            <tbody className="divide-y divide-border-subtle">
                                                {modelsForBrand.map((m) => (
                                                    <tr key={m.id} className="hover:bg-surface-alt">
                                                        <td className="py-2 pr-4">
                                                            <div>
                                                                <p className="font-medium text-heading">{m.name}</p>
                                                                <p className="text-xs text-muted">{m.slug}</p>
                                                            </div>
                                                        </td>
                                                        <td className="py-2 pr-4 text-sm text-muted">
                                                            {m.yearStart || m.yearEnd ? `${m.yearStart ?? '?'} - ${m.yearEnd ?? '?'}` : '-'}
                                                        </td>
                                                        <td className="py-2">
                                                            <Button variant="secondary" onClick={() => toggleModelStatus(m)}
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.isActive ? 'bg-success-100 text-success-800' : 'bg-surface-alt text-body'}`}>
                                                                {m.isActive ? 'Aktif' : 'Pasif'}
                                                            </Button>
                                                        </td>
                                                        <td className="py-2 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button variant="secondary" onClick={() => openModelEditModal(m)} className="p-1.5 text-muted hover:text-muted hover:bg-border-subtle rounded" title="Düzenle">
                                                                    <PencilIcon className="w-4 h-4" />
                                                                </Button>
                                                                <Button variant="secondary" onClick={() => setDeleteConfirmModel(m.id)} className="p-1.5 text-muted hover:text-danger-600 hover:bg-danger-50 rounded" title="Sil">
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            ),
        },
        {
            id: 'actions',
            header: 'İşlemler',
            cell: ({ row }) => (
                <ActionButtons>
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
                <PageHeader
                    title="Marka Yönetimi"
                    description="Uygulamada gösterilecek markaları buradan yönetebilirsiniz"
                >
                    <Button variant="primary" size="md" onClick={openCreateModal}>
                        <PlusIcon className="w-5 h-5" />
                        Yeni Marka Ekle
                    </Button>
                </PageHeader>

                {/* Brands Table */}
                <DataTable
                    columns={columns}
                    data={brands}
                    loading={loading}
                    emptyText="Henüz marka eklenmemiş"
                    emptyAction={<Button onClick={openCreateModal}><PlusIcon className="w-5 h-5 mr-2" />İlk markayı ekle</Button>}
                    getRowId={(b) => b.id}
                />

                {/* Create/Edit Modal */}
                {showModal && (
                    <div className="fixed inset-0 z-50 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <div className="fixed inset-0 bg-heading/50" onClick={() => setShowModal(false)} />
                            <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-md px-6 pb-6 pt-5">
                                <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">
                                    {editingBrand ? 'Markayı Düzenle' : 'Yeni Marka Ekle'}
                                </h3>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-body mb-1">
                                            Marka Adı *
                                        </label>
                                        <Input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            placeholder="Örn: Ferrari"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-body mb-1">
                                            Logo URL
                                        </label>
                                        <Input
                                            type="url"
                                            value={formData.logo}
                                            onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                                            placeholder="https://example.com/logo.png"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-body mb-1">
                                            Website
                                        </label>
                                        <Input
                                            type="url"
                                            value={formData.website}
                                            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                            placeholder="https://www.ferrari.com"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-body mb-1">
                                            Açıklama
                                        </label>
                                        <Textarea value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            rows={2}
                                            placeholder="Marka hakkında kısa açıklama" />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-body mb-1">
                                            Durum
                                        </label>
                                        <Select
                                            value={formData.isActive ? 'true' : 'false'}
                                            onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                                        >
                                            <option value="true">Aktif</option>
                                            <option value="false">Pasif</option>
                                        </Select>
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
                            <div className="fixed inset-0 bg-heading/50" onClick={() => setDeleteConfirm(null)} />
                            <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-sm px-6 pb-6 pt-5">
                                <h3 className="text-lg font-semibold text-heading mb-2 leading-tight">
                                    Markayı Sil
                                </h3>
                                <p className="text-muted mb-4">
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
                            <div className="fixed inset-0 bg-heading/50" onClick={() => setShowModelModal(false)} />
                            <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-md px-6 pb-6 pt-5">
                                <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">
                                    {editingModel ? 'Modeli Düzenle' : 'Yeni Model Ekle'}
                                </h3>
                                <form onSubmit={handleModelSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-body mb-1">Marka *</label>
                                        <Select
                                            value={modelFormData.brandId}
                                            onChange={(e) => setModelFormData({ ...modelFormData, brandId: e.target.value })}
                                            required
                                            disabled={!!editingModel}
                                        >
                                            <option value="">Seçiniz</option>
                                            {brands.map((b) => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-body mb-1">Model Adı *</label>
                                        <Input
                                            type="text"
                                            value={modelFormData.name}
                                            onChange={(e) => setModelFormData({ ...modelFormData, name: e.target.value })}
                                            required
                                            placeholder="Örn: M4, 911 GT3"
                                        />
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-body mb-1">Başlangıç Yılı</label>
                                            <Input
                                                type="number"
                                                value={modelFormData.yearStart}
                                                onChange={(e) => setModelFormData({ ...modelFormData, yearStart: e.target.value ? parseInt(e.target.value) : '' })}
                                                min="1900"
                                                max="2100"
                                                placeholder="2014"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-body mb-1">Bitiş Yılı</label>
                                            <Input
                                                type="number"
                                                value={modelFormData.yearEnd}
                                                onChange={(e) => setModelFormData({ ...modelFormData, yearEnd: e.target.value ? parseInt(e.target.value) : '' })}
                                                min="1900"
                                                max="2100"
                                                placeholder="Boş = devam ediyor"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-body mb-1">Durum</label>
                                        <Select
                                            value={modelFormData.isActive ? 'true' : 'false'}
                                            onChange={(e) => setModelFormData({ ...modelFormData, isActive: e.target.value === 'true' })}
                                        >
                                            <option value="true">Aktif</option>
                                            <option value="false">Pasif</option>
                                        </Select>
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
                            <div className="fixed inset-0 bg-heading/50" onClick={() => setDeleteConfirmModel(null)} />
                            <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-sm px-6 pb-6 pt-5">
                                <h3 className="text-lg font-semibold text-heading mb-2 leading-tight">Modeli Sil</h3>
                                <p className="text-muted mb-4">Bu modeli silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
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
