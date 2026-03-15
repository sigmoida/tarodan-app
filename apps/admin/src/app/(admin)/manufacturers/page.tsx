'use client';

import { useState, useEffect, useRef } from 'react';
import { adminApi } from '@/lib/api';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  GlobeAltIcon,
  CheckCircleIcon,
  XCircleIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  website?: string;
  country?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ManufacturerFormData {
  name: string;
  logo: string;
  description: string;
  website: string;
  country: string;
  isActive: boolean;
}

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState<Manufacturer | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<ManufacturerFormData>({
    name: '',
    logo: '',
    description: '',
    website: '',
    country: '',
    isActive: true,
  });

  useEffect(() => {
    loadManufacturers();
  }, []);

  const loadManufacturers = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getManufacturers();
      setManufacturers(response.data.data || response.data || []);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to load manufacturers:', error);
      toast.error(error.response?.data?.message || 'Üreticiler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingManufacturer(null);
    setLogoPreview(null);
    setFormData({
      name: '',
      logo: '',
      description: '',
      website: '',
      country: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const openEditModal = (m: Manufacturer) => {
    setEditingManufacturer(m);
    setLogoPreview(m.logo || null);
    setFormData({
      name: m.name,
      logo: m.logo || '',
      description: m.description || '',
      website: m.website || '',
      country: m.country || '',
      isActive: m.isActive,
    });
    setShowModal(true);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen geçerli bir resim dosyası seçin');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB\'dan küçük olmalı');
      return;
    }
    setUploadingLogo(true);
    try {
      const res = await adminApi.uploadManufacturerLogo(file);
      const uploadedUrl = res.data.url || res.data.key;
      setFormData(prev => ({ ...prev, logo: uploadedUrl }));
      setLogoPreview(URL.createObjectURL(file));
      toast.success('Logo yüklendi');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Logo yüklenemedi');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingManufacturer) {
        await adminApi.updateManufacturer(editingManufacturer.id, formData);
        toast.success('Üretici güncellendi');
      } else {
        await adminApi.createManufacturer(formData);
        toast.success('Üretici oluşturuldu');
      }
      setShowModal(false);
      loadManufacturers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteManufacturer(id);
      toast.success('Üretici silindi');
      setDeleteConfirm(null);
      loadManufacturers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
    }
  };

  const toggleStatus = async (m: Manufacturer) => {
    try {
      await adminApi.updateManufacturer(m.id, { isActive: !m.isActive });
      toast.success(m.isActive ? 'Üretici pasif yapıldı' : 'Üretici aktif yapıldı');
      loadManufacturers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Durum değiştirilemedi');
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Üretici Yönetimi</h1>
            <p className="mt-1 text-sm text-gray-500">
              Diecast model üreticilerini (Hot Wheels, Matchbox vb.) buradan yönetebilirsiniz
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-gray-900 rounded-lg hover:bg-orange-600 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Yeni Üretici Ekle
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-2 text-gray-500">Yükleniyor...</p>
            </div>
          ) : manufacturers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">Henüz üretici eklenmemiş</p>
              <button onClick={openCreateModal} className="mt-4 text-orange-500 hover:text-orange-600 font-medium">
                İlk üreticiyi ekle
              </button>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Üretici</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ülke</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durum</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {manufacturers.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {m.logo ? (
                          <img src={m.logo} alt={m.name} className="w-10 h-10 rounded-lg object-contain bg-gray-100" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{m.name}</p>
                          <p className="text-sm text-gray-500">{m.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.country || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {m.website ? (
                        <a href={m.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                          <GlobeAltIcon className="w-4 h-4" />
                          Ziyaret Et
                        </a>
                      ) : (
                        <span className="text-gray-500 text-sm">-</span>
                      )}
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {editingManufacturer ? 'Üreticiyi Düzenle' : 'Yeni Üretici Ekle'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Üretici Adı *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                      placeholder="Örn: Hot Wheels"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <div className="flex items-center gap-3">
                      {(logoPreview || formData.logo) ? (
                        <img
                          src={logoPreview || formData.logo}
                          alt="Logo"
                          className="w-16 h-16 rounded-lg object-contain bg-gray-100 border border-gray-200"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                          <PhotoIcon className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        {uploadingLogo ? 'Yükleniyor...' : (logoPreview || formData.logo) ? 'Değiştir' : 'Logo Yükle'}
                      </button>
                      {formData.logo && (
                        <button
                          type="button"
                          onClick={() => { setFormData({ ...formData, logo: '' }); setLogoPreview(null); }}
                          className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                        >
                          Kaldır
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="https://www.hotwheels.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ülke</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Örn: ABD"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      rows={2}
                      placeholder="Üretici hakkında kısa açıklama"
                    />
                  </div>
                  <div>
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
                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                      İptal
                    </button>
                    <button type="submit" className="px-4 py-2 bg-orange-500 text-gray-900 rounded-lg hover:bg-orange-600">
                      {editingManufacturer ? 'Güncelle' : 'Ekle'}
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
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Üreticiyi Sil</h3>
                <p className="text-gray-600 mb-4">Bu üreticiyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
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
    </>
  );
}
