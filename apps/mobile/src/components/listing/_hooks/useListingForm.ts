import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';

import { useAuthStore } from '../../../stores/authStore';
import { api, productsApi, categoriesApi, bankAccountApi } from '@/lib/api';
import { FALLBACK_SCALES, FALLBACK_MATERIALS, BRAND_SLUGS, SCALE_SLUGS } from '../_lib/constants';
import type {
  Category,
  Brand,
  CarModel,
  Manufacturer,
  MaterialOption,
  ListingLimits,
  CommissionPreview,
  AttrGroup,
  ListingFormProps,
} from '../_lib/types';

/**
 * ListingForm controller — owns the entire create/edit form state machine.
 * Lifted verbatim from the monolithic component (RHF migration deferred): all
 * state, effects, API calls, image upload, submit/delete/reactivate handlers and
 * derived values live here so the screen only composes sections + modals.
 */
export function useListingForm({ mode, productId }: ListingFormProps) {
  const isEdit = mode === 'edit';
  const queryClient = useQueryClient();

  const bankAccountQuery = useQuery({
    queryKey: ['bank-account'],
    queryFn: async () => {
      const res = await bankAccountApi.get();
      return res.data || null;
    },
    enabled: !isEdit,
  });
  const hasBankAccount = isEdit || !!bankAccountQuery.data;

  const {
    isAuthenticated,
    isLoading: authLoading,
    user,
    limits,
    refreshUserData,
  } = useAuthStore();

  // İlan listesi/detay ekranlarının bayat kalmaması için ilgili cache'leri temizler.
  const invalidateListingCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['my-listings'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['products-search'] });
    if (productId) queryClient.invalidateQueries({ queryKey: ['product', productId] });
  };

  // Shared form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  // Aktif takas/sipariş rezervasyonu (quantity − availableQuantity); alıcıların
  // gördüğü "satışta" sayısının fiziksel stoktan neden düşük olduğunu açıklar.
  const [reservedQty, setReservedQty] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('very_good');
  const [brandId, setBrandId] = useState('');
  const [carModelId, setCarModelId] = useState('');
  const [scale, setScale] = useState('1:64');
  const [material, setMaterial] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [year, setYear] = useState('');
  const [isTradeEnabled, setIsTradeEnabled] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [bundleSize, setBundleSize] = useState('');

  // Edit-only state
  const [status, setStatus] = useState('active');
  const [isPreorder, setIsPreorder] = useState(false);
  const [salePrice, setSalePrice] = useState('');
  const [saleStartDate, setSaleStartDate] = useState('');
  const [saleEndDate, setSaleEndDate] = useState('');
  const [reactivateQuantity, setReactivateQuantity] = useState('');
  const [reactivating, setReactivating] = useState(false);
  const [productLoading, setProductLoading] = useState(isEdit);
  const [productNotFound, setProductNotFound] = useState(false);

  // Images: local URIs for display + server keys for submission
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [imageKeys, setImageKeys] = useState<Array<{ cardKey: string; detailKey: string }>>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Data from API
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<CarModel[]>([]);
  const [scaleList, setScaleList] = useState<string[]>([]);
  const [materialList, setMaterialList] = useState<MaterialOption[]>([]);
  const [manufacturerList, setManufacturerList] = useState<Manufacturer[]>([]);

  // Manufacturer-scoped extra attributes. groupSlug -> selected attribute slugs.
  const [customAttributes, setCustomAttributes] = useState<Record<string, string[]>>({});
  const [manufacturerAttrGroups, setManufacturerAttrGroups] = useState<AttrGroup[]>([]);
  const [showAttrGroupPicker, setShowAttrGroupPicker] = useState<string | null>(null);
  // Holds prefilled manufacturer attributes (edit) until the groups finish loading,
  // so the manufacturer-change reset effect doesn't wipe them.
  const initialCustomAttrsRef = useRef<Record<string, string[]> | null>(null);

  // Loading flags
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [limitsLoading, setLimitsLoading] = useState(!isEdit);

  // Listing limits (create only)
  const [listingLimits, setListingLimits] = useState<ListingLimits | null>(null);

  // Commission preview
  const [commissionPreview, setCommissionPreview] = useState<CommissionPreview | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);

  // Picker modal visibility
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showManufacturerPicker, setShowManufacturerPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  // Search within modals
  const [brandSearch, setBrandSearch] = useState('');
  const [manufacturerSearch, setManufacturerSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');

  const commissionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Auth gate (create only — edit is always reached authenticated)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (authLoading || isEdit) return;
    if (!isAuthenticated) {
      appAlert('Giriş Gerekli', 'İlan oluşturmak için giriş yapmalısınız.', [
        { text: 'Giriş Yap', onPress: () => router.push('/(auth)/login') },
        { text: 'İptal', style: 'cancel' },
      ]);
    }
  }, [isAuthenticated, authLoading, isEdit]);

  // -----------------------------------------------------------------------
  // Initial data loading
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    fetchCategories();
    fetchFilters();
    if (!isEdit) {
      refreshUserData().then(() => updateListingLimits());
    }
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (!isEdit && user && limits) updateListingLimits();
  }, [user, limits]);

  // -----------------------------------------------------------------------
  // Edit: fetch product and prefill the form
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isEdit || !productId) return;
    let cancelled = false;
    (async () => {
      setProductLoading(true);
      try {
        const res = await productsApi.getMyById(productId);
        const p = (res.data?.data ?? res.data) as any;
        if (cancelled) return;
        if (!p) {
          setProductNotFound(true);
          return;
        }
        const onSale =
          p.isOnSale && p.oldPrice != null && Number(p.oldPrice) > Number(p.price);

        setTitle(p.title ?? '');
        setDescription(p.description ?? '');
        setPrice(String(onSale ? p.oldPrice : p.price ?? ''));
        setQuantity(p.quantity != null ? String(p.quantity) : '');
        setReservedQty(
          p.quantity != null && p.availableQuantity != null
            ? Math.max(0, Number(p.quantity) - Number(p.availableQuantity))
            : 0
        );
        setCategoryId(p.category?.id ?? p.categoryId ?? '');
        setCondition(p.condition ?? 'very_good');
        setBrandId(p.brand?.id ?? '');
        setCarModelId(p.carModel?.id ?? '');
        setScale(p.scale ?? '');
        setMaterial(p.material ?? '');
        setManufacturerId(p.manufacturer?.id ?? '');
        setYear(p.year != null ? String(p.year) : '');
        setIsTradeEnabled(!!p.isTradeEnabled);
        setIsSet(!!p.isSet);
        setBundleSize(p.bundleSize != null ? String(p.bundleSize) : '');
        setIsPreorder(!!p.isPreorder);
        setStatus(p.status ?? 'active');

        const imgs = Array.isArray(p.images) ? p.images : [];
        setImageKeys(
          imgs.map((i: any) => ({
            cardKey: i.cardKey ?? i.url,
            detailKey: i.detailKey ?? i.cardKey ?? i.url,
          }))
        );
        setImageUris(imgs.map((i: any) => i.cardUrl ?? i.detailUrl ?? i.url ?? ''));

        // Manufacturer-scoped attributes → groupSlug -> [attrSlug]
        const scoped = (Array.isArray(p.attributes) ? p.attributes : []).filter(
          (a: any) => a?.manufacturerSlug && a?.groupSlug && a?.slug
        );
        if (scoped.length) {
          const grouped: Record<string, string[]> = {};
          scoped.forEach((a: any) => {
            (grouped[a.groupSlug] ??= []).push(a.slug);
          });
          initialCustomAttrsRef.current = grouped;
        }

        if (onSale) {
          setSalePrice(String(p.price));
          setSaleStartDate(p.saleStartDate ? String(p.saleStartDate).slice(0, 10) : '');
          setSaleEndDate(p.saleEndDate ? String(p.saleEndDate).slice(0, 10) : '');
        }
      } catch {
        if (!cancelled) setProductNotFound(true);
      } finally {
        if (!cancelled) setProductLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, productId]);

  // -----------------------------------------------------------------------
  // Fetch models when brand changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (brandId) {
      const selected = brands.find((b) => b.id === brandId);
      if (selected) fetchModels(selected.slug);
    } else {
      setModels([]);
    }
  }, [brandId, brands]);

  // -----------------------------------------------------------------------
  // Fetch manufacturer-scoped attribute groups when manufacturer changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    const selected = manufacturerList.find((m) => m.id === manufacturerId);
    if (!selected) {
      setManufacturerAttrGroups([]);
      if (!initialCustomAttrsRef.current) setCustomAttributes({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/products/attribute-groups', {
          params: { manufacturer: selected.slug },
        });
        if (cancelled) return;
        const groups = (res.data ?? []) as AttrGroup[];
        // Render only scoped groups; global ones (scale, material) have dedicated fields.
        setManufacturerAttrGroups(groups.filter((g) => g.manufacturerSlug === selected.slug));
        if (initialCustomAttrsRef.current) {
          setCustomAttributes(initialCustomAttrsRef.current);
          initialCustomAttrsRef.current = null;
        } else {
          setCustomAttributes({});
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to fetch manufacturer attribute groups:', error);
        if (!cancelled) {
          setManufacturerAttrGroups([]);
          if (!initialCustomAttrsRef.current) setCustomAttributes({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manufacturerId, manufacturerList]);

  // -----------------------------------------------------------------------
  // Commission preview when price changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (commissionTimer.current) clearTimeout(commissionTimer.current);

    const amount = Number(price);
    if (isNaN(amount) || amount <= 0) {
      setCommissionPreview(null);
      return;
    }

    commissionTimer.current = setTimeout(() => {
      setCommissionLoading(true);
      api
        .get('/orders/commission-preview', {
          params: { amount: price, categoryId: categoryId || undefined },
        })
        .then((res) => {
          if (res.data) {
            setCommissionPreview({
              sellerFeeAmount: Number(res.data.sellerFeeAmount ?? 0),
              sellerNetAmount: Number(res.data.sellerNetAmount ?? 0),
            });
          }
        })
        .catch(() => setCommissionPreview(null))
        .finally(() => setCommissionLoading(false));
    }, 500);

    return () => {
      if (commissionTimer.current) clearTimeout(commissionTimer.current);
    };
  }, [price, categoryId]);

  // -----------------------------------------------------------------------
  // API Calls
  // -----------------------------------------------------------------------
  const fetchCategories = async () => {
    try {
      const res = await categoriesApi.getAll();
      const cats = res.data?.data || res.data || [];
      setCategories(cats);
    } catch {
      appAlert('Hata', 'Kategoriler yüklenemedi.');
    }
  };

  const fetchFilters = async () => {
    setBrandsLoading(true);
    try {
      const res = await api.get('/products/filters');
      const data = res.data as {
        scales?: string[];
        materials?: MaterialOption[];
        brands?: Brand[];
        manufacturers?: Manufacturer[];
      };
      if (data.scales?.length) setScaleList(data.scales);
      if (data.materials?.length) setMaterialList(data.materials);
      if (data.brands?.length) setBrands(data.brands);
      if (data.manufacturers?.length) setManufacturerList(data.manufacturers);
    } catch {
      appAlert('Hata', 'Filtreler yüklenemedi.');
    } finally {
      setBrandsLoading(false);
    }
  };

  const fetchModels = async (brandSlug: string) => {
    setModelsLoading(true);
    setModels([]);
    try {
      const res = await api.get('/car-models', { params: { brand: brandSlug } });
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setModels(data);
    } catch {
      appAlert('Hata', 'Modeller yüklenemedi.');
    } finally {
      setModelsLoading(false);
    }
  };

  const updateListingLimits = async () => {
    setLimitsLoading(true);
    try {
      const res = await api.get('/products/my/stats', { params: { _t: Date.now() } });
      const stats = res.data;
      const tierName = stats.limits?.tierName || 'Free';
      const tierType = stats.limits?.tierType || 'free';
      const isPremium = tierType === 'premium' || tierType === 'business';
      const maxListings = stats.summary?.max || 10;
      const used = stats.summary?.used || 0;
      const remaining = stats.summary?.remaining || 0;
      const canCreate = stats.summary?.canCreate ?? true;

      setListingLimits({
        currentCount: used,
        maxListings,
        canCreateListing: canCreate,
        isPremium,
        membershipTier: tierName,
        remainingListings: remaining,
      });
    } catch {
      // Stats çekilemezse: yanıltıcı sayı GÖSTERME ve kullanıcıyı BLOKLAMA.
      // (user.listingCount ömür-boyu toplamdır, kotayı yanlış şişirir.) Sunucu POST'ta zaten doğrular.
      const membershipTier = user?.membershipTier || 'free';
      const isPremium = membershipTier === 'premium' || membershipTier === 'business';

      setListingLimits({
        currentCount: 0,
        maxListings: -1,
        canCreateListing: true,
        isPremium,
        membershipTier,
        remainingListings: -1,
      });
    } finally {
      setLimitsLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Image picker & upload
  // -----------------------------------------------------------------------
  const pickImages = async () => {
    const maxImages = limits?.maxImagesPerListing || 5;
    const remaining = maxImages - imageKeys.length;
    if (remaining <= 0) {
      appAlert('Limit', 'Maksimum görsel sayısına ulaştınız.');
      return;
    }

    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      appAlert('İzin Gerekli', 'Galeri erişim izni gerekiyor.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (result.canceled || result.assets.length === 0) return;

    const assets = result.assets.slice(0, remaining);
    setUploadingImages(true);

    try {
      const formData = new FormData();
      assets.forEach((asset, idx) => {
        const uri = asset.uri;
        const filename = asset.fileName || `image_${idx}.jpg`;
        const type = asset.mimeType || 'image/jpeg';
        formData.append('images', {
          uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
          name: filename,
          type,
        } as any);
      });

      const res = await api.post('/media/upload/product', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = Array.isArray(res.data) ? res.data : [res.data];

      const newKeys = uploaded.map((r: any) => ({
        cardKey: r.cardKey,
        detailKey: r.detailKey,
      }));
      const newPreviewUrls = uploaded.map((r: any) => r.cardUrl || r.detailUrl || '');

      setImageKeys((prev) => [...prev, ...newKeys]);
      setImageUris((prev) => [...prev, ...assets.map((a, i) => newPreviewUrls[i] || a.uri)]);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Görsel yükleme başarısız.';
      appAlert('Hata', msg);
    } finally {
      setUploadingImages(false);
    }
  };

  const removeImage = (index: number) => {
    setImageKeys((prev) => prev.filter((_, i) => i !== index));
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------------
  // Category helpers
  // -----------------------------------------------------------------------
  const flattenCategories = (cats: Category[]): Category[] => {
    const result: Category[] = [];
    cats.forEach((cat) => {
      result.push(cat);
      if (cat.children?.length) result.push(...flattenCategories(cat.children));
    });
    return result;
  };

  const flatCategories = flattenCategories(categories).filter(
    (c) => !BRAND_SLUGS.includes(c.slug) && !SCALE_SLUGS.includes(c.slug)
  );
  const selectedCategory = flatCategories.find((c) => c.id === categoryId);
  const selectedBrand = brands.find((b) => b.id === brandId);
  const selectedModel = models.find((m) => m.id === carModelId);
  const selectedManufacturer = manufacturerList.find((m) => m.id === manufacturerId);
  const effectiveScales = scaleList.length > 0 ? scaleList : FALLBACK_SCALES;
  const effectiveMaterials = materialList.length > 0 ? materialList : FALLBACK_MATERIALS;
  const selectedMaterial = effectiveMaterials.find((m) => m.slug === material);

  const listPriceNum = Number(price) || 0;
  const salePriceNum = Number(salePrice) || 0;
  const discountPercent =
    listPriceNum > 0 && salePriceNum > 0 && salePriceNum < listPriceNum
      ? Math.round((1 - salePriceNum / listPriceNum) * 100)
      : 0;

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------
  const buildBasePayload = () => {
    const customAttributeSlugs = Object.values(customAttributes).flat().filter(Boolean);
    return {
      title,
      description: description || undefined,
      price: Number(price),
      categoryId,
      condition,
      brandId: brandId || undefined,
      carModelId: carModelId || undefined,
      scale: scale || undefined,
      material: material || undefined,
      manufacturerId: manufacturerId || undefined,
      year: year ? Number(year) : undefined,
      isTradeEnabled,
      isSet,
      bundleSize: isSet && Number(bundleSize) >= 2 ? Number(bundleSize) : undefined,
      images: imageKeys.length > 0 ? imageKeys : undefined,
      attributes: customAttributeSlugs.length > 0 ? customAttributeSlugs : undefined,
    } as Record<string, any>;
  };

  const validate = (): boolean => {
    if (!title || title.length < 5) {
      appAlert('Hata', 'Başlık en az 5 karakter olmalıdır.');
      return false;
    }
    if (!price || isNaN(Number(price)) || Number(price) < 1) {
      appAlert('Hata', 'Geçerli bir fiyat giriniz.');
      return false;
    }
    if (!categoryId) {
      appAlert('Hata', 'Lütfen bir kategori seçin.');
      return false;
    }
    if (imageKeys.length === 0) {
      appAlert('Hata', 'En az bir fotoğraf ekleyin.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    if (!isEdit && !hasBankAccount) {
      appAlert(
        'Banka Hesabı Gerekli',
        "İlan vermeden önce IBAN bilgilerinizi eklemelisiniz. Satışlarınızdan elde edeceğiniz tutar bu IBAN'a aktarılır.",
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'IBAN Ekle', onPress: () => router.push('/settings/bank-account') },
        ],
      );
      return;
    }

    if (!isEdit && listingLimits && !listingLimits.canCreateListing) {
      appAlert(
        'Limit Aşıldı',
        `İlan limitinize ulaştınız (${listingLimits.currentCount}/${listingLimits.maxListings}). Üyeliğinizi yükselterek daha fazla ilan oluşturabilirsiniz.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (!isEdit) {
        await productsApi.create({
          ...buildBasePayload(),
          isPreorder: false,
          // Boş bırakılırsa 1 adet — sınırsız (null) stok bilinçli bir seçim değil, default değil.
          quantity: quantity ? Number(quantity) : 1,
        });

        appAlert('Başarılı', 'İlanınız oluşturuldu! Onay bekliyor.', [
          {
            text: 'Tamam',
            onPress: () => {
              resetForm();
              router.push('/settings/my-listings');
            },
          },
        ]);
        invalidateListingCaches();
        await refreshUserData();
        await updateListingLimits();
      } else {
        const payload: Record<string, any> = {
          ...buildBasePayload(),
          isPreorder,
          quantity: quantity !== '' ? Number(quantity) : null,
          status,
        };

        // Sale/discount fields — original price is the listed price field.
        const formPrice = Number(price);
        const sale = salePrice ? Number(salePrice) : 0;
        const hasSale = sale > 0 && formPrice > sale && sale !== formPrice;
        if (hasSale) {
          payload.originalPrice = formPrice;
          payload.salePrice = sale;
          payload.saleStartDate = saleStartDate ? new Date(saleStartDate).toISOString() : null;
          payload.saleEndDate = saleEndDate ? new Date(saleEndDate).toISOString() : null;
        } else {
          payload.originalPrice = null;
          payload.salePrice = null;
          payload.saleStartDate = null;
          payload.saleEndDate = null;
        }

        await productsApi.update(productId!, payload);
        invalidateListingCaches();

        appAlert('Başarılı', 'İlan güncellendi!', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message ??
        err.response?.data?.error ??
        (isEdit ? 'İlan güncellenemedi.' : 'İlan oluşturulamadı.');
      appAlert('Hata', typeof msg === 'string' ? msg : 'İşlem başarısız.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivate = async () => {
    const qty = Number(reactivateQuantity);
    if (!qty || qty < 1) {
      appAlert('Hata', 'Geçerli bir stok miktarı giriniz.');
      return;
    }
    setReactivating(true);
    try {
      await productsApi.update(productId!, { status: 'active', quantity: qty });
      setStatus('pending');
      setQuantity(String(qty));
      invalidateListingCaches();
      appAlert('Başarılı', 'İlanınız incelemeye gönderildi. Onaylandığında yeniden yayına girer.');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Yeniden satışa açılamadı.';
      appAlert('Hata', msg);
    } finally {
      setReactivating(false);
    }
  };

  const handleDelete = () => {
    appAlert('İlanı Sil', 'Bu ilan kalıcı olarak silinecek. Devam etmek istiyor musunuz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setIsSubmitting(true);
          try {
            await productsApi.delete(productId!);
            invalidateListingCaches();
            await refreshUserData();
            appAlert('Silindi', 'İlan silindi.', [
              { text: 'Tamam', onPress: () => router.back() },
            ]);
          } catch (err: any) {
            const msg = err.response?.data?.message || 'İlan silinemedi.';
            appAlert('Hata', msg);
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPrice('');
    setQuantity('1');
    setCategoryId('');
    setCondition('very_good');
    setBrandId('');
    setCarModelId('');
    setScale('1:64');
    setMaterial('');
    setManufacturerId('');
    setYear('');
    setIsTradeEnabled(false);
    setIsSet(false);
    setImageUris([]);
    setImageKeys([]);
    setCommissionPreview(null);
  };

  return {
    // mode
    isEdit,
    limits,
    // auth / gate
    isAuthenticated,
    authLoading,
    productLoading,
    productNotFound,
    hasBankAccount,
    bankAccountQuery,
    // limits
    limitsLoading,
    listingLimits,
    // shared fields
    title, setTitle,
    description, setDescription,
    price, setPrice,
    quantity, setQuantity,
    reservedQty,
    categoryId, setCategoryId,
    condition, setCondition,
    brandId, setBrandId,
    carModelId, setCarModelId,
    scale, setScale,
    material, setMaterial,
    manufacturerId, setManufacturerId,
    year, setYear,
    isTradeEnabled, setIsTradeEnabled,
    isSet, setIsSet,
    bundleSize, setBundleSize,
    // edit-only fields
    status, setStatus,
    isPreorder, setIsPreorder,
    salePrice, setSalePrice,
    saleStartDate, setSaleStartDate,
    saleEndDate, setSaleEndDate,
    reactivateQuantity, setReactivateQuantity,
    reactivating,
    // images
    imageUris,
    imageKeys,
    uploadingImages,
    pickImages,
    removeImage,
    // data
    brands,
    models,
    manufacturerList,
    // custom attrs
    customAttributes, setCustomAttributes,
    manufacturerAttrGroups,
    showAttrGroupPicker, setShowAttrGroupPicker,
    // loading flags
    brandsLoading,
    modelsLoading,
    isSubmitting,
    // commission
    commissionPreview,
    commissionLoading,
    // picker visibility
    showCategoryPicker, setShowCategoryPicker,
    showBrandPicker, setShowBrandPicker,
    showModelPicker, setShowModelPicker,
    showMaterialPicker, setShowMaterialPicker,
    showManufacturerPicker, setShowManufacturerPicker,
    showYearPicker, setShowYearPicker,
    // search
    brandSearch, setBrandSearch,
    manufacturerSearch, setManufacturerSearch,
    categorySearch, setCategorySearch,
    // derived
    flatCategories,
    selectedCategory,
    selectedBrand,
    selectedModel,
    selectedManufacturer,
    effectiveScales,
    effectiveMaterials,
    selectedMaterial,
    discountPercent,
    // handlers
    handleSubmit,
    handleReactivate,
    handleDelete,
  };
}

export type ListingFormController = ReturnType<typeof useListingForm>;
