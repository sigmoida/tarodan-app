'use client';

import { useState, useEffect, useMemo } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Input, Select } from '@tarodan/ui';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { PageHeader, FilterToolbar, ActionButtons, ActionIconButton } from '@/components/admin-list';
import { PlusIcon, PencilIcon, TrashIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface CarModel {
  id: string;
  name: string;
  slug: string;
  brandId: string;
  yearStart?: number | null;
  yearEnd?: number | null;
  isActive: boolean;
  brand: Brand;
}

interface CarModelFormData {
  brandId: string;
  name: string;
  yearStart: number | '';
  yearEnd: number | '';
  isActive: boolean;
}

export default function CarModelsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<CarModel[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingModel, setEditingModel] = useState<CarModel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState<CarModelFormData>({
    brandId: '',
    name: '',
    yearStart: '',
    yearEnd: '',
    isActive: true,
  });

  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    loadModels(selectedBrandId || undefined);
  }, [selectedBrandId]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirm) setDeleteConfirm(null);
      else if (showModal) setShowModal(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteConfirm, showModal]);

  const loadBrands = async () => {
    try {
      const response = await adminApi.getBrands();
      const data = response.data.data || response.data || [];
      setBrands(data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Markalar yüklenemedi');
    }
  };

  const loadModels = async (brandId?: string) => {
    setLoading(true);
    try {
      const response = await adminApi.getCarModels(brandId);
      setModels(response.data.data || response.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Modeller yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingModel(null);
    setFormData({
      brandId: selectedBrandId || brands[0]?.id || '',
      name: '',
      yearStart: '',
      yearEnd: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const openEditModal = (m: CarModel) => {
    setEditingModel(m);
    setFormData({
      brandId: m.brandId,
      name: m.name,
      yearStart: m.yearStart ?? '',
      yearEnd: m.yearEnd ?? '',
      isActive: m.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        brandId: formData.brandId,
        name: formData.name,
        yearStart: formData.yearStart !== '' ? Number(formData.yearStart) : undefined,
        yearEnd: formData.yearEnd !== '' ? Number(formData.yearEnd) : undefined,
        isActive: formData.isActive,
      };
      if (editingModel) {
        await adminApi.updateCarModel(editingModel.id, { name: payload.name, yearStart: payload.yearStart, yearEnd: payload.yearEnd, isActive: payload.isActive });
        toast.success('Model güncellendi');
      } else {
        await adminApi.createCarModel(payload);
        toast.success('Model oluşturuldu');
      }
      setShowModal(false);
      loadModels(selectedBrandId || undefined);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteCarModel(id);
      toast.success('Model silindi');
      setDeleteConfirm(null);
      loadModels(selectedBrandId || undefined);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
    }
  };

  const toggleStatus = async (m: CarModel) => {
    try {
      await adminApi.updateCarModel(m.id, { isActive: !m.isActive });
      toast.success(m.isActive ? 'Model pasif yapıldı' : 'Model aktif yapıldı');
      loadModels(selectedBrandId || undefined);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Durum değiştirilemedi');
    }
  };

  const columns: ColumnDef<CarModel, any>[] = [
    {
      header: 'Model',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-heading">{row.original.name}</p>
          <p className="text-sm text-muted">{row.original.slug}</p>
        </div>
      ),
    },
    {
      header: 'Marka',
      cell: ({ row }) => <span className="text-sm text-muted">{row.original.brand?.name || '-'}</span>,
    },
    {
      header: 'Yıl',
      cell: ({ row }) => (
        <span className="text-sm text-muted">
          {row.original.yearStart || row.original.yearEnd ? `${row.original.yearStart ?? '?'} - ${row.original.yearEnd ?? '?'}` : '-'}
        </span>
      ),
    },
    {
      header: 'Durum',
      cell: ({ row }) => (
        <Button variant="secondary" onClick={() => toggleStatus(row.original)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${row.original.isActive ? 'bg-success-100 text-success-800' : 'bg-surface-alt text-body'}`}>
          {row.original.isActive ? <><CheckCircleIcon className="w-4 h-4" />Aktif</> : <><XCircleIcon className="w-4 h-4" />Pasif</>}
        </Button>
      ),
    },
    {
      id: 'actions',
      header: 'İşlemler',
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton icon={PencilIcon} onClick={() => openEditModal(row.original)} title="Düzenle" />
          <ActionIconButton icon={TrashIcon} onClick={() => setDeleteConfirm(row.original.id)} title="Sil" variant="danger" />
        </ActionButtons>
      ),
    },
  ];

  // Model adı / slug üzerinde istemci-taraflı arama (marka filtresi backend'de
  // uygulanır; isim araması küçük listede istemcide yeterli).
  const filteredModels = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return models;
    return models.filter((m) =>
      [m.name, m.slug, m.brand?.name ?? '']
        .some((f) => f.toLocaleLowerCase('tr').includes(q)),
    );
  }, [models, search]);

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Model Yönetimi"
          description="Marka bazlı araç modellerini (örn. BMW M4, Porsche 911) buradan yönetebilirsiniz"
        >
          <Button variant="primary" size="md" onClick={openCreateModal} className="shrink-0">
            <PlusIcon className="w-5 h-5" />
            Yeni Model Ekle
          </Button>
        </PageHeader>

        <FilterToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Model ara (ad, marka)..."
        >
          <Select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="min-w-[200px]"
          >
            <option value="">Tüm markalar</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </FilterToolbar>

        <DataTable
          columns={columns}
          data={filteredModels}
          loading={loading}
          emptyText={search.trim() ? 'Aramayla eşleşen model yok' : 'Bu marka için henüz model eklenmemiş'}
          emptyAction={<Button onClick={openCreateModal}><PlusIcon className="w-5 h-5 mr-2" />İlk modeli ekle</Button>}
          getRowId={(m) => m.id}
        />

        {showModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-heading/50" onClick={() => setShowModal(false)} />
              <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-md px-6 pb-6 pt-5">
                <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">{editingModel ? 'Modeli Düzenle' : 'Yeni Model Ekle'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Marka *</label>
                    <Select
                      value={formData.brandId}
                      onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
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
                    <Input type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Örn: M4, 911 GT3" />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-body mb-1">Başlangıç Yılı</label>
                      <Input type="number"
                        value={formData.yearStart}
                        onChange={(e) => setFormData({ ...formData, yearStart: e.target.value ? parseInt(e.target.value) : '' })}
                        min="1900"
                        max="2100"
                        placeholder="2014" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-body mb-1">Bitiş Yılı</label>
                      <Input type="number"
                        value={formData.yearEnd}
                        onChange={(e) => setFormData({ ...formData, yearEnd: e.target.value ? parseInt(e.target.value) : '' })}
                        min="1900"
                        max="2100"
                        placeholder="Boş = devam ediyor" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Durum</label>
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
                      {editingModel ? 'Güncelle' : 'Ekle'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-heading/50" onClick={() => setDeleteConfirm(null)} />
              <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-sm px-6 pb-6 pt-5">
                <h3 className="text-lg font-semibold text-heading mb-2 leading-tight">Modeli Sil</h3>
                <p className="text-muted mb-4">Bu modeli silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
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
      </div>
    </>
  );
}
