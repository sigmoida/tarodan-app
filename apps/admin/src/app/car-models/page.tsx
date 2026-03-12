'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
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
  sortOrder: number;
  isActive: boolean;
  brand: Brand;
}

interface CarModelFormData {
  brandId: string;
  name: string;
  yearStart: number | '';
  yearEnd: number | '';
  sortOrder: number;
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
    sortOrder: 0,
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
      sortOrder: 0,
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
      sortOrder: m.sortOrder,
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
        sortOrder: formData.sortOrder,
        isActive: formData.isActive,
      };
      if (editingModel) {
        await adminApi.updateCarModel(editingModel.id, { name: payload.name, yearStart: payload.yearStart, yearEnd: payload.yearEnd, sortOrder: payload.sortOrder, isActive: payload.isActive });
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
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Model Yönetimi</h1>
            <p className="mt-1 text-sm text-gray-500">Marka bazlı araç modellerini (örn. BMW M4, Porsche 911) buradan yönetebilirsiniz</p>
          </div>
          <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-gray-900 rounded-lg hover:bg-orange-600 transition-colors">
            <PlusIcon className="w-5 h-5" />
            Yeni Model Ekle
          </button>
        </div>

        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Marka:</label>
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 min-w-[200px]"
          >
            <option value="">Tüm markalar</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-2 text-gray-500">Yükleniyor...</p>
            </div>
          ) : models.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">Bu marka için henüz model eklenmemiş</p>
              <button onClick={openCreateModal} className="mt-4 text-orange-500 hover:text-orange-600 font-medium">
                İlk modeli ekle
              </button>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marka</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Yıl</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durum</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {models.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="font-medium text-gray-900">{m.name}</p>
                        <p className="text-sm text-gray-500">{m.slug}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.brand?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {m.yearStart || m.yearEnd ? `${m.yearStart ?? '?'} - ${m.yearEnd ?? '?'}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleStatus(m)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${m.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                      >
                        {m.isActive ? <><CheckCircleIcon className="w-4 h-4" />Aktif</> : <><XCircleIcon className="w-4 h-4" />Pasif</>}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(m)} className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Düzenle">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm(m.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Sil">
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

        {showModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
              <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{editingModel ? 'Modeli Düzenle' : 'Yeni Model Ekle'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Marka *</label>
                    <select
                      value={formData.brandId}
                      onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
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
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                        value={formData.yearStart}
                        onChange={(e) => setFormData({ ...formData, yearStart: e.target.value ? parseInt(e.target.value) : '' })}
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
                        value={formData.yearEnd}
                        onChange={(e) => setFormData({ ...formData, yearEnd: e.target.value ? parseInt(e.target.value) : '' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        min="1900"
                        max="2100"
                        placeholder="Boş = devam ediyor"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sıra</label>
                      <input
                        type="number"
                        value={formData.sortOrder}
                        onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        min="0"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
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
                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                      İptal
                    </button>
                    <button type="submit" className="px-4 py-2 bg-orange-500 text-gray-900 rounded-lg hover:bg-orange-600">
                      {editingModel ? 'Güncelle' : 'Ekle'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
              <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Modeli Sil</h3>
                <p className="text-gray-600 mb-4">Bu modeli silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                    İptal
                  </button>
                  <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-500 text-gray-900 rounded-lg hover:bg-red-600">
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
