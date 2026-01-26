'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { listingsApi, api, userApi, mediaApi } from '@/lib/api';
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
  const { isAuthenticated, user, limits, refreshUserData } = useAuthStore();
  
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
    quantity: '' as string | number,
    imageUrls: [] as string[],
    status: 'active' as string,
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Load saved form data from localStorage on mount (before fetching from API)
  // This runs FIRST, before fetchListing
  useEffect(() => {
    if (!id) return;
    
    // Use a small delay to ensure localStorage is ready after page navigation
    const timer = setTimeout(() => {
      const storageKey = `editListingFormData_${id}`;
      const savedFormData = localStorage.getItem(storageKey);
      console.log('[EDIT] useEffect [id] - Loading from localStorage - key:', storageKey);
      console.log('[EDIT] useEffect [id] - localStorage data exists:', !!savedFormData);
      console.log('[EDIT] useEffect [id] - localStorage data length:', savedFormData?.length || 0);
      
      if (savedFormData) {
        try {
          const parsed = JSON.parse(savedFormData);
          console.log('[EDIT] useEffect [id] - Parsed localStorage data:', parsed);
          console.log('[EDIT] useEffect [id] - Quantity from localStorage:', parsed.quantity, 'type:', typeof parsed.quantity);
          
          // Always restore if we have data, even if quantity is empty string
          const quantityValue = parsed.quantity !== undefined && parsed.quantity !== null && parsed.quantity !== '' 
            ? String(parsed.quantity) 
            : '';
          console.log('[EDIT] useEffect [id] - Setting quantity from localStorage to:', quantityValue);
          
          setFormData(prev => {
            const newData = {
              ...prev,
              ...parsed,
              quantity: quantityValue,
            };
            console.log('[EDIT] useEffect [id] - Setting formData to:', newData);
            return newData;
          });
        } catch (e) {
          console.error('[EDIT] useEffect [id] - Failed to parse saved form data:', e);
        }
      } else {
        console.log('[EDIT] useEffect [id] - No saved data in localStorage');
        // Also check all localStorage keys to debug
        console.log('[EDIT] useEffect [id] - All localStorage keys:', Object.keys(localStorage).filter(k => k.includes('editListing')));
      }
    }, 100); // Small delay to ensure localStorage is ready
    
    return () => clearTimeout(timer);
  }, [id]);

  // Save form data to localStorage whenever it changes (debounced)
  useEffect(() => {
    if (!id) return;
    
    // Always save form data, including quantity (even if empty string for unlimited stock)
    const timeoutId = setTimeout(() => {
      const storageKey = `editListingFormData_${id}`;
      
      // Ensure quantity is always saved as string (empty string = unlimited)
      const quantityToSave = formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== '' 
        ? String(formData.quantity) 
        : '';
      
      console.log('[EDIT] Save useEffect - quantity:', formData.quantity, '->', quantityToSave, 'type:', typeof formData.quantity);
      console.log('[EDIT] Save useEffect - Full formData:', formData);
      
      const dataToSave = {
        ...formData,
        quantity: quantityToSave,
      };
      
      console.log('[EDIT] Save useEffect - Data to save:', dataToSave);
      console.log('[EDIT] Save useEffect - Storage key:', storageKey);
      
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      
      // Verify it was saved
      const verify = localStorage.getItem(storageKey);
      console.log('[EDIT] Save useEffect - Verification - saved data exists:', !!verify);
      console.log('[EDIT] Save useEffect - Verification - saved data:', verify);
      if (verify) {
        const parsed = JSON.parse(verify);
        console.log('[EDIT] Save useEffect - Verification - parsed quantity:', parsed.quantity);
      }
    }, 300); // Debounce to avoid too many writes
    
    return () => clearTimeout(timeoutId);
  }, [formData, id]);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error('İlan düzenlemek için giriş yapmalısınız');
      router.push('/login');
      return;
    }
    
    // CRITICAL: Load from localStorage FIRST, synchronously, before fetchListing
    // This ensures user's edits are preserved even if fetchListing runs immediately
    const storageKey = `editListingFormData_${id}`;
    const savedFormData = localStorage.getItem(storageKey);
    console.log('[EDIT] Main useEffect - Loading from localStorage BEFORE fetchListing:', storageKey, 'exists:', !!savedFormData);
    
    if (savedFormData) {
      try {
        const parsed = JSON.parse(savedFormData);
        console.log('[EDIT] Main useEffect - Found saved data, setting formData immediately');
        const quantityValue = parsed.quantity !== undefined && parsed.quantity !== null && parsed.quantity !== '' 
          ? String(parsed.quantity) 
          : '';
        console.log('[EDIT] Main useEffect - Setting quantity to:', quantityValue);
        
        // Set formData immediately, before fetchListing runs
        setFormData(prev => ({
          ...prev,
          ...parsed,
          quantity: quantityValue,
        }));
      } catch (e) {
        console.error('[EDIT] Main useEffect - Failed to parse saved form data:', e);
      }
    }
    
    // Then fetch from API (will merge with localStorage data in fetchListing)
    fetchListing();
    fetchCategories();
  }, [id, isAuthenticated]);

  const fetchListing = async () => {
    setIsFetching(true);
    try {
      // Use /products/my/:id endpoint to get own product (works for all statuses including pending)
      let response;
      try {
        response = await userApi.getMyProductById(id);
      } catch (myProductError: any) {
        // If not found or not owner, try public endpoint
        if (myProductError.response?.status === 404 || myProductError.response?.status === 403) {
          response = await listingsApi.getOne(id);
        } else {
          throw myProductError;
        }
      }
      
      const listing = response.data.product || response.data;
      
      // The /products/my/:id endpoint already validates ownership
      // So we don't need to check seller again here

      // Check if there's saved form data in localStorage
      const storageKey = `editListingFormData_${id}`;
      
      // Check ALL localStorage keys first for debugging
      const allKeys = Object.keys(localStorage).filter(k => k.includes('editListing'));
      console.log('[EDIT] fetchListing - All editListing keys in localStorage:', allKeys);
      console.log('[EDIT] fetchListing - Looking for key:', storageKey);
      console.log('[EDIT] fetchListing - Key exists?', allKeys.includes(storageKey));
      
      const savedFormData = localStorage.getItem(storageKey);
      console.log('[EDIT] fetchListing - localStorage.getItem result:', savedFormData);
      console.log('[EDIT] fetchListing - localStorage.getItem result type:', typeof savedFormData);
      console.log('[EDIT] fetchListing - localStorage.getItem result length:', savedFormData?.length || 0);
      
      let savedData = null;
      if (savedFormData) {
        try {
          savedData = JSON.parse(savedFormData);
          console.log('[EDIT] fetchListing - parsed savedData:', savedData);
          console.log('[EDIT] fetchListing - savedData.quantity:', savedData.quantity, 'type:', typeof savedData.quantity);
        } catch (e) {
          console.error('[EDIT] fetchListing - Failed to parse saved form data:', e);
        }
      } else {
        console.log('[EDIT] fetchListing - No saved data found in localStorage');
      }

      console.log('[EDIT] fetchListing - API listing.quantity:', listing.quantity, 'type:', typeof listing.quantity);
      console.log('[EDIT] fetchListing - current formData.quantity:', formData.quantity, 'type:', typeof formData.quantity);

      // Merge API data with saved data, prioritizing saved data if it exists
      // Special handling for quantity: prioritize saved value, then API value, then empty string
      // API returns: null = unlimited stock, number = limited stock
      // Frontend uses: empty string = unlimited stock, number string = limited stock
      let quantityValue = '';
      
      // First priority: saved data from localStorage (user's current edits)
      if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
        quantityValue = String(savedData.quantity);
        console.log('[EDIT] fetchListing - Using localStorage quantity:', quantityValue);
      } 
      // Second priority: API value from database (null = unlimited, number = limited)
      else if (listing.quantity !== undefined && listing.quantity !== null) {
        quantityValue = String(listing.quantity);
        console.log('[EDIT] fetchListing - Using API quantity:', quantityValue);
      }
      // Third priority: keep existing formData value if available
      else if (formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== '') {
        quantityValue = String(formData.quantity);
        console.log('[EDIT] fetchListing - Using existing formData quantity:', quantityValue);
      }
      // Default: empty string (unlimited stock) - API returned null or undefined
      else {
        quantityValue = '';
        console.log('[EDIT] fetchListing - Using default empty quantity (unlimited) - API returned:', listing.quantity);
      }
      
      console.log('[EDIT] fetchListing - Final quantityValue:', quantityValue);

      // IMPORTANT: Preserve quantity from localStorage if it exists, even if API says null/undefined
      // This ensures user's edits are not lost when page reloads
      let finalQuantity = quantityValue;
      
      if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
        finalQuantity = String(savedData.quantity);
        console.log('[EDIT] fetchListing - OVERRIDING quantity with localStorage value:', finalQuantity);
      } else {
        console.log('[EDIT] fetchListing - Using computed quantityValue:', finalQuantity);
      }
      
      console.log('[EDIT] fetchListing - Final quantity decision:', {
        savedDataExists: !!savedData,
        savedDataQuantity: savedData?.quantity,
        savedDataQuantityType: typeof savedData?.quantity,
        quantityValue,
        finalQuantity,
      });
      
      // CRITICAL: Preserve quantity from localStorage if it exists
      // Priority: savedData.quantity > prev.quantity (from main useEffect) > finalQuantity > ''
      setFormData(prev => {
        let quantityToUse = finalQuantity;
        
        // First priority: savedData from localStorage (read in fetchListing)
        if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
          quantityToUse = String(savedData.quantity);
          console.log('[EDIT] fetchListing - Using savedData.quantity:', quantityToUse);
        }
        // Second priority: prev.quantity (from main useEffect that loaded localStorage)
        else if (prev.quantity && prev.quantity !== '') {
          quantityToUse = String(prev.quantity);
          console.log('[EDIT] fetchListing - Preserving prev.quantity:', quantityToUse);
        }
        // Third priority: finalQuantity (computed from API)
        else {
          quantityToUse = finalQuantity;
          console.log('[EDIT] fetchListing - Using finalQuantity:', quantityToUse);
        }
        
        console.log('[EDIT] fetchListing - setFormData decision:', {
          savedDataQuantity: savedData?.quantity,
          prevQuantity: prev.quantity,
          finalQuantity,
          quantityToUse,
        });
        
        const newFormData = {
          title: savedData?.title || listing.title || prev.title || '',
          description: savedData?.description || listing.description || prev.description || '',
          price: savedData?.price || listing.price?.toString() || prev.price || '',
          categoryId: savedData?.categoryId || listing.categoryId || listing.category?.id || prev.categoryId || '',
          condition: savedData?.condition || listing.condition || prev.condition || 'very_good',
          brand: savedData?.brand || listing.brand || prev.brand || '',
          scale: savedData?.scale || listing.scale || prev.scale || '1:64',
          isTradeEnabled: savedData?.isTradeEnabled !== undefined ? savedData.isTradeEnabled : (listing.isTradeEnabled || listing.trade_available || prev.isTradeEnabled || false),
          quantity: quantityToUse,
          imageUrls: savedData?.imageUrls?.length > 0 ? savedData.imageUrls : (listing.images?.map((img: any) => img.url || img) || prev.imageUrls || []),
          status: savedData?.status || listing.status || prev.status || 'active',
        };
        
        console.log('[EDIT] fetchListing - Setting formData with quantity:', newFormData.quantity);
        console.log('[EDIT] fetchListing - Full newFormData:', newFormData);
        
        return newFormData;
      });
    } catch (error: any) {
      console.error('Failed to fetch listing:', error);
      toast.error(error.response?.data?.message || 'İlan yüklenemedi');
      router.push('/profile/listings');
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
        // CRITICAL: Send null for unlimited stock (empty string), number for limited stock
        // Backend expects: null = unlimited, number = limited, undefined = don't update
        quantity: formData.quantity && formData.quantity !== '' ? Number(formData.quantity) : null,
        imageUrls: formData.imageUrls.length > 0 ? formData.imageUrls : undefined,
        status: formData.status,
      };
      
      console.log('[EDIT] handleSubmit - Payload quantity:', payload.quantity, 'from formData.quantity:', formData.quantity);

      await listingsApi.update(id, payload as any);
      toast.success('İlanınız güncellendi!');
      
      // Clear saved form data after successful submission
      // Only clear if we're actually navigating away (not just refreshing)
      console.log('[EDIT] handleSubmit - Clearing localStorage for:', `editListingFormData_${id}`);
      localStorage.removeItem(`editListingFormData_${id}`);
      console.log('[EDIT] handleSubmit - localStorage cleared, redirecting...');
      
      // Small delay to ensure localStorage is cleared before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
      // Refresh user data to update listing count
      await refreshUserData();
      // Small delay to ensure backend has processed the deletion
      await new Promise(resolve => setTimeout(resolve, 500));
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
                  Boş bırakırsanız sınırsız stok olur
                </p>
                <input
                  type="number"
                  value={formData.quantity || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    console.log('[EDIT] Input onChange - value:', value, 'type:', typeof value);
                    // Save as string, empty string means unlimited stock
                    const newQuantity = value === '' ? '' : value;
                    console.log('[EDIT] Input onChange - setting quantity to:', newQuantity);
                    setFormData({ ...formData, quantity: newQuantity });
                  }}
                  onBlur={() => {
                    console.log('[EDIT] Input onBlur - current formData.quantity:', formData.quantity);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-500 bg-white"
                  placeholder="Sınırsız"
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
