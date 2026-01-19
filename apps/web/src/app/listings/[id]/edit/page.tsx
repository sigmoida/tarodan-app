'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { listingsApi, api } from '@/lib/api';
import {
  ArrowLeftIcon,
  PhotoIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface ProductImage {
  id: string;
  url: string;
  sortOrder: number;
}

interface ProductData {
  id: string;
  title: string;
  description: string;
  price: number;
  condition: string;
  categoryId: string;
  isTradeEnabled: boolean;
  status: string;
  images: ProductImage[];
}

const CONDITIONS = [
  { value: 'new', label: 'Sıfır / Yeni' },
  { value: 'like_new', label: 'Yeni Gibi' },
  { value: 'good', label: 'İyi' },
  { value: 'fair', label: 'Orta' },
  { value: 'poor', label: 'Kötü (Koleksiyon için)' },
];

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, user } = useAuthStore();
  
  // Free üyeler takas yapamaz
  const canTrade = user?.membershipTier !== 'free';
  
  const productId = params?.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [product, setProduct] = useState<ProductData | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    condition: 'new',
    categoryId: '',
    isTradeEnabled: false,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadData();
  }, [isAuthenticated, productId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [productRes, categoriesRes] = await Promise.all([
        listingsApi.getById(productId),
        api.get('/categories'),
      ]);
      
      const productData = productRes.data;
      
      // Verify ownership
      if (productData.seller?.id !== user?.id && productData.sellerId !== user?.id) {
        toast.error('Bu ilanı düzenleme yetkiniz yok');
        router.push('/profile/listings');
        return;
      }
      
      setProduct(productData);
      setFormData({
        title: productData.title || '',
        description: productData.description || '',
        price: String(productData.price || ''),
        condition: productData.condition || 'new',
        categoryId: productData.categoryId || productData.category?.id || '',
        isTradeEnabled: productData.isTradeEnabled || false,
      });
      
      setCategories(categoriesRes.data.data || categoriesRes.data || []);
    } catch (error: any) {
      console.error('Load error:', error);
      toast.error('İlan yüklenemedi');
      router.push('/profile/listings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error('Başlık zorunludur');
      return;
    }
    if (!formData.price || Number(formData.price) <= 0) {
      toast.error('Geçerli bir fiyat girin');
      return;
    }
    
    setSaving(true);
    try {
      await listingsApi.update(productId, {
        title: formData.title.trim(),
        description: formData.description.trim(),
        price: Number(formData.price),
        condition: formData.condition,
        categoryId: formData.categoryId || undefined,
        isTradeEnabled: formData.isTradeEnabled,
      });
      
      toast.success('İlan güncellendi!');
      router.push('/profile/listings');
    } catch (error: any) {
      console.error('Update error:', error);
      toast.error(error.response?.data?.message || 'İlan güncellenemedi');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">İlan bulunamadı</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/profile/listings" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">İlanı Düzenle</h1>
            <p className="text-sm text-gray-500">#{product.id.slice(0, 8)}</p>
          </div>
        </div>

        {/* Status Badge */}
        {product.status === 'pending' && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <p className="text-yellow-800">
              ⏳ Bu ilan henüz onay bekliyor. Onaylandıktan sonra yayınlanacak.
            </p>
          </div>
        )}

        {/* Current Images */}
        {product.images && product.images.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Mevcut Görseller</h2>
            <div className="flex flex-wrap gap-4">
              {product.images.map((img, index) => (
                <div key={img.id || index} className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100">
                  <Image
                    src={img.url}
                    alt={`Görsel ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              * Görsel ekleme/silme özelliği yakında eklenecek
            </p>
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              İlan Başlığı *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Örn: Hot Wheels 1967 Mustang"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Açıklama
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Ürün hakkında detaylı bilgi verin..."
              maxLength={5000}
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fiyat (₺) *
            </label>
            <input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Kategori
            </label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Kategori Seçin</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ürün Durumu
            </label>
            <select
              value={formData.condition}
              onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Trade Enabled */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isTradeEnabled"
                checked={formData.isTradeEnabled}
                onChange={(e) => {
                  if (!canTrade && e.target.checked) {
                    toast.error('Takas özelliği için Premium üyelik gereklidir');
                    return;
                  }
                  setFormData({ ...formData, isTradeEnabled: e.target.checked });
                }}
                disabled={!canTrade}
                className={`w-5 h-5 text-primary-500 border-gray-300 rounded focus:ring-primary-500 ${!canTrade ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <label htmlFor="isTradeEnabled" className={`text-sm ${!canTrade ? 'text-gray-400' : 'text-gray-700'}`}>
                Takas tekliflerine açık
              </label>
            </div>
            {!canTrade && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                <span>⚠️</span>
                <span>Takas özelliği Premium üyelik gerektirir.</span>
                <Link href="/membership" className="text-primary-500 hover:underline font-medium">
                  Üyeliğini Yükselt
                </Link>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Link
              href="/profile/listings"
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors text-center"
            >
              İptal
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
