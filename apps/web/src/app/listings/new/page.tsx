'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, PhotoIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { listingsApi, api, mediaApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

const getConditions = (locale: string) => [
  { value: 'new', label: locale === 'en' ? 'New' : 'Yeni' },
  { value: 'like_new', label: locale === 'en' ? 'Like New' : 'Sıfır Gibi' },
  { value: 'very_good', label: locale === 'en' ? 'Very Good' : 'Mükemmel' },
  { value: 'good', label: locale === 'en' ? 'Good' : 'İyi' },
  { value: 'fair', label: locale === 'en' ? 'Fair' : 'Orta' },
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
];

const getOtherLabel = (locale: string) => locale === 'en' ? 'Other' : 'Diğer';

const SCALES = [
  '1:18',
  '1:24',
  '1:32',
  '1:43',
  '1:64',
  '1:72',
  '1:87',
];

interface ListingLimits {
  currentCount: number;
  maxListings: number;
  canCreateListing: boolean;
  isPremium: boolean;
  membershipTier: string;
  remainingListings: number;
}

export default function NewListingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, limits, canCreateListing, getRemainingListings, refreshUser } = useAuthStore();
  const { t, locale } = useTranslation();
  const CONDITIONS = getConditions(locale);
  const OTHER_LABEL = getOtherLabel(locale);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listingLimits, setListingLimits] = useState<ListingLimits | null>(null);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const prevPathnameRef = useRef<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    categoryId: '',
    condition: 'very_good' as string,
    brand: '',
    scale: '1:64',
    isTradeEnabled: false,
    quantity: '' as string | number,
    imageUrls: [] as string[],
  });
  const [uploadingImages, setUploadingImages] = useState(false);

  // Load form data from localStorage on mount
  useEffect(() => {
    const savedFormData = localStorage.getItem('newListingFormData');
    if (savedFormData) {
      try {
        const parsed = JSON.parse(savedFormData);
        // Only restore if we have meaningful data
        if (parsed.title || parsed.description || parsed.price || parsed.quantity !== undefined || parsed.imageUrls?.length > 0) {
          setFormData(prev => ({
            ...prev,
            ...parsed,
            // Ensure quantity is properly handled (empty string for unlimited, number as string)
            quantity: parsed.quantity !== undefined && parsed.quantity !== null && parsed.quantity !== '' 
              ? parsed.quantity.toString() 
              : '',
          }));
        }
      } catch (e) {
        console.error('Failed to parse saved form data:', e);
      }
    }
  }, []);

  // Save form data to localStorage whenever it changes (debounced)
  useEffect(() => {
    // Always save form data, including quantity (even if empty string for unlimited stock)
    const timeoutId = setTimeout(() => {
      // Ensure quantity is always saved as string (empty string = unlimited)
      const dataToSave = {
        ...formData,
        quantity: formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== '' 
          ? String(formData.quantity) 
          : '',
      };
      localStorage.setItem('newListingFormData', JSON.stringify(dataToSave));
    }, 300); // Debounce to avoid too many writes
    
    return () => clearTimeout(timeoutId);
  }, [formData]);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error(locale === 'en' ? 'Please login to create a listing' : 'İlan oluşturmak için giriş yapmalısınız');
      router.push('/login?redirect=/listings/new');
      return;
    }
    fetchCategories();
    // Refresh user data first, then update limits
    refreshUser().then(() => {
      updateListingLimits();
    });
  }, [isAuthenticated]);

  // Update limits whenever user or limits change
  useEffect(() => {
    if (user && limits) {
      updateListingLimits();
    }
  }, [user, limits]);

  // Refresh listing limits when pathname changes (e.g., returning from edit/delete page)
  useEffect(() => {
    if (prevPathnameRef.current !== null && prevPathnameRef.current !== pathname && pathname === '/listings/new' && user) {
      // Page was navigated to, refresh user data and limits
      refreshUser().then(() => {
        updateListingLimits();
      });
    }
    prevPathnameRef.current = pathname;
  }, [pathname, user]);

  // Refresh listing limits when page becomes visible (e.g., after returning from deleting a listing)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        refreshUser().then(() => {
          updateListingLimits();
        });
      }
    };

    const handleFocus = () => {
      if (user) {
        refreshUser().then(() => {
          updateListingLimits();
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  const updateListingLimits = async () => {
    setLimitsLoading(true);
    try {
      // Fetch real listing stats from API with cache busting
      const response = await api.get('/products/my/stats', {
        params: { _t: Date.now() }
      });
      const stats = response.data;
      
      const tierName = stats.limits?.tierName || 'Free';
      const tierType = stats.limits?.tierType || 'free';
      const isPremium = tierType === 'premium' || tierType === 'business';
      const maxListings = stats.summary?.max || 10;
      const currentCount = stats.summary?.used || 0;
      const remaining = stats.summary?.remaining || 0;
      const canCreate = stats.summary?.canCreate ?? true;

      setListingLimits({
        currentCount,
        maxListings,
        canCreateListing: canCreate,
        isPremium,
        membershipTier: tierName,
        remainingListings: remaining,
      });
    } catch (error) {
      console.error('Failed to update listing limits:', error);
      // Fallback to auth store data
      const membershipTier = user?.membershipTier || 'free';
      const currentCount = user?.listingCount || 0;
      const maxListings = limits?.maxListings ?? 10;
      const isPremium = membershipTier === 'premium' || membershipTier === 'business';
      const isUnlimited = maxListings === -1;

      setListingLimits({
        currentCount,
        maxListings: isUnlimited ? -1 : maxListings,
        canCreateListing: isUnlimited || currentCount < maxListings,
        isPremium,
        membershipTier,
        remainingListings: isUnlimited ? -1 : maxListings - currentCount,
      });
    } finally {
      setLimitsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      const cats = response.data.data || response.data || [];
      setCategories(cats);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      toast.error(locale === 'en' ? 'Failed to load categories' : 'Kategoriler yüklenemedi');
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

  // Filter out brand and scale categories since we have separate fields for those
  const filterCategoryDuplicates = (cats: Category[]): Category[] => {
    // Brand names to exclude from categories (these are in the Brand dropdown)
    const brandSlugs = ['hot-wheels', 'hot-wheels-premium', 'hot-wheels-rlc', 'matchbox', 'tomica', 'tomica-limited-vintage', 'majorette', 'm2-machines', 'greenlight', 'johnny-lightning'];
    // Scale slugs to exclude (these are in the Scale dropdown)
    const scaleSlugs = ['scale-118', 'scale-124', 'scale-143', 'scale-164'];
    
    return cats.filter(cat => {
      const slug = cat.slug.toLowerCase();
      // Keep if not a brand or scale category
      return !brandSlugs.includes(slug) && !scaleSlugs.includes(slug);
    });
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const maxImages = limits?.maxImagesPerListing || 5;
    const currentCount = formData.imageUrls.length;

    if (currentCount + files.length > maxImages) {
      toast.error(`En fazla ${maxImages} resim yükleyebilirsiniz`);
      return;
    }

    setUploadingImages(true);
    try {
      const fileArray = Array.from(files);
      const response = await mediaApi.uploadProductImages(fileArray);
      
      const uploadedUrls = response.data.map((result: any) => result.url);
      setFormData({
        ...formData,
        imageUrls: [...formData.imageUrls, ...uploadedUrls],
      });
      toast.success(`${uploadedUrls.length} resim başarıyla yüklendi`);
    } catch (error: any) {
      console.error('Failed to upload images:', error);
      toast.error(error.response?.data?.message || 'Resim yükleme başarısız');
    } finally {
      setUploadingImages(false);
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
      toast.error(locale === 'en' ? 'Please fill in all required fields' : 'Lütfen tüm zorunlu alanları doldurun');
      return;
    }

    if (isNaN(Number(formData.price)) || Number(formData.price) < 1) {
      toast.error(locale === 'en' ? 'Please enter a valid price' : 'Geçerli bir fiyat giriniz');
      return;
    }

    // Check listing limit
    if (listingLimits && !listingLimits.canCreateListing) {
      toast.error(`İlan limitinize ulaştınız (${listingLimits.currentCount}/${listingLimits.maxListings}). Üyeliğinizi yükselterek daha fazla ilan oluşturabilirsiniz.`);
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
        quantity: formData.quantity ? Number(formData.quantity) : undefined, // undefined = unlimited stock
        imageUrls: formData.imageUrls.length > 0 ? formData.imageUrls : undefined,
      };

      await listingsApi.create(payload as any);
      toast.success(locale === 'en' ? 'Your listing has been created! Pending approval.' : 'İlanınız oluşturuldu! Onay bekliyor.');
      
      // Clear saved form data after successful submission
      localStorage.removeItem('newListingFormData');
      
      // Refresh user data and listing limits to update the count
      await refreshUser();
      await updateListingLimits();
      
      router.push('/profile/listings?status=pending');
    } catch (error: any) {
      console.error('Failed to create listing:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to create listing' : 'İlan oluşturulamadı'));
    } finally {
      setIsLoading(false);
    }
  };

  const flatCategories = filterCategoryDuplicates(flattenCategories(categories));

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/listings"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          İlanlara Dön
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm p-6 md:p-8"
        >
          <h1 className="text-3xl font-bold mb-2">Yeni İlan Oluştur</h1>
          <p className="text-gray-600 mb-4">
            Ürününüzü koleksiyoncularla buluşturun. İlk ilanınızı oluşturduğunuzda otomatik olarak satıcı hesabınız aktifleşir.
          </p>

          {/* Listing Limit Info */}
          {limitsLoading ? (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            </div>
          ) : listingLimits && (
            <div className={`mb-6 p-4 rounded-xl border ${
              listingLimits.isPremium 
                ? 'bg-yellow-50 border-yellow-200' 
                : listingLimits.canCreateListing 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium ${
                    listingLimits.isPremium 
                      ? 'text-yellow-800' 
                      : listingLimits.canCreateListing ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {listingLimits.maxListings === -1 
                      ? `Mevcut İlan: ${listingLimits.currentCount} (Sınırsız)`
                      : `İlan Hakkı: ${listingLimits.currentCount} / ${listingLimits.maxListings}`
                    }
                  </p>
                  <p className={`text-sm ${
                    listingLimits.isPremium 
                      ? 'text-yellow-600' 
                      : listingLimits.canCreateListing ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {listingLimits.membershipTier} üyelik
                    {listingLimits.isPremium && ' ⭐'}
                  </p>
                  {listingLimits.remainingListings !== -1 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Kalan ilan hakkı: {listingLimits.remainingListings}
                    </p>
                  )}
                </div>
                {!listingLimits.canCreateListing && (
                  <Link href="/pricing" className="btn-primary text-sm">
                    Premium'a Geç
                  </Link>
                )}
                {listingLimits.canCreateListing && !listingLimits.isPremium && listingLimits.maxListings !== -1 && listingLimits.remainingListings <= 2 && (
                  <Link href="/pricing" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                    Daha fazla ilan için →
                  </Link>
                )}
              </div>
            </div>
          )}

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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ürün Tipi <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Ürününüzün genel kategorisi (Vintage, Limited Edition, vb.)</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ürün Durumu <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Ürünün fiziksel kondisyonu</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Marka
                </label>
                <p className="text-xs text-gray-500 mb-2">Hot Wheels, Matchbox, Tomica vb.</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ölçek
                </label>
                <p className="text-xs text-gray-500 mb-2">1:64, 1:43, 1:18 vb.</p>
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
                    ? (locale === 'en' ? 'Also makes this product available for trade' : 'Bu ürünü takas için de açık tutar')
                    : (locale === 'en' ? 'Trade feature requires Premium membership' : 'Takas özelliği Premium üyelik gerektirir')}
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

            {/* Price & Quantity */}
            <div className="grid md:grid-cols-2 gap-6">
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stok Miktarı
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {locale === 'en' 
                    ? 'Leave empty for unlimited stock' 
                    : 'Boş bırakırsanız sınırsız stok olur'}
                </p>
                <input
                  type="number"
                  value={formData.quantity || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Save as string, empty string means unlimited stock
                    setFormData({ ...formData, quantity: value === '' ? '' : value });
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-500 bg-white"
                  placeholder={locale === 'en' ? 'Unlimited' : 'Sınırsız'}
                  min={1}
                />
              </div>
            </div>

            {/* Images */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ürün Görselleri (En fazla {limits?.maxImagesPerListing || 5})
              </label>
              <div className="space-y-3">
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileUpload(e.target.files)}
                    disabled={uploadingImages || formData.imageUrls.length >= (limits?.maxImagesPerListing || 5)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  {uploadingImages && (
                    <p className="text-sm text-primary-600 mt-2">Resimler yükleniyor...</p>
                  )}
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
              <p className="text-sm text-gray-500 mt-2">
                {formData.imageUrls.length} / {limits?.maxImagesPerListing || 5} resim yüklendi
              </p>
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
                {isLoading ? (locale === 'en' ? 'Creating...' : 'Oluşturuluyor...') : (locale === 'en' ? 'Create Listing' : 'İlanı Oluştur')}
              </button>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
