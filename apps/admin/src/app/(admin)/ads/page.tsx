'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import Image from 'next/image';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MegaphoneIcon,
  EyeIcon,
  CursorArrowRaysIcon,
  ChartBarIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  DeviceTabletIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Badge, Button, Checkbox, IconButton, Input, Select, Spinner } from '@tarodan/ui';
import { useConfirm } from '@/components/ConfirmProvider';

// IAB Standard Ad Sizes
const IAB_SIZES = [
  { name: 'Leaderboard', width: 728, height: 90, device: 'desktop' },
  { name: 'Medium Rectangle', width: 300, height: 250, device: 'all' },
  { name: 'Wide Skyscraper', width: 160, height: 600, device: 'desktop' },
  { name: 'Half Page', width: 300, height: 600, device: 'desktop' },
  { name: 'Billboard', width: 970, height: 250, device: 'desktop' },
  { name: 'Mobile Leaderboard', width: 320, height: 50, device: 'mobile' },
  { name: 'Mobile Banner', width: 320, height: 100, device: 'mobile' },
  { name: 'Large Mobile Banner', width: 320, height: 480, device: 'mobile' },
  { name: 'Square', width: 250, height: 250, device: 'all' },
  { name: 'Small Square', width: 200, height: 200, device: 'all' },
];

interface Ad {
  id: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  content: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  position: string;
  deviceType: string;
  displayOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  clickCount: number;
  impressionCount: number;
  ctr: number;
  iabCompliant: boolean;
  iabSize: string | null;
  createdAt: string;
  updatedAt: string;
}

const defaultForm = {
  title: '',
  imageUrl: '',
  linkUrl: '',
  content: '',
  altText: '',
  width: 0,
  height: 0,
  position: 'header',
  deviceType: 'all',
  displayOrder: 0,
  isActive: true,
  startDate: '',
  endDate: '',
};

export default function AdsPage() {
  const confirm = useConfirm();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; width: number; height: number } | null>(null);
  const [iabWarning, setIabWarning] = useState<string | null>(null);
  const [filterPosition, setFilterPosition] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAds();
  }, []);

  const loadAds = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAds();
      const data = Array.isArray(res.data) ? res.data : (res.data as any)?.data ?? [];
      setAds(data);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Reklamlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Check if dimensions match IAB standard
  const checkIABCompliance = useCallback((width: number, height: number) => {
    const matched = IAB_SIZES.find(s => s.width === width && s.height === height);
    if (matched) {
      setIabWarning(null);
      return { isCompliant: true, size: matched.name };
    }
    
    // Find closest sizes
    const suggestions = IAB_SIZES
      .map(s => ({ ...s, diff: Math.abs(s.width - width) + Math.abs(s.height - height) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 3);
    
    setIabWarning(
      `Boyut (${width}x${height}) IAB standardı değil. Önerilen: ${suggestions.map(s => `${s.name} (${s.width}x${s.height})`).join(', ')}`
    );
    return { isCompliant: false, suggestions };
  }, []);

  // Load image and get dimensions
  const loadImageDimensions = useCallback((url: string) => {
    const img = new window.Image();
    img.onload = () => {
      setImagePreview({ url, width: img.naturalWidth, height: img.naturalHeight });
      setForm(f => ({ ...f, width: img.naturalWidth, height: img.naturalHeight }));
      checkIABCompliance(img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
      setImagePreview(null);
      setIabWarning(null);
    };
    img.src = url;
  }, [checkIABCompliance]);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Sadece JPG, PNG ve WebP formatları desteklenir');
      return;
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Dosya boyutu maksimum 2MB olmalıdır');
      return;
    }

    setUploadingImage(true);
    try {
      const res = await adminApi.uploadMedia(file);
      const url = res.data?.url ?? (res.data as any)?.url;
      if (url) {
        setForm(f => ({ ...f, imageUrl: url }));
        loadImageDimensions(url);
        toast.success('Görsel yüklendi');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Yükleme başarısız');
    } finally {
      setUploadingImage(false);
    }
  };

  // Drag & Drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setImagePreview(null);
    setIabWarning(null);
    setModalOpen(true);
  };

  const openEdit = (ad: Ad) => {
    setEditingId(ad.id);
    setForm({
      title: ad.title,
      imageUrl: ad.imageUrl ?? '',
      linkUrl: ad.linkUrl ?? '',
      content: ad.content ?? '',
      altText: ad.altText ?? '',
      width: ad.width ?? 0,
      height: ad.height ?? 0,
      position: ad.position,
      deviceType: ad.deviceType ?? 'all',
      displayOrder: ad.displayOrder,
      isActive: ad.isActive,
      startDate: ad.startDate ? ad.startDate.slice(0, 10) : '',
      endDate: ad.endDate ? ad.endDate.slice(0, 10) : '',
    });
    if (ad.imageUrl) {
      loadImageDimensions(ad.imageUrl);
    } else {
      setImagePreview(null);
      setIabWarning(null);
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(defaultForm);
    setImagePreview(null);
    setIabWarning(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Başlık gerekli');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        imageUrl: form.imageUrl.trim() || undefined,
        linkUrl: form.linkUrl.trim() || undefined,
        content: form.content.trim() || undefined,
        altText: form.altText.trim() || undefined,
        width: form.width || undefined,
        height: form.height || undefined,
        position: form.position,
        deviceType: form.deviceType,
        displayOrder: Number(form.displayOrder) || 0,
        isActive: form.isActive,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      };
      if (editingId) {
        await adminApi.updateAd(editingId, payload);
        toast.success('Reklam güncellendi');
      } else {
        await adminApi.createAd(payload);
        toast.success('Reklam oluşturuldu');
      }
      closeModal();
      loadAds();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Kaydetme başarısız');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: 'Bu reklamı silmek istediğinize emin misiniz?', destructive: true }))) return;
    try {
      await adminApi.deleteAd(id);
      toast.success('Reklam silindi');
      loadAds();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Silme başarısız');
    }
  };

  const handleToggleActive = async (ad: Ad) => {
    try {
      await adminApi.updateAd(ad.id, { isActive: !ad.isActive });
      toast.success(ad.isActive ? 'Reklam pasif yapıldı' : 'Reklam aktif yapıldı');
      loadAds();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Güncelleme başarısız');
    }
  };

  // Apply IAB size preset
  const applyIABSize = (size: typeof IAB_SIZES[0]) => {
    setForm(f => ({ ...f, width: size.width, height: size.height }));
    setIabWarning(null);
    toast.success(`${size.name} (${size.width}x${size.height}) boyutu seçildi`);
  };

  // Filter ads (pozisyon + cihaz + başlık/içerik araması)
  const searchQuery = search.trim().toLocaleLowerCase('tr');
  const filteredAds = ads.filter(ad => {
    if (filterPosition && ad.position !== filterPosition) return false;
    if (filterDevice && ad.deviceType !== filterDevice) return false;
    if (searchQuery) {
      const haystack = [ad.title, ad.content ?? '', ad.altText ?? '']
        .join(' ')
        .toLocaleLowerCase('tr');
      if (!haystack.includes(searchQuery)) return false;
    }
    return true;
  });

  const totalClicks = ads.reduce((s, a) => s + (a.clickCount || 0), 0);
  const totalImpressions = ads.reduce((s, a) => s + (a.impressionCount || 0), 0);
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0';
  const activeAds = ads.filter(a => a.isActive).length;

  const positionLabels: Record<string, string> = {
    header: 'Üst Banner',
    sidebar: 'Yan Panel',
    footer: 'Alt Banner',
    inline: 'İçerik Arası',
    popup: 'Popup',
  };

  const deviceLabels: Record<string, string> = {
    desktop: 'Masaüstü',
    mobile: 'Mobil',
    all: 'Tümü',
  };

  const DeviceIcon = ({ type }: { type: string }) => {
    switch (type) {
      case 'desktop': return <ComputerDesktopIcon className="h-4 w-4" />;
      case 'mobile': return <DevicePhoneMobileIcon className="h-4 w-4" />;
      default: return <DeviceTabletIcon className="h-4 w-4" />;
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-heading">Reklam Yönetimi</h1>
            <p className="text-sm text-muted mt-1">IAB standartlarına uygun reklam yönetimi</p>
          </div>
          <Button variant="primary" onClick={openCreate} leftIcon={<PlusIcon className="h-5 w-5" />}>
            Yeni Reklam
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-info-500/20 shrink-0">
                <MegaphoneIcon className="h-6 w-6 text-info-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted truncate">Toplam Reklam</p>
                <p className="text-xl font-bold text-heading truncate">{ads.length}</p>
                <p className="text-xs text-success-700 truncate">{activeAds} aktif</p>
              </div>
            </div>
          </div>
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-100 shrink-0">
                <CursorArrowRaysIcon className="h-6 w-6 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted truncate">Toplam Tıklama</p>
                <p className="text-xl font-bold text-heading truncate">{totalClicks.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success-500/20 shrink-0">
                <EyeIcon className="h-6 w-6 text-success-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted truncate">Görüntülenme</p>
                <p className="text-xl font-bold text-heading truncate">{totalImpressions.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-surface-elevated rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-500/20 shrink-0">
                <ChartBarIcon className="h-6 w-6 text-primary-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted truncate">Ortalama CTR</p>
                <p className="text-xl font-bold text-heading truncate">{avgCTR}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reklam ara (başlık, içerik)..."
            className="w-full sm:w-64"
          />
          <Select
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            className="w-auto"
          >
            <option value="">Tüm Pozisyonlar</option>
            {Object.entries(positionLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Select
            value={filterDevice}
            onChange={(e) => setFilterDevice(e.target.value)}
            className="w-auto"
          >
            <option value="">Tüm Cihazlar</option>
            {Object.entries(deviceLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
        </div>

        {/* Table */}
        <div className="bg-surface-elevated rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-muted">Yükleniyor...</div>
          ) : filteredAds.length === 0 ? (
            <div className="p-12 text-center text-muted">
              <MegaphoneIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Henüz reklam yok. Yeni reklam ekleyin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-alt/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-muted font-medium">Önizleme</th>
                    <th className="text-left py-3 px-4 text-muted font-medium">Başlık</th>
                    <th className="text-left py-3 px-4 text-muted font-medium">Boyut</th>
                    <th className="text-left py-3 px-4 text-muted font-medium">Pozisyon</th>
                    <th className="text-left py-3 px-4 text-muted font-medium">Cihaz</th>
                    <th className="text-left py-3 px-4 text-muted font-medium">Durum</th>
                    <th className="text-left py-3 px-4 text-muted font-medium">İstatistik</th>
                    <th className="text-right py-3 px-4 text-muted font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAds.map((ad) => (
                    <tr key={ad.id} className="hover:bg-surface-alt/30">
                      <td className="py-3 px-4">
                        {ad.imageUrl ? (
                          <div className="relative w-20 h-12 rounded overflow-hidden bg-surface-alt">
                            <Image
                              src={ad.imageUrl}
                              alt={ad.title}
                              fill
                              className="object-contain"
                              sizes="80px"
                            />
                          </div>
                        ) : (
                          <span className="text-muted text-sm">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-heading font-medium">{ad.title}</div>
                        {ad.iabCompliant ? (
                          <span className="text-xs text-success-700 flex items-center gap-1">
                            <CheckCircleIcon className="h-3 w-3" />
                            IAB: {ad.iabSize}
                          </span>
                        ) : ad.width && ad.height ? (
                          <span className="text-xs text-warning-700 flex items-center gap-1">
                            <ExclamationTriangleIcon className="h-3 w-3" />
                            Non-IAB
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-muted text-sm">
                        {ad.width && ad.height ? `${ad.width}x${ad.height}` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" size="sm">
                          {positionLabels[ad.position] || ad.position}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1 text-muted text-sm">
                          <DeviceIcon type={ad.deviceType} />
                          {deviceLabels[ad.deviceType] || ad.deviceType}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          variant={ad.isActive ? 'success' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleActive(ad)}
                        >
                          {ad.isActive ? 'Aktif' : 'Pasif'}
                        </Button>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="text-muted">{ad.clickCount} tıklama</div>
                        <div className="text-muted">{ad.impressionCount} görüntü</div>
                        <div className="text-primary-400">{ad.ctr}% CTR</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <IconButton
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(ad)}
                          title="Düzenle"
                          aria-label="Reklamı düzenle"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </IconButton>
                        <IconButton
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(ad.id)}
                          title="Sil"
                          aria-label="Reklamı sil"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-heading/60 overflow-y-auto">
          <div className="bg-surface-elevated rounded-xl border border-border w-full max-w-2xl shadow-xl my-8">
            <div className="px-4 pb-4 pt-3 border-b border-border">
              <h2 className="text-lg font-semibold text-heading leading-tight">
                {editingId ? 'Reklam Düzenle' : 'Yeni Reklam'}
              </h2>
              <p className="text-sm text-muted">IAB standartlarına uygun reklam oluşturun</p>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="block text-sm text-muted mb-1">Başlık *</label>
                <Input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Reklam başlığı"
                />
              </div>

              {/* Drag & Drop Image Upload */}
              <div>
                <label className="block text-sm text-muted mb-1">Reklam Görseli</label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    dragActive 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-border hover:border-border'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {uploadingImage ? (
                    <div className="text-muted">
                      <Spinner size="lg" className="mx-auto mb-2" />
                      Yükleniyor...
                    </div>
                  ) : imagePreview ? (
                    <div className="space-y-3">
                      <div className="relative mx-auto" style={{ maxWidth: '100%', maxHeight: '200px' }}>
                        <img
                          src={imagePreview.url}
                          alt="Önizleme"
                          className="max-h-48 mx-auto rounded object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span className="text-muted">
                          {imagePreview.width} x {imagePreview.height} px
                        </span>
                        {form.width && form.height && (
                          IAB_SIZES.some(s => s.width === form.width && s.height === form.height) ? (
                            <span className="flex items-center gap-1 text-success-700">
                              <CheckCircleIcon className="h-4 w-4" />
                              IAB Uyumlu
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-warning-700">
                              <ExclamationTriangleIcon className="h-4 w-4" />
                              Non-IAB
                            </span>
                          )
                        )}
                      </div>
                      <Button variant="danger" size="sm" type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, imageUrl: '', width: 0, height: 0 }));
                          setImagePreview(null);
                          setIabWarning(null);
                        }}
                      >
                        Görseli Kaldır
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <CloudArrowUpIcon className="h-10 w-10 mx-auto text-muted mb-2" />
                      <p className="text-muted mb-2">
                        Görseli sürükleyip bırakın veya
                      </p>
                      <Input ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                          e.target.value = '';
                        }} />
                      <Button variant="primary" size="sm" type="button" onClick={() => fileInputRef.current?.click()}>
                        Dosya Seç
                      </Button>
                      <p className="text-xs text-muted mt-2">
                        JPG, PNG, WebP • Max 2MB
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual URL input */}
                <div className="mt-2">
                  <Input
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) => {
                      const url = e.target.value;
                      setForm(f => ({ ...f, imageUrl: url }));
                      if (url) loadImageDimensions(url);
                      else {
                        setImagePreview(null);
                        setIabWarning(null);
                      }
                    }}
                    placeholder="veya görsel URL'si yapıştırın"
                  />
                </div>

                {/* IAB Warning */}
                {iabWarning && (
                  <div className="mt-2 p-3 rounded-lg bg-warning-500/10 border border-warning-500/30">
                    <div className="flex items-start gap-2">
                      <ExclamationTriangleIcon className="h-5 w-5 text-warning-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-warning-700">{iabWarning}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* IAB Size Presets */}
              <div>
                <label className="block text-sm text-muted mb-2">
                  <span className="flex items-center gap-1">
                    <InformationCircleIcon className="h-4 w-4" />
                    IAB Standart Boyutları
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {IAB_SIZES.slice(0, 6).map((size) => (
                    <Button
                      variant={form.width === size.width && form.height === size.height ? 'primary' : 'outline'}
                      size="sm"
                      key={`${size.width}x${size.height}`}
                      type="button"
                      onClick={() => applyIABSize(size)}
                    >
                      {size.name} ({size.width}x{size.height})
                    </Button>
                  ))}
                </div>
              </div>

              {/* Alt Text */}
              <div>
                <label className="block text-sm text-muted mb-1">Alt Metin (Erişilebilirlik)</label>
                <Input
                  type="text"
                  value={form.altText}
                  onChange={(e) => setForm(f => ({ ...f, altText: e.target.value }))}
                  placeholder="Görsel açıklaması (görme engelli kullanıcılar için)"
                />
              </div>

              {/* Link URL */}
              <div>
                <label className="block text-sm text-muted mb-1">Link URL</label>
                <Input
                  type="url"
                  value={form.linkUrl}
                  onChange={(e) => setForm(f => ({ ...f, linkUrl: e.target.value }))}
                  placeholder="Tıklanınca gidilecek adres"
                />
              </div>

              {/* Position & Device Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Pozisyon</label>
                  <Select
                    value={form.position}
                    onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))}
                  >
                    {Object.entries(positionLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Cihaz Türü</label>
                  <Select
                    value={form.deviceType}
                    onChange={(e) => setForm(f => ({ ...f, deviceType: e.target.value }))}
                  >
                    {Object.entries(deviceLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Display Order */}
              <div>
                <label className="block text-sm text-muted mb-1">Görüntüleme Sırası</label>
                <Input
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(e) => setForm(f => ({ ...f, displayOrder: Number(e.target.value) || 0 }))}
                />
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Başlangıç Tarihi</label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Bitiş Tarihi</label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              {/* Is Active */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                />
                <label htmlFor="isActive" className="text-sm text-muted">Aktif</label>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="secondary" type="button" onClick={closeModal}>
                  İptal
                </Button>
                <Button variant="primary" type="submit" disabled={saving}>
                  {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Oluştur'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
