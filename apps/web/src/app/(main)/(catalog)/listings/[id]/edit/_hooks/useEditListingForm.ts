import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { listingsApi, userApi } from '@/lib/api';
import { createInitialFormData, createInitialSaleData } from '../_lib/constants';
import { buildListingFormData, buildSaleDataFromListing } from '../_lib/build-edit-form-data';
import type { EditListingFormData, SaleData } from '../_lib/types';

interface UseEditListingFormParams {
  id: string;
  authLoading: boolean;
  isAuthenticated: boolean;
}

export function useEditListingForm({ id, authLoading, isAuthenticated }: UseEditListingFormParams) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const [formData, setFormData] = useState<EditListingFormData>(createInitialFormData);
  // Store preview URLs separately (presigned URLs for display)
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const [saleData, setSaleData] = useState<SaleData>(createInitialSaleData);

  // Load saved form data from localStorage on mount (before fetching from API)
  // This runs FIRST, before fetchListing
  useEffect(() => {
    if (!id) return;

    // Use a small delay to ensure localStorage is ready after page navigation
    const timer = setTimeout(() => {
      const storageKey = `editListingFormData_${id}`;
      const savedFormData = localStorage.getItem(storageKey);

      if (savedFormData) {
        try {
          const parsed = JSON.parse(savedFormData);

          // Always restore if we have data, even if quantity is empty string
          const quantityValue = parsed.quantity !== undefined && parsed.quantity !== null && parsed.quantity !== ''
            ? String(parsed.quantity)
            : '';

          setFormData(prev => {
            const newData = {
              ...prev,
              ...parsed,
              quantity: quantityValue,
            };
            return newData;
          });
        } catch {
        }
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

      const dataToSave = {
        ...formData,
        quantity: quantityToSave,
      };

      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
    }, 300); // Debounce to avoid too many writes

    return () => clearTimeout(timeoutId);
  }, [formData, id]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error('İlan düzenlemek için giriş yapmalısınız');
      router.push('/login');
      return;
    }

    // CRITICAL: Load from localStorage FIRST, synchronously, before fetchListing
    // This ensures user's edits are preserved even if fetchListing runs immediately
    const storageKey = `editListingFormData_${id}`;
    const savedFormData = localStorage.getItem(storageKey);

    if (savedFormData) {
      try {
        const parsed = JSON.parse(savedFormData);
        const quantityValue = parsed.quantity !== undefined && parsed.quantity !== null && parsed.quantity !== ''
          ? String(parsed.quantity)
          : '';

        // Set formData immediately, before fetchListing runs
        setFormData(prev => ({
          ...prev,
          ...parsed,
          quantity: quantityValue,
        }));
      } catch {
      }
    }

    // Then fetch from API (will merge with localStorage data in fetchListing)
    fetchListing();
  }, [id, authLoading, isAuthenticated]);

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

      const savedFormData = localStorage.getItem(storageKey);

      let savedData = null;
      if (savedFormData) {
        try {
          savedData = JSON.parse(savedFormData);
        } catch {
        }
      }

      // Merge API data with saved data, prioritizing saved data if it exists
      // Special handling for quantity: prioritize saved value, then API value, then empty string
      // API returns: null = unlimited stock, number = limited stock
      // Frontend uses: empty string = unlimited stock, number string = limited stock
      let quantityValue = '';

      // First priority: saved data from localStorage (user's current edits)
      if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
        quantityValue = String(savedData.quantity);
      }
      // Second priority: API value from database (null = unlimited, number = limited)
      else if (listing.quantity !== undefined && listing.quantity !== null) {
        quantityValue = String(listing.quantity);
      }
      // Third priority: keep existing formData value if available
      else if (formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== '') {
        quantityValue = String(formData.quantity);
      }
      // Default: empty string (unlimited stock) - API returned null or undefined
      else {
        quantityValue = '';
      }

      // IMPORTANT: Preserve quantity from localStorage if it exists, even if API says null/undefined
      // This ensures user's edits are not lost when page reloads
      let finalQuantity = quantityValue;

      if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
        finalQuantity = String(savedData.quantity);
      }

      // CRITICAL: Preserve quantity from localStorage if it exists
      // Priority: savedData.quantity > prev.quantity (from main useEffect) > finalQuantity > ''
      setFormData(prev => {
        let quantityToUse = finalQuantity;

        // First priority: savedData from localStorage (read in fetchListing)
        if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
          quantityToUse = String(savedData.quantity);
        }
        // Second priority: prev.quantity (from main useEffect that loaded localStorage)
        else if (prev.quantity && prev.quantity !== '') {
          quantityToUse = String(prev.quantity);
        }
        // Third priority: finalQuantity (computed from API)
        else {
          quantityToUse = finalQuantity;
        }

        const { newFormData, previewUrls } = buildListingFormData(prev, listing, savedData, quantityToUse);

        setImagePreviewUrls(previewUrls);

        return newFormData;
      });

      const { saleData: nextSaleData, saleActive } = buildSaleDataFromListing(listing);
      setSaleData(nextSaleData);
      if (saleActive) {
        setShowDiscountSection(true);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İlan yüklenemedi');
      router.push('/profile/listings');
    } finally {
      setIsFetching(false);
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
      const formPrice = Number(formData.price);
      const orig = saleData.originalPrice ? Number(saleData.originalPrice) : formPrice;
      const sale = saleData.salePrice ? Number(saleData.salePrice) : 0;
      // Use whichever is higher between formData.price and saleData.originalPrice as the "original"
      const effectiveOrig = Math.max(orig, formPrice);
      // A sale is valid only when salePrice > 0, effectively lower than the listed price, and distinct from it
      const hasSale = sale > 0 && effectiveOrig > sale && sale !== formPrice;
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
        manufacturerId: formData.manufacturerId || undefined,
        year: formData.year ? Number(formData.year) : undefined,
        isTradeEnabled: formData.isTradeEnabled,
        isPreorder: formData.isPreorder,
        isSet: formData.isSet,
        bundleSize:
          formData.isSet && Number(formData.bundleSize) >= 2
            ? Number(formData.bundleSize)
            : null,
        quantity: formData.quantity && formData.quantity !== '' ? Number(formData.quantity) : null,
        images: formData.images.length > 0 ? formData.images : undefined,
        status: formData.status,
      };
      // Sale/discount fields: send to backend so listing shows updated price
      if (hasSale) {
        payload.originalPrice = effectiveOrig;
        payload.salePrice = sale;
        payload.saleStartDate = saleData.saleStartDate ? new Date(saleData.saleStartDate).toISOString() : null;
        payload.saleEndDate = saleData.saleEndDate ? new Date(saleData.saleEndDate).toISOString() : null;
      } else {
        payload.originalPrice = null;
        payload.salePrice = null;
        payload.saleStartDate = null;
        payload.saleEndDate = null;
      }

      await listingsApi.update(id, payload as any);
      toast.success('İlanınız güncellendi!');

      queryClient.invalidateQueries({ queryKey: ['listing', id] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['profile-listings'] });

      // Clear saved form data after successful submission
      // Only clear if we're actually navigating away (not just refreshing)
      localStorage.removeItem(`editListingFormData_${id}`);

      // Small delay to ensure localStorage is cleared before navigation
      await new Promise(resolve => setTimeout(resolve, 100));

      router.push(`/listings/${id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İlan güncellenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    formData,
    setFormData,
    saleData,
    setSaleData,
    imagePreviewUrls,
    setImagePreviewUrls,
    showDiscountSection,
    setShowDiscountSection,
    isLoading,
    setIsLoading,
    isFetching,
    handleSubmit,
  };
}
