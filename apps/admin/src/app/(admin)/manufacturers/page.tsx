'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Input, Select, Textarea } from '@tarodan/ui';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { PageHeader, FilterToolbar, ActionButtons, ActionIconButton } from '@/components/admin-list';
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
  foundedYear?: number | null;
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
  foundedYear: string;
  isActive: boolean;
}

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [search, setSearch] = useState('');
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
    foundedYear: '',
    isActive: true,
  });

  const filteredManufacturers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    if (!term) return manufacturers;

    return manufacturers.filter((manufacturer) =>
      [
        manufacturer.name,
        manufacturer.slug,
        manufacturer.country,
        manufacturer.website,
        manufacturer.description,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('tr').includes(term))
    );
  }, [manufacturers, search]);

  useEffect(() => {
    loadManufacturers();
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirm) setDeleteConfirm(null);
      else if (showModal) setShowModal(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteConfirm, showModal]);

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
      foundedYear: '',
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
      foundedYear: m.foundedYear != null ? String(m.foundedYear) : '',
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
      const uploadedUrl = res.data.key || res.data.url;
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
      const payload = {
        name: formData.name,
        logo: formData.logo || null,
        description: formData.description || null,
        website: formData.website || null,
        country: formData.country || null,
        foundedYear: formData.foundedYear ? parseInt(formData.foundedYear, 10) : null,
        isActive: formData.isActive,
      };
      if (editingManufacturer) {
        await adminApi.updateManufacturer(editingManufacturer.id, payload);
        toast.success('Üretici güncellendi');
      } else {
        await adminApi.createManufacturer(payload);
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

  const columns: ColumnDef<Manufacturer, any>[] = [
    {
      header: 'Üretici',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.logo ? (
            <img src={row.original.logo} alt={row.original.name} className="w-10 h-10 rounded-lg object-contain bg-surface-alt" />
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
      header: 'Ülke',
      cell: ({ row }) => <span className="text-sm text-muted">{row.original.country || '-'}</span>,
    },
    {
      header: 'Website',
      cell: ({ row }) => (
        row.original.website ? (
          <a href={row.original.website} target="_blank" rel="noopener noreferrer" className="text-sm text-info-600 hover:text-info-800 flex items-center gap-1">
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

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Üretici Yönetimi"
          description="Diecast model üreticilerini (Hot Wheels, Matchbox vb.) buradan yönetebilirsiniz"
        >
          <Button variant="primary" size="md" onClick={openCreateModal} className="shrink-0">
            <PlusIcon className="w-5 h-5" />
            Yeni Üretici Ekle
          </Button>
        </PageHeader>

        <FilterToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Üretici ara..."
        />

        <DataTable
          columns={columns}
          data={filteredManufacturers}
          loading={loading}
          emptyText={search ? 'Arama kriterine uygun üretici bulunamadı' : 'Henüz üretici eklenmemiş'}
          emptyAction={!search ? <Button onClick={openCreateModal}><PlusIcon className="w-5 h-5 mr-2" />İlk üreticiyi ekle</Button> : undefined}
          getRowId={(m) => m.id}
        />

        {showModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="fixed inset-0 bg-heading/50" onClick={() => setShowModal(false)} />
              <div className="relative bg-surface-elevated rounded-xl shadow-xl w-full max-w-md px-6 pb-6 pt-5">
                <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">
                  {editingManufacturer ? 'Üreticiyi Düzenle' : 'Yeni Üretici Ekle'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Üretici Adı *</label>
                    <Input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Örn: Hot Wheels"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Logo</label>
                    <Input ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden" />
                    <div className="flex items-center gap-3">
                      {(logoPreview || formData.logo) ? (
                        <img
                          src={logoPreview || formData.logo}
                          alt="Logo"
                          className="w-16 h-16 rounded-lg object-contain bg-surface-alt border border-border"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-surface-alt border border-border flex items-center justify-center">
                          <PhotoIcon className="w-6 h-6 text-subtle" />
                        </div>
                      )}
                      <Button variant="secondary" type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="hover:bg-surface disabled:opacity-50">
                        {uploadingLogo ? 'Yükleniyor...' : (logoPreview || formData.logo) ? 'Değiştir' : 'Logo Yükle'}
                      </Button>
                      {formData.logo && (
                        <Button variant="secondary" type="button"
                          onClick={() => { setFormData({ ...formData, logo: '' }); setLogoPreview(null); }}
                          className="px-3 py-1.5 text-sm text-danger-600 border border-danger-200 rounded-lg hover:bg-danger-50">
                          Kaldır
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Website</label>
                    <Input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="https://www.hotwheels.com"
                    />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-body mb-1">Ülke</label>
                      <Input
                        type="text"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="Örn: ABD"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-body mb-1">Kuruluş Yılı</label>
                      <Input
                        type="number"
                        value={formData.foundedYear}
                        onChange={(e) => setFormData({ ...formData, foundedYear: e.target.value })}
                        min="1800"
                        max="2100"
                        placeholder="Örn: 1968"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Açıklama</label>
                    <Textarea value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                      placeholder="Üretici hakkında kısa açıklama" />
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
                      {editingManufacturer ? 'Güncelle' : 'Ekle'}
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
                <h3 className="text-lg font-semibold text-heading mb-2 leading-tight">Üreticiyi Sil</h3>
                <p className="text-muted mb-4">Bu üreticiyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
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
