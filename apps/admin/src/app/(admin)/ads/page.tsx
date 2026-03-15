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
      const res = await adminApi.uploadAdImage(file);
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
    if (!confirm('Bu reklamı silmek istediğinize emin misiniz?')) return;
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

  // Filter ads
  const filteredAds = ads.filter(ad => {
    if (filterPosition && ad.position !== filterPosition) return false;
    if (filterDevice && ad.deviceType !== filterDevice) return false;
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
            <h1 className="text-2xl font-bold text-gray-900">Reklam Yönetimi</h1>
            <p className="text-sm text-gray-500 mt-1">IAB standartlarına uygun reklam yönetimi</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-gray-900 hover:bg-primary-600 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Yeni Reklam
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <MegaphoneIcon className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Toplam Reklam</p>
                <p className="text-xl font-bold text-gray-900">{ads.length}</p>
                <p className="text-xs text-green-700">{activeAds} aktif</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-100">
                <CursorArrowRaysIcon className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Toplam Tıklama</p>
                <p className="text-xl font-bold text-gray-900">{totalClicks.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <EyeIcon className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Görüntülenme</p>
                <p className="text-xl font-bold text-gray-900">{totalImpressions.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <ChartBarIcon className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Ortalama CTR</p>
                <p className="text-xl font-bold text-gray-900">{avgCTR}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-900 text-sm"
          >
            <option value="">Tüm Pozisyonlar</option>
            {Object.entries(positionLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filterDevice}
            onChange={(e) => setFilterDevice(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-900 text-sm"
          >
            <option value="">Tüm Cihazlar</option>
            {Object.entries(deviceLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Yükleniyor...</div>
          ) : filteredAds.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <MegaphoneIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Henüz reklam yok. Yeni reklam ekleyin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Önizleme</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Başlık</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Boyut</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Pozisyon</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Cihaz</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">Durum</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">İstatistik</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAds.map((ad) => (
                    <tr key={ad.id} className="hover:bg-gray-100/30">
                      <td className="py-3 px-4">
                        {ad.imageUrl ? (
                          <div className="relative w-20 h-12 rounded overflow-hidden bg-gray-100">
                            <Image
                              src={ad.imageUrl}
                              alt={ad.title}
                              fill
                              className="object-contain"
                              sizes="80px"
                            />
                          </div>
                        ) : (
                          <span className="text-gray-500 text-sm">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-gray-900 font-medium">{ad.title}</div>
                        {ad.iabCompliant ? (
                          <span className="text-xs text-green-700 flex items-center gap-1">
                            <CheckCircleIcon className="h-3 w-3" />
                            IAB: {ad.iabSize}
                          </span>
                        ) : ad.width && ad.height ? (
                          <span className="text-xs text-yellow-700 flex items-center gap-1">
                            <ExclamationTriangleIcon className="h-3 w-3" />
                            Non-IAB
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm">
                        {ad.width && ad.height ? `${ad.width}x${ad.height}` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {positionLabels[ad.position] || ad.position}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1 text-gray-600 text-sm">
                          <DeviceIcon type={ad.deviceType} />
                          {deviceLabels[ad.deviceType] || ad.deviceType}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleActive(ad)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            ad.isActive
                              ? 'bg-green-500/20 text-green-700'
                              : 'bg-gray-500/20 text-gray-500'
                          }`}
                        >
                          {ad.isActive ? 'Aktif' : 'Pasif'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="text-gray-600">{ad.clickCount} tıklama</div>
                        <div className="text-gray-500">{ad.impressionCount} görüntü</div>
                        <div className="text-primary-400">{ad.ctr}% CTR</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openEdit(ad)}
                          className="p-2 text-gray-500 hover:text-primary-600 transition-colors"
                          title="Düzenle"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(ad.id)}
                          className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                          title="Sil"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-2xl shadow-xl my-8">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Reklam Düzenle' : 'Yeni Reklam'}
              </h2>
              <p className="text-sm text-gray-500">IAB standartlarına uygun reklam oluşturun</p>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Başlık *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900"
                  placeholder="Reklam başlığı"
                />
              </div>

              {/* Drag & Drop Image Upload */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Reklam Görseli</label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    dragActive 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-gray-300 hover:border-gray-300'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {uploadingImage ? (
                    <div className="text-gray-500">
                      <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-2" />
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
                        <span className="text-gray-500">
                          {imagePreview.width} x {imagePreview.height} px
                        </span>
                        {form.width && form.height && (
                          IAB_SIZES.some(s => s.width === form.width && s.height === form.height) ? (
                            <span className="flex items-center gap-1 text-green-700">
                              <CheckCircleIcon className="h-4 w-4" />
                              IAB Uyumlu
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-yellow-700">
                              <ExclamationTriangleIcon className="h-4 w-4" />
                              Non-IAB
                            </span>
                          )
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, imageUrl: '', width: 0, height: 0 }));
                          setImagePreview(null);
                          setIabWarning(null);
                        }}
                        className="text-sm text-red-600 hover:text-red-300"
                      >
                        Görseli Kaldır
                      </button>
                    </div>
                  ) : (
                    <div>
                      <CloudArrowUpIcon className="h-10 w-10 mx-auto text-gray-500 mb-2" />
                      <p className="text-gray-500 mb-2">
                        Görseli sürükleyip bırakın veya
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-lg bg-primary-500 text-gray-900 hover:bg-primary-600 transition-colors text-sm"
                      >
                        Dosya Seç
                      </button>
                      <p className="text-xs text-gray-500 mt-2">
                        JPG, PNG, WebP • Max 2MB
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual URL input */}
                <div className="mt-2">
                  <input
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
                    className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900 text-sm"
                    placeholder="veya görsel URL'si yapıştırın"
                  />
                </div>

                {/* IAB Warning */}
                {iabWarning && (
                  <div className="mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-start gap-2">
                      <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-yellow-700">{iabWarning}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* IAB Size Presets */}
              <div>
                <label className="block text-sm text-gray-500 mb-2">
                  <span className="flex items-center gap-1">
                    <InformationCircleIcon className="h-4 w-4" />
                    IAB Standart Boyutları
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {IAB_SIZES.slice(0, 6).map((size) => (
                    <button
                      key={`${size.width}x${size.height}`}
                      type="button"
                      onClick={() => applyIABSize(size)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${
                        form.width === size.width && form.height === size.height
                          ? 'border-primary-500 bg-primary-100 text-primary-400'
                          : 'border-gray-300 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {size.name} ({size.width}x{size.height})
                    </button>
                  ))}
                </div>
              </div>

              {/* Alt Text */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Alt Metin (Erişilebilirlik)</label>
                <input
                  type="text"
                  value={form.altText}
                  onChange={(e) => setForm(f => ({ ...f, altText: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900"
                  placeholder="Görsel açıklaması (görme engelli kullanıcılar için)"
                />
              </div>

              {/* Link URL */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Link URL</label>
                <input
                  type="url"
                  value={form.linkUrl}
                  onChange={(e) => setForm(f => ({ ...f, linkUrl: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900"
                  placeholder="Tıklanınca gidilecek adres"
                />
              </div>

              {/* Position & Device Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Pozisyon</label>
                  <select
                    value={form.position}
                    onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900"
                  >
                    {Object.entries(positionLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Cihaz Türü</label>
                  <select
                    value={form.deviceType}
                    onChange={(e) => setForm(f => ({ ...f, deviceType: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900"
                  >
                    {Object.entries(deviceLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Display Order */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Görüntüleme Sırası</label>
                <input
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(e) => setForm(f => ({ ...f, displayOrder: Number(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900"
                />
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-900"
                  />
                </div>
              </div>

              {/* Is Active */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="rounded border-gray-300 bg-gray-100 text-primary-600"
                />
                <label htmlFor="isActive" className="text-sm text-gray-600">Aktif</label>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-primary-500 text-gray-900 hover:bg-primary-600 disabled:opacity-50"
                >
                  {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
