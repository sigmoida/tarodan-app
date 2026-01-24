'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { listingsApi, api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

const CONDITIONS = [
  { value: 'new', label: 'Yeni' },
  { value: 'like_new', label: 'Sıfır Gibi' },
  { value: 'very_good', label: 'Mükemmel' },
  { value: 'good', label: 'İyi' },
  { value: 'fair', label: 'Orta' },
];

const BRANDS = [
  'Hot Wheels',
  'Matchbox',
  'Majorette',
  'Tomica',
  'Minichamps',
  'AutoArt',
  'Maisto',
  'Bburago',
  'Welly',
  'Diğer',
];

const SCALES = [
  '1:18',
  '1:24',
  '1:32',
  '1:43',
  '1:64',
  '1:72',
  '1:87',
  'Diğer',
];

export default function EditListingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { isAuthenticated, user, limits } = useAuthStore();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    categoryId: '',
    condition: 'very_good' as string,
    brand: '',
    scale: '1:64',
    isTradeEnabled: false,
    imageUrls: [] as string[],
    status: 'active' as string,
  });
  const [newImageUrl, setNewImageUrl] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error('İlan düzenlemek için giriş yapmalısınız');
      router.push('/login');
      return;
    }
    fetchListing();
    fetchCategories();
  }, [id, isAuthenticated]);

  const fetchListing = async () => {
    setIsFetching(true);
    try {
      const response = await listingsApi.getOne(id);
      const listing = response.data.product || response.data;
      
      // Check if user is the owner
      if (listing.sellerId !== user?.id && listing.seller?.id !== user?.id) {
        toast.error('Bu ilanı düzenleme yetkiniz yok');
        router.push(`/listings/${id}`);
        return;
      }

      setFormData({
        title: listing.title || '',
        description: listing.description || '',
        price: listing.price?.toString() || '',
        categoryId: listing.categoryId || listing.category?.id || '',
        condition: listing.condition || 'very_good',
        brand: listing.brand || '',
        scale: listing.scale || '1:64',
        isTradeEnabled: listing.isTradeEnabled || listing.trade_available || false,
        imageUrls: listing.images?.map((img: any) => img.url || img) || [],
        status: listing.status || 'active',
      });
    } catch (error: any) {
      console.error('Failed to fetch listing:', error);
      toast.error(error.response?.data?.message || 'İlan yüklenemedi');
      router.push(`/listings/${id}`);
    } finally {
      setIsFetching(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      const cats = response.data.data || response.data || [];
      setCategories(cats);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const flattenCategories = (cats: Category[]): Category[] => {
    const result: Category[] = [];
    cats.forEach(cat => {
      result.push(cat);
      if (cat.children && cat.children.length > 0) {
        result.push(...flattenCategories(cat.children));
      }
    });
    return result;
  };

  const addImageUrl = () => {
    const maxImages = limits?.maxImagesPerListing || 10;
    if (newImageUrl.trim() && formData.imageUrls.length < maxImages) {
      setFormData({
        ...formData,
        imageUrls: [...formData.imageUrls, newImageUrl.trim()],
      });
      setNewImageUrl('');
    }
  };

  const removeImageUrl = (index: number) => {
    setFormData({
      ...formData,
      imageUrls: formData.imageUrls.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.price || !formData.categoryId) {
      toast.error('Lütfen tüm zorunlu alanları doldurun');
      return;
    }

    if (isNaN(Number(formData.price)) || Number(formData.price) < 1) {
      toast.error('Geçerli bir fiyat giriniz');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        title: formData.title,
        description: formData.description || undefined,
        price: Number(formData.price),
        categoryId: formData.categoryId,
        condition: formData.condition,
        brand: formData.brand || undefined,
        scale: formData.scale || undefined,
        isTradeEnabled: formData.isTradeEnabled,
        imageUrls: formData.imageUrls.length > 0 ? formData.imageUrls : undefined,
        status: formData.status,
      };

      await listingsApi.update(id, payload as any);
      toast.success('İlanınız güncellendi!');
      router.push(`/listings/${id}`);
    } catch (error: any) {
      console.error('Failed to update listing:', error);
      toast.error(error.response?.data?.message || 'İlan güncellenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setIsLoading(true);
    try {
      await listingsApi.update(id, { status: 'inactive' } as any);
      setFormData({ ...formData, status: 'inactive' });
      toast.success('İlan pasife alındı');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivate = async () => {
    setIsLoading(true);
    try {
      await listingsApi.update(id, { status: 'active' } as any);
      setFormData({ ...formData, status: 'active' });
      toast.success('İlan aktif edildi');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await api.delete(`/products/${id}`);
      toast.success('İlan silindi');
      router.push('/profile/listings');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İlan silinemedi');
    } finally {
      setIsLoading(false);
      setShowDeleteModal(false);
    }
  };

  const flatCategories = flattenCategories(categories);

  if (isFetching) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`/listings/${id}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          İlana Dön
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm p-6 md:p-8"
        >
          <h1 className="text-3xl font-bold mb-2">İlanı Düzenle</h1>
          <p className="text-gray-600 mb-6">
            İlan bilgilerinizi güncelleyin.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Başlık <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-500 bg-white"
                placeholder="Örn: Hot Wheels '69 Camaro Z28"
                required
                minLength={5}
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
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-500 bg-white"
                placeholder="Ürün hakkında detaylı bilgi..."
                rows={5}
                maxLength={5000}
              />
            </div>

            {/* Category & Condition */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kategori <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                  required
                >
                  <option value="">Kategori Seçin</option>
                  {flatCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Durum <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                  required
                >
                  {CONDITIONS.map((cond) => (
                    <option key={cond.value} value={cond.value}>
                      {cond.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Brand & Scale */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Marka
                </label>
                <select
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                >
                  <option value="">Marka Seçin</option>
                  {BRANDS.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ölçek
                </label>
                <select
                  value={formData.scale}
                  onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                >
                  {SCALES.map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Trade Toggle */}
            <div className={`flex items-center justify-between p-4 rounded-xl border ${
              limits?.canTrade 
                ? 'bg-green-50 border-green-200' 
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div>
                <label className="font-medium text-gray-900">Takas Aktif</label>
                <p className="text-sm text-gray-600">
                  {limits?.canTrade 
                    ? 'Bu ürünü takas için de açık tutar' 
                    : 'Takas özelliği Premium üyelik gerektirir'}
                </p>
              </div>
              {limits?.canTrade ? (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isTradeEnabled: !formData.isTradeEnabled })}
                  className={`relative w-14 h-8 rounded-full transition-colors ${
                    formData.isTradeEnabled ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                      formData.isTradeEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              ) : (
                <Link href="/pricing" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  Premium'a Geç →
                </Link>
              )}
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fiyat (₺) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-500 bg-white"
                placeholder="0.00"
                required
                min={1}
                max={9999999}
                step="0.01"
              />
            </div>

            {/* Images */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ürün Görselleri (En fazla {limits?.maxImagesPerListing || 10})
              </label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-500 bg-white"
                    placeholder="https://example.com/image.jpg"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addImageUrl();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={addImageUrl}
                    disabled={formData.imageUrls.length >= (limits?.maxImagesPerListing || 10)}
                    className="px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Ekle
                  </button>
                </div>

                {formData.imageUrls.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {formData.imageUrls.map((url, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={url}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg border border-gray-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => removeImageUrl(index)}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700 font-medium"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Güncelleniyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </div>

            {/* Status Actions */}
            <div className="border-t border-gray-200 pt-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">İlan Durumu</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                {formData.status === 'active' ? (
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                  >
                    🔒 İlanı Pasife Al
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleActivate}
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                  >
                    ✅ İlanı Aktif Et
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={isLoading}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                >
                  🗑️ İlanı Sil
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {formData.status === 'active' 
                  ? 'Pasife alınan ilanlar listelemede görünmez ama silinmez.' 
                  : 'Aktif ilanlar listelemede görünür.'}
              </p>
            </div>
          </form>
        </motion.div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">İlanı Sil</h3>
              <p className="text-gray-600 mb-6">
                Bu ilanı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve ilan kalıcı olarak silinir.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium"
                >
                  İptal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:bg-gray-300 font-medium"
                >
                  {isLoading ? 'Siliniyor...' : 'Evet, Sil'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
