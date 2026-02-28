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

interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface CarModel {
  id: string;
  name: string;
  slug: string;
  brand: {
    slug: string;
  };
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

const MATERIALS: { slug: string; label: string; labelEn: string }[] = [
  { slug: 'diecast', label: 'Diecast (Metal)', labelEn: 'Diecast (Metal)' },
  { slug: 'resin', label: 'Resin (Reçine)', labelEn: 'Resin' },
  { slug: 'composite', label: 'Composite (Kompozit)', labelEn: 'Composite' },
  { slug: 'plastic', label: 'Plastic (Plastik)', labelEn: 'Plastic' },
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
  const { isAuthenticated, isLoading: authLoading, user, limits, canCreateListing, getRemainingListings, refreshUser } = useAuthStore();
  const { t, locale } = useTranslation();
  const CONDITIONS = getConditions(locale);
  const OTHER_LABEL = getOtherLabel(locale);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listingLimits, setListingLimits] = useState<ListingLimits | null>(null);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const prevPathnameRef = useRef<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<CarModel[]>([]);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1950 + 1 }, (_, i) => currentYear - i); // 2025..1950

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    categoryId: '',
    condition: 'very_good' as string,
    brandId: '',
    carModelId: '',
    scale: '1:64',
    material: '' as string,
    year: '' as string | number,
    isTradeEnabled: false,
    isSet: false,
    quantity: '' as string | number,
    imageUrls: [] as string[],
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  // Store preview URLs separately (presigned URLs for display)
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

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
          
          // Restore preview URLs if available, otherwise fetch presigned URLs for keys
          if (parsed.imageUrls?.length > 0) {
            const restorePreviewUrls = async () => {
              const previewUrls: string[] = [];
              for (const key of parsed.imageUrls) {
                // If key is S3 key format (starts with dev/ or prod/), get presigned URL
                if (key && (key.includes('dev/') || key.includes('prod/'))) {
                  try {
                    // Extract bucket and key from full path (e.g., "dev/products/product-images/file.jpg")
                    const parts = key.split('/');
                    const bucket = parts[1] || 'products'; // Default to products
                    const keyPath = parts.slice(2).join('/');
                    const response = await api.get(`/storage/presigned/${bucket}/${keyPath}`);
                    previewUrls.push(response.data.url);
                  } catch (error) {
                    // If presigned URL fetch fails, use placeholder
                    previewUrls.push('https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim');
                  }
                } else {
                  // If it's already a URL, use it directly
                  previewUrls.push(key);
                }
              }
              setImagePreviewUrls(previewUrls);
            };
            restorePreviewUrls();
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to parse saved form data:', e);
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
    // Wait for auth to finish loading before checking authentication
    if (authLoading) {
      return;
    }

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
  }, [isAuthenticated, authLoading]);

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
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to update listing limits:', error);
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

  const fetchBrands = async () => {
    try {
      const response = await api.get('/brands');
      setBrands(response.data);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch brands:', error);
    }
  };

  const fetchModels = async (brandSlug: string) => {
    try {
      const response = await api.get(`/car-models?brand=${brandSlug}`);
      setModels(response.data);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch models:', error);
    }
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  useEffect(() => {
    if (formData.brandId) {
      const selectedBrand = brands.find(b => b.id === formData.brandId);
      if (selectedBrand) {
        fetchModels(selectedBrand.slug);
      }
    } else {
      setModels([]);
    }
  }, [formData.brandId, brands]);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      const cats = response.data.data || response.data || [];
      setCategories(cats);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch categories:', error);
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
    const remainingSlots = maxImages - currentCount;

    // Eğer yer yoksa sessizce çık (input zaten disabled olmalı)
    if (remainingSlots <= 0) return;

    // Sadece kalan slot kadar resim al, fazlasını sessizce yoksay
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    if (filesToUpload.length === 0) return;

    setUploadingImages(true);
    try {
      const response = await mediaApi.uploadProductImages(filesToUpload);

      // Extract keys for storage (to be saved to database)
      const uploadedKeys = response.data
        .map((result: any) => result.key)
        .filter(Boolean);
      
      // Extract presigned URLs for preview
      const uploadedPreviewUrls = response.data
        .map((result: any) => result.url || result.key)
        .filter(Boolean);

      setFormData({
        ...formData,
        imageUrls: [...formData.imageUrls, ...uploadedKeys],
      });
      setImagePreviewUrls([...imagePreviewUrls, ...uploadedPreviewUrls]);
      toast.success(`${uploadedKeys.length} resim başarıyla yüklendi`);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to upload images:', error);
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
    setImagePreviewUrls(imagePreviewUrls.filter((_, i) => i !== index));
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
        brandId: formData.brandId || undefined,
        carModelId: formData.carModelId || undefined,
        scale: formData.scale || undefined,
        material: formData.material || undefined,
        year: formData.year ? Number(formData.year) : undefined,
        isTradeEnabled: formData.isTradeEnabled,
        isPreorder: false,
        isSet: formData.isSet,
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
      if (process.env.NODE_ENV === 'development') console.error('Failed to create listing:', error);
      const msg = error.response?.data?.message ?? error.response?.data?.error ?? error.message;
      const fallback = locale === 'en' ? 'Failed to create listing' : 'İlan oluşturulamadı';
      toast.error(typeof msg === 'string' ? msg : fallback);
    } finally {
      setIsLoading(false);
    }
  };

  const flatCategories = filterCategoryDuplicates(flattenCategories(categories));

  // Show loading state while auth is being checked
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Redirect if not authenticated (this should be handled by useEffect, but just in case)
  if (!isAuthenticated) {
    return null; // useEffect will handle redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <Link
          href="/listings"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-orange-500 transition-colors mb-6 text-sm"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          İlanlara Dön
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Yeni İlan Oluştur</h1>
            <p className="text-gray-500 text-sm mt-1">
              Ürününüzü koleksiyoncularla buluşturun
            </p>
          </div>

          {/* Listing Limit Info */}
          {limitsLoading ? (
            <div className="mb-5 p-3 bg-gray-50 rounded animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            </div>
          ) : listingLimits && (
            <div className={`mb-5 p-3 rounded border text-sm ${listingLimits.isPremium
              ? 'bg-yellow-50 border-yellow-200'
              : listingLimits.canCreateListing
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
              }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium ${listingLimits.isPremium
                    ? 'text-yellow-800'
                    : listingLimits.canCreateListing ? 'text-green-800' : 'text-red-800'
                    }`}>
                    {listingLimits.maxListings === -1
                      ? `Mevcut İlan: ${listingLimits.currentCount} (Sınırsız)`
                      : `İlan Hakkı: ${listingLimits.currentCount} / ${listingLimits.maxListings}`
                    }
                  </p>
                  {listingLimits.remainingListings !== -1 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Kalan: {listingLimits.remainingListings}
                    </p>
                  )}
                </div>
                {!listingLimits.canCreateListing && (
                  <Link href="/pricing" className="btn-primary text-sm">
                    Premium'a Geç
                  </Link>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Section: Basic Info */}
            <div className="bg-white rounded border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Temel Bilgiler</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Başlık <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400 bg-white"
                    placeholder="Örn: Hot Wheels '69 Camaro Z28"
                    required
                    minLength={5}
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Açıklama
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400 bg-white"
                    placeholder="Ürün hakkında detaylı bilgi..."
                    rows={4}
                    maxLength={5000}
                  />
                </div>
              </div>
            </div>

            {/* Section: Product Details */}
            <div className="bg-white rounded border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Ürün Detayları</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ürün Tipi <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
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
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
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

            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Marka
                </label>
                <select
                  value={formData.brandId}
                  onChange={(e) => {
                    const newBrandId = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      brandId: newBrandId,
                      carModelId: ''
                    }));
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                >
                  <option value="">Marka Seçin</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <select
                  value={formData.carModelId}
                  onChange={(e) => setFormData({ ...formData, carModelId: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                  disabled={!formData.brandId || models.length === 0}
                >
                  <option value="">Model Seçin</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ölçek
                </label>
                <select
                  value={formData.scale}
                  onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                >
                  {SCALES.map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {locale === 'en' ? 'Material' : 'Malzeme'}
                </label>
                <select
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                >
                  <option value="">{locale === 'en' ? 'Select material' : 'Malzeme seçin'}</option>
                  {MATERIALS.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {locale === 'en' ? m.labelEn : m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {locale === 'en' ? 'Release year' : 'Çıkış yılı'}
                </label>
                <select
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                >
                  <option value="">{locale === 'en' ? 'Select year' : 'Yıl seçin'}</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            </div>

            {/* Section: Options */}
            <div className="bg-white rounded border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Seçenekler</h2>
            <div className={`flex items-center justify-between p-3 rounded border ${limits?.canTrade
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
                  className={`relative w-14 h-8 rounded-full transition-colors ${formData.isTradeEnabled ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${formData.isTradeEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                  />
                </button>
              ) : (
                <Link href="/pricing" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  Premium'a Geç →
                </Link>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
              <div>
                <label className="font-medium text-gray-900">{locale === 'en' ? 'Set / Bundle' : 'Set / Paket'}</label>
                <p className="text-sm text-gray-600">
                  {locale === 'en' ? 'Multiple models in one listing (e.g. 5-pack, garage set)' : 'Tek ilanda birden fazla model (örn. 5\'li paket, garaj seti)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isSet: !formData.isSet })}
                className={`relative w-14 h-8 rounded-full transition-colors ${formData.isSet ? 'bg-sky-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${formData.isSet ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            </div>

            {/* Section: Price & Quantity */}
            <div className="bg-white rounded border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Fiyatlandırma</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Fiyat (₺) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400 bg-white"
                    placeholder="0.00"
                    required
                    min={1}
                    max={9999999}
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Stok Miktarı
                  </label>
                  <input
                    type="number"
                    value={formData.quantity || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ ...formData, quantity: value === '' ? '' : value });
                    }}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400 bg-white"
                    placeholder={locale === 'en' ? 'Unlimited' : 'Sınırsız'}
                    min={1}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {locale === 'en' ? 'Leave empty for unlimited stock' : 'Boş bırakırsanız sınırsız stok'}
                  </p>
                </div>
              </div>
            </div>

            {/* Section: Images */}
            <div className="bg-white rounded border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Görseller</h2>
              <div className="space-y-3">
                {formData.imageUrls.length < (limits?.maxImagesPerListing || 5) ? (
                  <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-200 rounded cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
                    <PhotoIcon className="w-8 h-8 text-gray-400" />
                    <span className="text-sm text-gray-500 font-medium">
                      {locale === 'en' ? 'Click to upload images' : 'Görsel yüklemek için tıklayın'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formData.imageUrls.length} / {limits?.maxImagesPerListing || 5} {locale === 'en' ? 'uploaded' : 'yüklendi'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleFileUpload(e.target.files)}
                      disabled={uploadingImages}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="py-4 border border-green-200 bg-green-50 rounded text-green-700 text-sm text-center">
                    Maksimum görsel sayısına ulaştınız
                  </div>
                )}
                {uploadingImages && (
                  <p className="text-sm text-primary-600">Resimler yükleniyor...</p>
                )}
                {formData.imageUrls.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
                    {formData.imageUrls.map((key, index) => {
                      const previewUrl = imagePreviewUrls?.[index] || key;
                      return (
                        <div key={index} className="relative group aspect-square">
                          <img
                            src={previewUrl}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover rounded border border-gray-200"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeImageUrl(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 px-6 py-2.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-700 font-medium text-sm"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-6 py-2.5 bg-primary-500 text-white rounded hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
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
