'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, TagIcon, ChevronDownIcon, ChevronUpIcon, TrashIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { listingsApi, api, userApi, mediaApi, discountsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

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

const SCALES = ['1:18', '1:24', '1:32', '1:43', '1:64', '1:72', '1:87'];

const MATERIALS: { slug: string; label: string }[] = [
  { slug: 'diecast', label: 'Diecast (Metal)' },
  { slug: 'resin', label: 'Resin (Reçine)' },
  { slug: 'composite', label: 'Composite (Kompozit)' },
  { slug: 'plastic', label: 'Plastic (Plastik)' },
];

const CONDITIONS = [
  { value: 'new', label: 'Yeni' },
  { value: 'like_new', label: 'Sıfır Gibi' },
  { value: 'very_good', label: 'Mükemmel' },
  { value: 'good', label: 'İyi' },
  { value: 'fair', label: 'Orta' },
];

export default function EditListingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { isAuthenticated, user, limits, refreshUserData } = useAuthStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [models, setModels] = useState<CarModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1950 + 1 }, (_, i) => currentYear - i);

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
    isPreorder: false,
    isSet: false,
    quantity: '' as string | number,
    imageUrls: [] as string[],
    status: 'active' as string,
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  // Store preview URLs separately (presigned URLs for display)
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const [productDiscounts, setProductDiscounts] = useState<any[]>([]);
  const [saleData, setSaleData] = useState({
    originalPrice: '',
    salePrice: '',
    saleStartDate: new Date().toISOString().split('T')[0],
    saleEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  // Load saved form data from localStorage on mount (before fetching from API)
  // This runs FIRST, before fetchListing
  useEffect(() => {
    if (!id) return;

    // Use a small delay to ensure localStorage is ready after page navigation
    const timer = setTimeout(() => {
      const storageKey = `editListingFormData_${id}`;
      const savedFormData = localStorage.getItem(storageKey);
      if (process.env.NODE_ENV === 'development') {
        console.log('[EDIT] useEffect [id] - Loading from localStorage - key:', storageKey);
        console.log('[EDIT] useEffect [id] - localStorage data exists:', !!savedFormData);
        console.log('[EDIT] useEffect [id] - localStorage data length:', savedFormData?.length || 0);
      }

      if (savedFormData) {
        try {
          const parsed = JSON.parse(savedFormData);
          if (process.env.NODE_ENV === 'development') {
            console.log('[EDIT] useEffect [id] - Parsed localStorage data:', parsed);
            console.log('[EDIT] useEffect [id] - Quantity from localStorage:', parsed.quantity, 'type:', typeof parsed.quantity);
          }

          // Always restore if we have data, even if quantity is empty string
          const quantityValue = parsed.quantity !== undefined && parsed.quantity !== null && parsed.quantity !== ''
            ? String(parsed.quantity)
            : '';
          if (process.env.NODE_ENV === 'development') console.log('[EDIT] useEffect [id] - Setting quantity from localStorage to:', quantityValue);

          setFormData(prev => {
            const newData = {
              ...prev,
              ...parsed,
              quantity: quantityValue,
            };
            if (process.env.NODE_ENV === 'development') console.log('[EDIT] useEffect [id] - Setting formData to:', newData);
            return newData;
          });
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.error('[EDIT] useEffect [id] - Failed to parse saved form data:', e);
        }
      } else {
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] useEffect [id] - No saved data in localStorage');
        // Also check all localStorage keys to debug
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] useEffect [id] - All localStorage keys:', Object.keys(localStorage).filter(k => k.includes('editListing')));
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

      if (process.env.NODE_ENV === 'development') {
        console.log('[EDIT] Save useEffect - quantity:', formData.quantity, '->', quantityToSave, 'type:', typeof formData.quantity);
        console.log('[EDIT] Save useEffect - Full formData:', formData);
      }

      const dataToSave = {
        ...formData,
        quantity: quantityToSave,
      };

      if (process.env.NODE_ENV === 'development') {
        console.log('[EDIT] Save useEffect - Data to save:', dataToSave);
        console.log('[EDIT] Save useEffect - Storage key:', storageKey);
      }

      localStorage.setItem(storageKey, JSON.stringify(dataToSave));

      // Verify it was saved
      const verify = localStorage.getItem(storageKey);
      if (process.env.NODE_ENV === 'development') {
        console.log('[EDIT] Save useEffect - Verification - saved data exists:', !!verify);
        console.log('[EDIT] Save useEffect - Verification - saved data:', verify);
      }
      if (verify) {
        const parsed = JSON.parse(verify);
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] Save useEffect - Verification - parsed quantity:', parsed.quantity);
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
    if (process.env.NODE_ENV === 'development') console.log('[EDIT] Main useEffect - Loading from localStorage BEFORE fetchListing:', storageKey, 'exists:', !!savedFormData);

    if (savedFormData) {
      try {
        const parsed = JSON.parse(savedFormData);
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] Main useEffect - Found saved data, setting formData immediately');
        const quantityValue = parsed.quantity !== undefined && parsed.quantity !== null && parsed.quantity !== ''
          ? String(parsed.quantity)
          : '';
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] Main useEffect - Setting quantity to:', quantityValue);

        // Set formData immediately, before fetchListing runs
        setFormData(prev => ({
          ...prev,
          ...parsed,
          quantity: quantityValue,
        }));
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.error('[EDIT] Main useEffect - Failed to parse saved form data:', e);
      }
    }

    // Then fetch from API (will merge with localStorage data in fetchListing)
    // Then fetch from API (will merge with localStorage data in fetchListing)
    fetchBrands();
    fetchListing();
    fetchCategories();
    fetchProductDiscounts();
  }, [id, isAuthenticated]);

  const fetchBrands = async () => {
    setBrandsLoading(true);
    try {
      const response = await api.get('/brands');
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setBrands(data);
    } catch (error) {
      console.error('Failed to fetch brands:', error);
      toast.error(locale === 'en' ? 'Failed to load brands' : 'Markalar yüklenemedi');
    } finally {
      setBrandsLoading(false);
    }
  };

  const fetchModels = async (brandSlug: string) => {
    setModelsLoading(true);
    setModels([]);
    try {
      const response = await api.get(`/car-models?brand=${brandSlug}`);
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setModels(data);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      toast.error(locale === 'en' ? 'Failed to load models' : 'Modeller yüklenemedi');
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (formData.brandId) {
      // Find brand in brands list to get slug
      // If brand list is not loaded yet, we can't fetch models yet
      // BUT fetchListing might populate formData before brands are loaded.
      // We need to handle that.
      const selectedBrand = brands.find(b => b.id === formData.brandId);
      if (selectedBrand) {
        fetchModels(selectedBrand.slug);
      }
    } else {
      setModels([]);
    }
  }, [formData.brandId, brands]);

  const fetchProductDiscounts = async () => {
    try {
      const response = await discountsApi.getAll({ limit: 100 });
      const allDiscounts = response.data?.items || response.data || [];
      // Filter discounts that target this product
      const relevantDiscounts = allDiscounts.filter((d: any) =>
        d.scope === 'product' && d.targetProductIds?.includes(id)
      );
      setProductDiscounts(relevantDiscounts);
    } catch (error) {
      console.error('Failed to fetch product discounts:', error);
    }
  };

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
      if (process.env.NODE_ENV === 'development') {
        console.log('[EDIT] fetchListing - All editListing keys in localStorage:', allKeys);
        console.log('[EDIT] fetchListing - Looking for key:', storageKey);
        console.log('[EDIT] fetchListing - Key exists?', allKeys.includes(storageKey));
      }
      const savedFormData = localStorage.getItem(storageKey);
      if (process.env.NODE_ENV === 'development') {
        console.log('[EDIT] fetchListing - localStorage.getItem result:', savedFormData);
        console.log('[EDIT] fetchListing - localStorage.getItem result type:', typeof savedFormData);
        console.log('[EDIT] fetchListing - localStorage.getItem result length:', savedFormData?.length || 0);
      }

      let savedData = null;
      if (savedFormData) {
        try {
          savedData = JSON.parse(savedFormData);
          if (process.env.NODE_ENV === 'development') {
            console.log('[EDIT] fetchListing - parsed savedData:', savedData);
            console.log('[EDIT] fetchListing - savedData.quantity:', savedData.quantity, 'type:', typeof savedData.quantity);
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.error('[EDIT] fetchListing - Failed to parse saved form data:', e);
        }
      } else {
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - No saved data found in localStorage');
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[EDIT] fetchListing - API listing.quantity:', listing.quantity, 'type:', typeof listing.quantity);
        console.log('[EDIT] fetchListing - current formData.quantity:', formData.quantity, 'type:', typeof formData.quantity);
      }

      // Merge API data with saved data, prioritizing saved data if it exists
      // Special handling for quantity: prioritize saved value, then API value, then empty string
      // API returns: null = unlimited stock, number = limited stock
      // Frontend uses: empty string = unlimited stock, number string = limited stock
      let quantityValue = '';

      // First priority: saved data from localStorage (user's current edits)
      if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
        quantityValue = String(savedData.quantity);
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Using localStorage quantity:', quantityValue);
      }
      // Second priority: API value from database (null = unlimited, number = limited)
      else if (listing.quantity !== undefined && listing.quantity !== null) {
        quantityValue = String(listing.quantity);
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Using API quantity:', quantityValue);
      }
      // Third priority: keep existing formData value if available
      else if (formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== '') {
        quantityValue = String(formData.quantity);
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Using existing formData quantity:', quantityValue);
      }
      // Default: empty string (unlimited stock) - API returned null or undefined
      else {
        quantityValue = '';
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Using default empty quantity (unlimited) - API returned:', listing.quantity);
      }

      if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Final quantityValue:', quantityValue);

      // IMPORTANT: Preserve quantity from localStorage if it exists, even if API says null/undefined
      // This ensures user's edits are not lost when page reloads
      let finalQuantity = quantityValue;

      if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
        finalQuantity = String(savedData.quantity);
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - OVERRIDING quantity with localStorage value:', finalQuantity);
      } else {
        if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Using computed quantityValue:', finalQuantity);
      }

      if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Final quantity decision:', {
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
          if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Using savedData.quantity:', quantityToUse);
        }
        // Second priority: prev.quantity (from main useEffect that loaded localStorage)
        else if (prev.quantity && prev.quantity !== '') {
          quantityToUse = String(prev.quantity);
          if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Preserving prev.quantity:', quantityToUse);
        }
        // Third priority: finalQuantity (computed from API)
        else {
          quantityToUse = finalQuantity;
          if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - Using finalQuantity:', quantityToUse);
        }

        if (process.env.NODE_ENV === 'development') console.log('[EDIT] fetchListing - setFormData decision:', {
          savedDataQuantity: savedData?.quantity,
          prevQuantity: prev.quantity,
          finalQuantity,
          quantityToUse,
        });

        const materialFromAttrs = (listing as any).attributes?.find(
          (a: any) => (a.label === 'Malzeme' || a.group === 'Malzeme' || a.group === 'material')
        )?.name;
        const newFormData = {
          title: savedData?.title || listing.title || prev.title || '',
          description: savedData?.description || listing.description || prev.description || '',
          price: savedData?.price || listing.price?.toString() || prev.price || '',
          categoryId: savedData?.categoryId || listing.categoryId || listing.category?.id || prev.categoryId || '',
          condition: savedData?.condition || listing.condition || prev.condition || 'very_good',
          brandId: savedData?.brandId || listing.brand?.id || prev.brandId || '',
          carModelId: savedData?.carModelId || listing.carModel?.id || prev.carModelId || '',
          scale: savedData?.scale || listing.scale || prev.scale || '1:64',
          material: savedData?.material ?? materialFromAttrs ?? (listing as any).material ?? prev.material ?? '',
          year: savedData?.year ?? (listing as any).year ?? (listing as any).releaseDate ? new Date((listing as any).releaseDate).getFullYear() : prev.year ?? '',
          isTradeEnabled: savedData?.isTradeEnabled !== undefined ? savedData.isTradeEnabled : (listing.isTradeEnabled || listing.trade_available || prev.isTradeEnabled || false),
          isPreorder: savedData?.isPreorder !== undefined ? savedData.isPreorder : ((listing as any).isPreorder ?? prev.isPreorder ?? false),
          isSet: savedData?.isSet !== undefined ? savedData.isSet : ((listing as any).isSet ?? prev.isSet ?? false),
          quantity: quantityToUse,
          imageUrls: savedData?.imageUrls?.length > 0 ? savedData.imageUrls : (listing.images?.map((img: any) => img.url || img) || prev.imageUrls || []),
          status: savedData?.status || listing.status || prev.status || 'active',
        };

        // Set preview URLs for existing images (they should already be presigned URLs from API)
        const previewUrls = savedData?.imageUrls?.length > 0 
          ? [] // Will be set separately if needed
          : (listing.images?.map((img: any) => img.url || img) || []);
        setImagePreviewUrls(previewUrls);

        if (process.env.NODE_ENV === 'development') {
          console.log('[EDIT] fetchListing - Setting formData with quantity:', newFormData.quantity);
          console.log('[EDIT] fetchListing - Full newFormData:', newFormData);
        }

        return newFormData;
      });

      // A+oldPrice: form'da Eski fiyat = oldPrice (veya legacy originalPrice), İndirimli fiyat = price (A)
      const orig = (listing as any).oldPrice != null ? Number((listing as any).oldPrice) : (listing.originalPrice != null ? Number(listing.originalPrice) : null);
      const onSale = (listing as any).oldPrice != null && listing.price != null || (listing as any).isOnSale === true;
      const sale = onSale ? Number(listing.price) : (listing.salePrice != null ? Number(listing.salePrice) : null);
      const start = listing.saleStartDate ? (typeof listing.saleStartDate === 'string' ? listing.saleStartDate.split('T')[0] : new Date(listing.saleStartDate).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
      const end = listing.saleEndDate ? (typeof listing.saleEndDate === 'string' ? listing.saleEndDate.split('T')[0] : new Date(listing.saleEndDate).toISOString().split('T')[0]) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setSaleData({
        originalPrice: orig != null ? String(orig) : '',
        salePrice: sale != null ? String(sale) : '',
        saleStartDate: start,
        saleEndDate: end,
      });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch listing:', error);
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
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch categories:', error);
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

    const maxImages = limits?.maxImagesPerListing || 3;
    const currentCount = formData.imageUrls.length;

    if (currentCount + files.length > maxImages) {
      toast.error(`En fazla ${maxImages} resim yükleyebilirsiniz`);
      return;
    }

    setUploadingImages(true);
    try {
      const fileArray = Array.from(files);
      const response = await mediaApi.uploadProductImages(fileArray);

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

  const [reactivateQuantity, setReactivateQuantity] = useState('1');
  const [reactivating, setReactivating] = useState(false);

  const handleReactivate = async () => {
    const qty = Number(reactivateQuantity);
    if (!qty || qty < 1) {
      toast.error('Geçerli bir stok miktarı giriniz');
      return;
    }
    setReactivating(true);
    try {
      await listingsApi.update(id, { status: 'active', quantity: qty } as any);
      toast.success('Ürün yeniden satışa açıldı!');
      router.push(`/listings/${id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Yeniden satışa açılamadı');
    } finally {
      setReactivating(false);
    }
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
      const orig = saleData.originalPrice ? Number(saleData.originalPrice) : Number(formData.price);
      const sale = saleData.salePrice ? Number(saleData.salePrice) : 0;
      const hasSale = sale > 0 && orig > sale;
      const payload: Record<string, unknown> = {
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
        isPreorder: formData.isPreorder,
        isSet: formData.isSet,
        quantity: formData.quantity && formData.quantity !== '' ? Number(formData.quantity) : null,
        imageUrls: formData.imageUrls.length > 0 ? formData.imageUrls : undefined,
        status: formData.status,
      };
      // Sale/discount fields: send to backend so listing shows updated price
      if (hasSale) {
        payload.originalPrice = orig;
        payload.salePrice = sale;
        payload.saleStartDate = saleData.saleStartDate ? new Date(saleData.saleStartDate).toISOString() : null;
        payload.saleEndDate = saleData.saleEndDate ? new Date(saleData.saleEndDate).toISOString() : null;
      } else {
        payload.originalPrice = null;
        payload.salePrice = null;
        payload.saleStartDate = null;
        payload.saleEndDate = null;
      }

      if (process.env.NODE_ENV === 'development') console.log('[EDIT] handleSubmit - Payload quantity:', payload.quantity, 'from formData.quantity:', formData.quantity);

      await listingsApi.update(id, payload as any);
      toast.success('İlanınız güncellendi!');

      // Clear saved form data after successful submission
      // Only clear if we're actually navigating away (not just refreshing)
      if (process.env.NODE_ENV === 'development') console.log('[EDIT] handleSubmit - Clearing localStorage for:', `editListingFormData_${id}`);
      localStorage.removeItem(`editListingFormData_${id}`);
      if (process.env.NODE_ENV === 'development') console.log('[EDIT] handleSubmit - localStorage cleared, redirecting...');

      // Small delay to ensure localStorage is cleared before navigation
      await new Promise(resolve => setTimeout(resolve, 100));

      router.push(`/listings/${id}`);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to update listing:', error);
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

          {(formData.status === 'sold' || formData.status === 'inactive') && (
            <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-xl">
              <h2 className="text-lg font-semibold text-amber-800 mb-2">
                {formData.status === 'sold' ? 'Bu ürün satılmış' : 'Bu ürün stokta yok'}
              </h2>
              <p className="text-sm text-amber-700 mb-4">
                Yeniden satışa açmak için stok miktarı belirleyip aşağıdaki butonu kullanın.
              </p>
              <div className="flex items-end gap-3">
                <div>
                  <label className="block text-sm font-medium text-amber-800 mb-1">Stok Miktarı</label>
                  <input
                    type="number"
                    min="1"
                    value={reactivateQuantity}
                    onChange={(e) => setReactivateQuantity(e.target.value)}
                    className="w-28 px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-gray-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleReactivate}
                  disabled={reactivating}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {reactivating ? 'İşleniyor...' : 'Yeniden Satışa Aç'}
                </button>
              </div>
            </div>
          )}

          {formData.status === 'reserved' && (
            <div className="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-xl">
              <h2 className="text-lg font-semibold text-blue-800 mb-2">Bu ürün rezerve edilmiş</h2>
              <p className="text-sm text-blue-700">
                Rezerve edilmiş ürünler düzenlenemez. Rezervasyon tamamlandıktan veya iptal edildikten sonra düzenleme yapabilirsiniz.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" style={{ display: ['sold', 'reserved', 'inactive'].includes(formData.status) ? 'none' : undefined }}>
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
                  value={formData.brandId}
                  onChange={(e) => {
                    const newBrandId = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      brandId: newBrandId,
                      carModelId: ''
                    }));
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                  disabled={brandsLoading}
                >
                  <option value="">{brandsLoading ? 'Yükleniyor...' : 'Marka Seçin'}</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model
                </label>
                <select
                  value={formData.carModelId}
                  onChange={(e) => setFormData({ ...formData, carModelId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                  disabled={!formData.brandId || modelsLoading}
                >
                  <option value="">
                    {!formData.brandId
                      ? 'Önce marka seçin'
                      : modelsLoading
                        ? 'Yükleniyor...'
                        : models.length === 0
                          ? 'Bu markaya ait model yok'
                          : 'Model Seçin'}
                  </option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Malzeme
                </label>
                <select
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                >
                  <option value="">Malzeme seçin</option>
                  {MATERIALS.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Çıkış yılı
                </label>
                <p className="text-xs text-gray-500 mb-2">Modelin çıkış yılı (isteğe bağlı)</p>
                <select
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
                >
                  <option value="">Yıl seçin</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Trade Toggle */}
            <div className={`flex items-center justify-between p-4 rounded-xl border ${limits?.canTrade
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

            {/* Ön Sipariş */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <label className="font-medium text-gray-900">Ön Sipariş</label>
                <p className="text-sm text-gray-600">Ürün henüz stokta değil; çıkınca gönderilecek</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isPreorder: !formData.isPreorder })}
                className={`relative w-14 h-8 rounded-full transition-colors ${formData.isPreorder ? 'bg-violet-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${formData.isPreorder ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Set / Paket */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <label className="font-medium text-gray-900">Set / Paket</label>
                <p className="text-sm text-gray-600">Tek ilanda birden fazla model (örn. 5'li paket, garaj seti)</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isSet: !formData.isSet })}
                className={`relative w-14 h-8 rounded-full transition-colors ${formData.isSet ? 'bg-sky-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${formData.isSet ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
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
                    if (process.env.NODE_ENV === 'development') console.log('[EDIT] Input onChange - value:', value, 'type:', typeof value);
                    // Save as string, empty string means unlimited stock
                    const newQuantity = value === '' ? '' : value;
                    if (process.env.NODE_ENV === 'development') console.log('[EDIT] Input onChange - setting quantity to:', newQuantity);
                    setFormData({ ...formData, quantity: newQuantity });
                  }}
                  onBlur={() => {
                    if (process.env.NODE_ENV === 'development') console.log('[EDIT] Input onBlur - current formData.quantity:', formData.quantity);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-500 bg-white"
                  placeholder="Sınırsız"
                  min={1}
                />
              </div>
            </div>

            {/* Discount Section */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDiscountSection(!showDiscountSection)}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ReceiptPercentIcon className="w-5 h-5 text-orange-600" />
                  <span className="font-medium text-gray-900">İndirim & Kampanya</span>
                  {productDiscounts.length > 0 && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                      {productDiscounts.length} aktif
                    </span>
                  )}
                </div>
                {showDiscountSection ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {showDiscountSection && (
                <div className="p-4 space-y-4 bg-white">
                  {/* Quick Sale Price */}
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <TagIcon className="w-4 h-4 text-orange-600" />
                      Hızlı İndirim
                    </h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Ürününüz için hızlıca indirimli fiyat belirleyin. Bu, ürün sayfasında üstü çizili fiyat olarak görünecektir.
                    </p>

                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Orijinal Fiyat (₺)
                        </label>
                        <input
                          type="number"
                          value={saleData.originalPrice || formData.price}
                          onChange={(e) => setSaleData({ ...saleData, originalPrice: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                          placeholder={formData.price || 'Orijinal fiyat'}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          İndirimli Fiyat (₺)
                        </label>
                        <input
                          type="number"
                          value={saleData.salePrice}
                          onChange={(e) => setSaleData({ ...saleData, salePrice: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                          placeholder="İndirimli fiyat"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Başlangıç
                        </label>
                        <input
                          type="date"
                          value={saleData.saleStartDate}
                          onChange={(e) => setSaleData({ ...saleData, saleStartDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Bitiş
                        </label>
                        <input
                          type="date"
                          value={saleData.saleEndDate}
                          onChange={(e) => setSaleData({ ...saleData, saleEndDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                        />
                      </div>
                    </div>

                    {saleData.salePrice && saleData.originalPrice && (
                      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-2 rounded-lg mb-4">
                        <span>
                          %{Math.round((1 - Number(saleData.salePrice) / Number(saleData.originalPrice)) * 100)} indirim
                        </span>
                        <span className="text-gray-500">
                          ({Number(saleData.originalPrice).toLocaleString('tr-TR')} ₺ → {Number(saleData.salePrice).toLocaleString('tr-TR')} ₺)
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-gray-500">
                      * Not: Bu özellik yakında aktif olacaktır. Şimdilik ürün fiyatını doğrudan değiştirebilirsiniz.
                    </p>
                  </div>

                  {/* Existing Discounts */}
                  {productDiscounts.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Bu Ürüne Uygulanan İndirimler</h4>
                      <div className="space-y-2">
                        {productDiscounts.map((discount: any) => (
                          <div key={discount.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-medium text-gray-900">{discount.name}</p>
                              <p className="text-sm text-gray-500">
                                {discount.type === 'percentage' ? `%${discount.value}` : `${discount.value} TL`}
                                {discount.code && <span className="ml-2">Kod: {discount.code}</span>}
                              </p>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded-full ${discount.isCurrentlyValid
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                              }`}>
                              {discount.isCurrentlyValid ? 'Aktif' : 'Pasif'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Link to full discount management */}
                  <div className="pt-2 border-t border-gray-100">
                    <Link
                      href="/profile/discounts"
                      className="inline-flex items-center gap-2 text-orange-600 hover:text-orange-700 text-sm font-medium"
                    >
                      <ReceiptPercentIcon className="w-4 h-4" />
                      Tüm İndirimlerimi Yönet →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Images */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ürün Görselleri (En fazla {limits?.maxImagesPerListing || 3})
              </label>
              <div className="space-y-3">
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileUpload(e.target.files)}
                    disabled={uploadingImages || formData.imageUrls.length >= (limits?.maxImagesPerListing || 3)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  {uploadingImages && (
                    <p className="text-sm text-primary-600 mt-2">Resimler yükleniyor...</p>
                  )}
                </div>

                {formData.imageUrls.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {formData.imageUrls.map((key, index) => {
                      // Use preview URL if available, otherwise try to use key (fallback)
                      const previewUrl = imagePreviewUrls[index] || key;
                      return (
                        <div key={index} className="relative group">
                          <img
                            src={previewUrl}
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
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {formData.imageUrls.length} / {limits?.maxImagesPerListing || 3} resim yüklendi
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
