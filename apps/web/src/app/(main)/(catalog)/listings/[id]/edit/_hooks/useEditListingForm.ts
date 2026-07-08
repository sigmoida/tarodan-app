import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  // Shared submit/lifecycle busy flag (also driven by `useListingLifecycle`).
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState<EditListingFormData>(createInitialFormData);
  // Store preview URLs separately (presigned URLs for display)
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const [saleData, setSaleData] = useState<SaleData>(createInitialSaleData);

  // Load saved form data from localStorage on mount (before the API resolves).
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

          setFormData(prev => ({
            ...prev,
            ...parsed,
            quantity: quantityValue,
          }));
        } catch {
        }
      }
    }, 100); // Small delay to ensure localStorage is ready

    return () => clearTimeout(timer);
  }, [id]);

  // Save form data to localStorage whenever it changes (debounced).
  useEffect(() => {
    if (!id) return;

    const timeoutId = setTimeout(() => {
      const storageKey = `editListingFormData_${id}`;

      // Ensure quantity is always saved as string (empty string = unlimited)
      const quantityToSave = formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== ''
        ? String(formData.quantity)
        : '';

      localStorage.setItem(storageKey, JSON.stringify({ ...formData, quantity: quantityToSave }));
    }, 300); // Debounce to avoid too many writes

    return () => clearTimeout(timeoutId);
  }, [formData, id]);

  // Auth gate.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error('İlan düzenlemek için giriş yapmalısınız');
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load the listing — own-product endpoint first (works for all statuses), then
  // the public endpoint if we're not the owner.
  const listingQuery = useQuery({
    queryKey: ['listing-edit', id],
    queryFn: async () => {
      let response;
      try {
        response = await userApi.getMyProductById(id);
      } catch (myProductError: any) {
        if (myProductError.response?.status === 404 || myProductError.response?.status === 403) {
          response = await listingsApi.getOne(id);
        } else {
          throw myProductError;
        }
      }
      return response.data.product || response.data;
    },
    enabled: !authLoading && isAuthenticated && !!id,
    meta: { page: 'listing-edit' },
  });

  useEffect(() => {
    if (!listingQuery.isError) return;
    toast.error((listingQuery.error as any)?.response?.data?.message || 'İlan yüklenemedi');
    router.push('/profile/listings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingQuery.isError]);

  // Merge the fetched listing with any localStorage draft — once, when the data
  // first arrives. Saved (draft) quantity wins over the API value so a reload
  // never discards the user's in-progress edits.
  const populatedRef = useRef(false);
  useEffect(() => {
    const listing = listingQuery.data;
    if (!listing || populatedRef.current) return;
    populatedRef.current = true;

    const storageKey = `editListingFormData_${id}`;
    const savedFormData = localStorage.getItem(storageKey);
    let savedData: any = null;
    if (savedFormData) {
      try {
        savedData = JSON.parse(savedFormData);
      } catch {
      }
    }

    let quantityValue = '';
    if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
      quantityValue = String(savedData.quantity);
    } else if (listing.quantity !== undefined && listing.quantity !== null) {
      quantityValue = String(listing.quantity);
    } else if (formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== '') {
      quantityValue = String(formData.quantity);
    }

    let finalQuantity = quantityValue;
    if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
      finalQuantity = String(savedData.quantity);
    }

    setFormData(prev => {
      let quantityToUse = finalQuantity;
      if (savedData && savedData.quantity !== undefined && savedData.quantity !== null && savedData.quantity !== '') {
        quantityToUse = String(savedData.quantity);
      } else if (prev.quantity && prev.quantity !== '') {
        quantityToUse = String(prev.quantity);
      } else {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingQuery.data]);

  const isFetching = !id ? false : authLoading || listingQuery.isPending;

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => listingsApi.update(id, payload as any),
    onMutate: () => setIsLoading(true),
    onSuccess: () => {
      toast.success('İlanınız güncellendi!');
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['profile-listings'] });
      // Clear the saved draft after a successful save.
      localStorage.removeItem(`editListingFormData_${id}`);
      router.push(`/listings/${id}`);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message || 'İlan güncellenemedi'),
    onSettled: () => setIsLoading(false),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.price || !formData.categoryId) {
      toast.error('Lütfen tüm zorunlu alanları doldurun');
      return;
    }

    if (isNaN(Number(formData.price)) || Number(formData.price) < 1) {
      toast.error('Geçerli bir fiyat giriniz');
      return;
    }

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

    updateMutation.mutate(payload);
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
