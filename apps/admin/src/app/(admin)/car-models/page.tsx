'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Input, Select, Spinner } from '@tarodan/ui';
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

  const loadBrands = async () => {
    try {
      const response = await adminApi.getBrands();
      const data = response.data.data || response.data || [];
      setBrands(data);
      if (data.length > 0 && !selectedBrandId) setSelectedBrandId(data[0].id);
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

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-heading">Model Yönetimi</h1>
            <p className="mt-1 text-sm text-muted">Marka bazlı araç modellerini (örn. BMW M4, Porsche 911) buradan yönetebilirsiniz</p>
          </div>
          <Button variant="primary" size="md" onClick={openCreateModal}>
            <PlusIcon className="w-5 h-5" />
            Yeni Model Ekle
          </Button>
        </div>

        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium text-body">Marka:</label>
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
        </div>

        <div className="bg-surface-elevated rounded-xl shadow-sm border border-border-subtle overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <Spinner size="lg" color="border-primary-500 border-t-transparent" className="mx-auto" />
              <p className="mt-2 text-muted">Yükleniyor...</p>
            </div>
          ) : models.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted">Bu marka için henüz model eklenmemiş</p>
              <Button variant="secondary" onClick={openCreateModal} className="mt-4 text-primary-500 hover:text-primary-600 font-medium">
                İlk modeli ekle
              </Button>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Marka</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Yıl</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Durum</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">İşlemler</th>
                </tr>
              </thead>
              <tbody className="bg-surface-elevated divide-y divide-border">
                {models.map((m) => (
                  <tr key={m.id} className="hover:bg-surface">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="font-medium text-heading">{m.name}</p>
                        <p className="text-sm text-muted">{m.slug}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{m.brand?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                      {m.yearStart || m.yearEnd ? `${m.yearStart ?? '?'} - ${m.yearEnd ?? '?'}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button variant="secondary" onClick={() => toggleStatus(m)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${m.isActive ? 'bg-success-100 text-success-800' : 'bg-surface-alt text-body'}`}>
                        {m.isActive ? <><CheckCircleIcon className="w-4 h-4" />Aktif</> : <><XCircleIcon className="w-4 h-4" />Pasif</>}
                      </Button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={() => openEditModal(m)} className="p-2 text-muted hover:text-muted hover:bg-surface-alt rounded-lg" title="Düzenle">
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Button variant="secondary" onClick={() => setDeleteConfirm(m.id)} className="p-2 text-muted hover:text-danger-600 hover:bg-danger-50 rounded-lg" title="Sil">
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-heading/50" onClick={() => setShowModal(false)} />
              <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-semibold text-heading mb-4">{editingModel ? 'Modeli Düzenle' : 'Yeni Model Ekle'}</h3>
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
              <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-sm p-6">
                <h3 className="text-lg font-semibold text-heading mb-2">Modeli Sil</h3>
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
