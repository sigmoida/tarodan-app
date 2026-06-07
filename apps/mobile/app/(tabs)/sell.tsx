import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;
import { useAuthStore } from '../../src/stores/authStore';
// listingsApi → productsApi alias (parite migrasyonu)
import { api, productsApi, productsApi as listingsApi, categoriesApi, mediaApi } from '../../src/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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
  brand: { slug: string };
}

interface Manufacturer {
  id: string;
  name: string;
  slug: string;
}

interface MaterialOption {
  slug: string;
  label: string;
}

interface ListingLimits {
  currentCount: number;
  maxListings: number;
  canCreateListing: boolean;
  isPremium: boolean;
  membershipTier: string;
  remainingListings: number;
}

interface CommissionPreview {
  sellerFeeAmount: number;
  sellerNetAmount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CONDITIONS = [
  { value: 'new', label: 'Yeni' },
  { value: 'like_new', label: 'Sıfır Gibi' },
  { value: 'very_good', label: 'Mükemmel' },
  { value: 'good', label: 'İyi' },
  { value: 'fair', label: 'Orta' },
];

const FALLBACK_SCALES = ['1:18', '1:24', '1:43', '1:64', '1:87'];

const FALLBACK_MATERIALS: MaterialOption[] = [
  { slug: 'diecast', label: 'Diecast (Metal)' },
  { slug: 'resin', label: 'Resin (Reçine)' },
  { slug: 'composite', label: 'Composite (Kompozit)' },
  { slug: 'plastic', label: 'Plastic (Plastik)' },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 1950 + 1 }, (_, i) => currentYear - i);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SellScreen() {
  const {
    isAuthenticated,
    isLoading: authLoading,
    user,
    limits,
    canCreateListing,
    getRemainingListings,
    refreshUserData,
  } = useAuthStore();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
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

  // Manufacturer-scoped extra attributes (e.g. Hot Wheels Segment/Assortment/Wheel Type/...).
  // groupSlug -> selected attribute slugs. Populated only for manufacturers that have scoped groups.
  const [customAttributes, setCustomAttributes] = useState<Record<string, string[]>>({});
  const [manufacturerAttrGroups, setManufacturerAttrGroups] = useState<
    Array<{
      slug: string;
      name: string;
      manufacturerSlug: string | null;
      isRequired: boolean;
      attributes: Array<{ slug: string; label: string; color?: string | null }>;
    }>
  >([]);
  const [showAttrGroupPicker, setShowAttrGroupPicker] = useState<string | null>(null);

  // Loading flags
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [limitsLoading, setLimitsLoading] = useState(true);

  // Listing limits
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

  // Debounce ref for commission preview
  const commissionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Auth gate
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      Alert.alert('Giriş Gerekli', 'İlan oluşturmak için giriş yapmalısınız.', [
        { text: 'Giriş Yap', onPress: () => router.push('/(auth)/login') },
        { text: 'İptal', style: 'cancel' },
      ]);
    }
  }, [isAuthenticated, authLoading]);

  // -----------------------------------------------------------------------
  // Initial data loading
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    fetchCategories();
    fetchFilters();

    refreshUserData().then(() => {
      updateListingLimits();
    });
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (user && limits) updateListingLimits();
  }, [user, limits]);

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
      setCustomAttributes({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/products/attribute-groups', {
          params: { manufacturer: selected.slug },
        });
        if (cancelled) return;
        const groups = (res.data ?? []) as Array<{
          slug: string;
          name: string;
          manufacturerSlug: string | null;
          isRequired: boolean;
          attributes: Array<{ slug: string; label: string; color?: string | null }>;
        }>;
        // Render only scoped groups; global ones (scale, material) have dedicated form fields.
        setManufacturerAttrGroups(groups.filter((g) => g.manufacturerSlug === selected.slug));
        setCustomAttributes({});
      } catch (error) {
        if (__DEV__) console.error('Failed to fetch manufacturer attribute groups:', error);
        if (!cancelled) {
          setManufacturerAttrGroups([]);
          setCustomAttributes({});
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
      Alert.alert('Hata', 'Kategoriler yüklenemedi.');
    }
  };

  const fetchFilters = async () => {
    setBrandsLoading(true);
    try {
      // listingsApi.getFilters yok; web ile aynı: GET /products/filters
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
      Alert.alert('Hata', 'Filtreler yüklenemedi.');
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
      Alert.alert('Hata', 'Modeller yüklenemedi.');
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
      const membershipTier = user?.membershipTier || 'free';
      const count = user?.listingCount || 0;
      const max = limits?.maxListings ?? 10;
      const isPremium = membershipTier === 'premium' || membershipTier === 'business';
      const isUnlimited = max === -1;

      setListingLimits({
        currentCount: count,
        maxListings: isUnlimited ? -1 : max,
        canCreateListing: isUnlimited || count < max,
        isPremium,
        membershipTier,
        remainingListings: isUnlimited ? -1 : max - count,
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
      Alert.alert('Limit', 'Maksimum görsel sayısına ulaştınız.');
      return;
    }

    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('İzin Gerekli', 'Galeri erişim izni gerekiyor.');
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

      // mediaApi.uploadProductImages now expects RNFile[]; bu ekran hâlâ FormData üretiyor → raw axios fallback.
      const res = await api.post('/media/upload/product', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = Array.isArray(res.data) ? res.data : [res.data];

      const newKeys = uploaded.map((r: any) => ({
        cardKey: r.cardKey,
        detailKey: r.detailKey,
      }));
      const newPreviewUrls = uploaded.map(
        (r: any) => r.cardUrl || r.detailUrl || ''
      );

      setImageKeys((prev) => [...prev, ...newKeys]);
      setImageUris((prev) => [
        ...prev,
        ...assets.map((a, i) => newPreviewUrls[i] || a.uri),
      ]);

      Alert.alert('Başarılı', `${newKeys.length} görsel yüklendi.`);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Görsel yükleme başarısız.';
      Alert.alert('Hata', msg);
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

  const BRAND_SLUGS = ['hot-wheels', 'hot-wheels-premium', 'hot-wheels-rlc', 'matchbox', 'tomica', 'majorette', 'maisto', 'bburago', 'welly', 'jada', 'greenlight', 'auto-world', 'mini-gt', 'tarmac-works', 'inno64', 'pop-race'];
  const SCALE_SLUGS = ['scale-118', 'scale-124', 'scale-143', 'scale-164'];
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

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!title || title.length < 5) {
      Alert.alert('Hata', 'Başlık en az 5 karakter olmalıdır.');
      return;
    }
    if (!price || isNaN(Number(price)) || Number(price) < 1) {
      Alert.alert('Hata', 'Geçerli bir fiyat giriniz.');
      return;
    }
    if (!categoryId) {
      Alert.alert('Hata', 'Lütfen bir kategori seçin.');
      return;
    }
    if (listingLimits && !listingLimits.canCreateListing) {
      Alert.alert(
        'Limit Aşıldı',
        `İlan limitinize ulaştınız (${listingLimits.currentCount}/${listingLimits.maxListings}). Üyeliğinizi yükselterek daha fazla ilan oluşturabilirsiniz.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Flatten manufacturer-scoped selections into the flat slug array the API expects.
      const customAttributeSlugs = Object.values(customAttributes).flat().filter(Boolean);

      const payload: Record<string, any> = {
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
        isPreorder: false,
        isSet,
        quantity: quantity ? Number(quantity) : undefined,
        images: imageKeys.length > 0 ? imageKeys : undefined,
        attributes: customAttributeSlugs.length > 0 ? customAttributeSlugs : undefined,
      };

      await productsApi.create(payload);

      Alert.alert('Başarılı', 'İlanınız oluşturuldu! Onay bekliyor.', [
        {
          text: 'Tamam',
          onPress: () => router.push('/(tabs)/profile'),
        },
      ]);

      resetForm();
      await refreshUserData();
      await updateListingLimits();
    } catch (err: any) {
      const msg =
        err.response?.data?.message ??
        err.response?.data?.error ??
        'İlan oluşturulamadı.';
      Alert.alert('Hata', typeof msg === 'string' ? msg : 'İlan oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPrice('');
    setQuantity('');
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

  // -----------------------------------------------------------------------
  // Picker Modal helper
  // -----------------------------------------------------------------------
  const renderPickerModal = ({
    visible,
    onClose,
    title: modalTitle,
    data,
    onSelect,
    selectedId,
    searchValue,
    onSearchChange,
    keyExtractor,
    labelExtractor,
    emptyText,
    loading,
  }: {
    visible: boolean;
    onClose: () => void;
    title: string;
    data: any[];
    onSelect: (item: any) => void;
    selectedId: string;
    searchValue?: string;
    onSearchChange?: (t: string) => void;
    keyExtractor: (item: any) => string;
    labelExtractor: (item: any) => string;
    emptyText?: string;
    loading?: boolean;
  }) => {
    const filtered =
      searchValue !== undefined
        ? data.filter((item) =>
            labelExtractor(item).toLowerCase().includes((searchValue || '').toLowerCase())
          )
        : data;

    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {onSearchChange !== undefined && (
              <TextInput
                style={styles.modalSearch}
                placeholder="Ara..."
                placeholderTextColor={colors.text.subtle}
                value={searchValue}
                onChangeText={onSearchChange}
                autoCorrect={false}
              />
            )}

            {loading ? (
              <ActivityIndicator size="large" color={colors.primary[600]!} style={{ marginTop: 32 }} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => keyExtractor(item)}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.emptyText}>{emptyText || 'Sonuç bulunamadı'}</Text>
                }
                renderItem={({ item }) => {
                  const isSelected = keyExtractor(item) === selectedId;
                  return (
                    <TouchableOpacity
                      style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                      onPress={() => {
                        onSelect(item);
                        onClose();
                      }}
                    >
                      <Text
                        style={[
                          styles.modalItemText,
                          isSelected && styles.modalItemTextSelected,
                        ]}
                      >
                        {labelExtractor(item)}
                      </Text>
                      {isSelected && <Text style={styles.checkMark}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    );
  };

  // -----------------------------------------------------------------------
  // Auth loading / not authenticated
  // -----------------------------------------------------------------------
  if (authLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary[600]!} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.authText}>İlan oluşturmak için giriş yapmalısınız.</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.primaryButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const maxImages = limits?.maxImagesPerListing || 5;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Text style={styles.pageTitle}>Yeni İlan Oluştur</Text>
          <Text style={styles.pageSubtitle}>Ürününüzü koleksiyoncularla buluşturun</Text>

          {/* Listing Limits */}
          {limitsLoading ? (
            <View style={styles.limitsPlaceholder}>
              <ActivityIndicator size="small" color={colors.primary[600]!} />
            </View>
          ) : listingLimits ? (
            <View
              style={[
                styles.limitsCard,
                listingLimits.isPremium
                  ? styles.limitsPremium
                  : listingLimits.canCreateListing
                  ? styles.limitsOk
                  : styles.limitsExceeded,
              ]}
            >
              <View style={styles.limitsRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.limitsTitle,
                      listingLimits.isPremium
                        ? styles.limitsTitlePremium
                        : listingLimits.canCreateListing
                        ? styles.limitsTitleOk
                        : styles.limitsTitleExceeded,
                    ]}
                  >
                    {listingLimits.maxListings === -1
                      ? `Mevcut İlan: ${listingLimits.currentCount} (Sınırsız)`
                      : `İlan Hakkı: ${listingLimits.currentCount} / ${listingLimits.maxListings}`}
                  </Text>
                  {listingLimits.remainingListings !== -1 && (
                    <Text style={styles.limitsRemaining}>
                      Kalan: {listingLimits.remainingListings}
                    </Text>
                  )}
                </View>
                {!listingLimits.canCreateListing && (
                  <TouchableOpacity
                    style={styles.upgradeButton}
                    onPress={() => router.push('/(tabs)/profile')}
                  >
                    <Text style={styles.upgradeButtonText}>Premium'a Geç</Text>
                  </TouchableOpacity>
                )}
              </View>

              {listingLimits.maxListings > 0 && (
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(
                          100,
                          (listingLimits.currentCount / listingLimits.maxListings) * 100
                        )}%`,
                      },
                      listingLimits.canCreateListing
                        ? styles.progressFillOk
                        : styles.progressFillExceeded,
                    ]}
                  />
                </View>
              )}
            </View>
          ) : null}

          {/* ============================================================= */}
          {/* SECTION: Images                                                */}
          {/* ============================================================= */}
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>GÖRSELLER</Text>

            {imageKeys.length < maxImages ? (
              <TouchableOpacity
                style={styles.imageUploadArea}
                onPress={pickImages}
                disabled={uploadingImages}
              >
                {uploadingImages ? (
                  <ActivityIndicator size="small" color={colors.primary[600]!} />
                ) : (
                  <>
                    <Text style={styles.imageUploadIcon}>📷</Text>
                    <Text style={styles.imageUploadLabel}>Görsel yüklemek için dokunun</Text>
                  </>
                )}
                <Text style={styles.imageUploadCount}>
                  {imageKeys.length} / {maxImages} yüklendi
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.imageMaxReached}>
                <Text style={styles.imageMaxReachedText}>
                  Maksimum görsel sayısına ulaştınız
                </Text>
              </View>
            )}

            {imageUris.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.imageRow}
              >
                {imageUris.map((uri, index) => (
                  <View key={`img-${index}`} style={styles.imageThumbWrap}>
                    <Image source={{ uri }} style={styles.imageThumb} />
                    <TouchableOpacity
                      style={styles.imageRemoveBtn}
                      onPress={() => removeImage(index)}
                    >
                      <Text style={styles.imageRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* ============================================================= */}
          {/* SECTION: Basic Info                                            */}
          {/* ============================================================= */}
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>TEMEL BİLGİLER</Text>

            {/* Title */}
            <Text style={styles.label}>
              Başlık <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Örn: Hot Wheels '69 Camaro Z28"
              placeholderTextColor={colors.text.subtle}
              maxLength={200}
            />
            <Text style={styles.charCount}>{title.length}/200</Text>

            {/* Description */}
            <Text style={[styles.label, { marginTop: 16 }]}>Açıklama</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Ürün hakkında detaylı bilgi..."
              placeholderTextColor={colors.text.subtle}
              multiline
              maxLength={5000}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{description.length}/5000</Text>
          </View>

          {/* ============================================================= */}
          {/* SECTION: Product Details                                       */}
          {/* ============================================================= */}
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>ÜRÜN DETAYLARI</Text>

            {/* Category */}
            <Text style={styles.label}>
              Kategori <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => {
                setCategorySearch('');
                setShowCategoryPicker(true);
              }}
            >
              <Text
                style={selectedCategory ? styles.pickerValue : styles.pickerPlaceholder}
              >
                {selectedCategory?.name || 'Kategori Seçin'}
              </Text>
              <Text style={styles.pickerArrow}>›</Text>
            </TouchableOpacity>

            {/* Condition */}
            <Text style={[styles.label, { marginTop: 16 }]}>
              Durum <Text style={styles.required}>*</Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
            >
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[
                    styles.chip,
                    condition === c.value && styles.chipActive,
                  ]}
                  onPress={() => setCondition(c.value)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      condition === c.value && styles.chipTextActive,
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Brand */}
            <Text style={[styles.label, { marginTop: 16 }]}>Marka</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => {
                setBrandSearch('');
                setShowBrandPicker(true);
              }}
              disabled={brandsLoading}
            >
              <Text
                style={selectedBrand ? styles.pickerValue : styles.pickerPlaceholder}
              >
                {brandsLoading
                  ? 'Yükleniyor...'
                  : selectedBrand?.name || 'Marka Seçin'}
              </Text>
              <Text style={styles.pickerArrow}>›</Text>
            </TouchableOpacity>

            {/* Model (dependent on brand) */}
            <Text style={[styles.label, { marginTop: 16 }]}>Model</Text>
            <TouchableOpacity
              style={[styles.pickerButton, !brandId && styles.pickerDisabled]}
              onPress={() => setShowModelPicker(true)}
              disabled={!brandId || modelsLoading}
            >
              <Text
                style={selectedModel ? styles.pickerValue : styles.pickerPlaceholder}
              >
                {!brandId
                  ? 'Önce marka seçin'
                  : modelsLoading
                  ? 'Yükleniyor...'
                  : models.length === 0
                  ? 'Bu markaya ait model yok'
                  : selectedModel?.name || 'Model Seçin'}
              </Text>
              <Text style={styles.pickerArrow}>›</Text>
            </TouchableOpacity>

            {/* Scale */}
            <Text style={[styles.label, { marginTop: 16 }]}>Ölçek</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
            >
              {effectiveScales.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, scale === s && styles.chipActive]}
                  onPress={() => setScale(s)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      scale === s && styles.chipTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Material */}
            <Text style={[styles.label, { marginTop: 16 }]}>Malzeme</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowMaterialPicker(true)}
            >
              <Text
                style={selectedMaterial ? styles.pickerValue : styles.pickerPlaceholder}
              >
                {selectedMaterial?.label || 'Malzeme Seçin'}
              </Text>
              <Text style={styles.pickerArrow}>›</Text>
            </TouchableOpacity>

            {/* Manufacturer */}
            <Text style={[styles.label, { marginTop: 16 }]}>Üretici</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => {
                setManufacturerSearch('');
                setShowManufacturerPicker(true);
              }}
            >
              <Text
                style={
                  selectedManufacturer ? styles.pickerValue : styles.pickerPlaceholder
                }
              >
                {selectedManufacturer?.name || 'Üretici Seçin'}
              </Text>
              <Text style={styles.pickerArrow}>›</Text>
            </TouchableOpacity>

            {/* Year */}
            <Text style={[styles.label, { marginTop: 16 }]}>Çıkış Yılı</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowYearPicker(true)}
            >
              <Text style={year ? styles.pickerValue : styles.pickerPlaceholder}>
                {year || 'Yıl Seçin'}
              </Text>
              <Text style={styles.pickerArrow}>›</Text>
            </TouchableOpacity>

            {/* Manufacturer-scoped extra attribute groups (e.g. Hot Wheels Segment/...) */}
            {manufacturerAttrGroups.map((group) => {
              const selected = customAttributes[group.slug] ?? [];
              const summary =
                selected.length === 0
                  ? `${group.name} seçin`
                  : selected.length === 1
                  ? group.attributes.find((a) => a.slug === selected[0])?.label ?? `1 seçili`
                  : `${selected.length} seçili`;
              return (
                <View key={group.slug}>
                  <Text style={[styles.label, { marginTop: 16 }]}>{group.name}</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowAttrGroupPicker(group.slug)}
                  >
                    <Text
                      style={
                        selected.length > 0
                          ? styles.pickerValue
                          : styles.pickerPlaceholder
                      }
                    >
                      {summary}
                    </Text>
                    <Text style={styles.pickerArrow}>›</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* ============================================================= */}
          {/* SECTION: Options                                               */}
          {/* ============================================================= */}
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>SEÇENEKLER</Text>

            {/* Trade toggle */}
            <View
              style={[
                styles.toggleRow,
                limits?.canTrade ? styles.toggleRowEnabled : styles.toggleRowDisabled,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Takas Aktif</Text>
                <Text style={styles.toggleHint}>
                  {limits?.canTrade
                    ? 'Bu ürünü takas için de açık tutar'
                    : 'Takas özelliği Temel veya üstü üyelik gerektirir'}
                </Text>
              </View>
              {limits?.canTrade ? (
                <Switch
                  value={isTradeEnabled}
                  onValueChange={setIsTradeEnabled}
                  trackColor={{ false: colors.gray[300], true: colors.warning[500]! }}
                  thumbColor={colors.white}
                />
              ) : (
                <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                  <Text style={styles.upgradeLinkText}>Premium →</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Set/Bundle toggle */}
            <View style={[styles.toggleRow, styles.toggleRowDisabled, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Set / Paket</Text>
                <Text style={styles.toggleHint}>
                  Tek ilanda birden fazla model (örn. 5'li paket)
                </Text>
              </View>
              <Switch
                value={isSet}
                onValueChange={setIsSet}
                trackColor={{ false: colors.gray[300], true: colors.info[600]! }}
                thumbColor={colors.white}
              />
            </View>
          </View>

          {/* ============================================================= */}
          {/* SECTION: Pricing                                               */}
          {/* ============================================================= */}
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>FİYATLANDIRMA</Text>

            {/* Price */}
            <Text style={styles.label}>
              Fiyat (₺) <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={colors.text.subtle}
              keyboardType="decimal-pad"
            />

            {/* Quantity */}
            <Text style={[styles.label, { marginTop: 16 }]}>Stok Miktarı</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="Sınırsız"
              placeholderTextColor={colors.text.subtle}
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>Boş bırakırsanız sınırsız stok</Text>

            {/* Commission preview */}
            {(commissionLoading || commissionPreview) && (
              <View style={styles.commissionCard}>
                <Text style={styles.commissionTitle}>Tahmini (satış başına)</Text>
                {commissionLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.text.subtle}
                    style={{ marginTop: 4 }}
                  />
                ) : commissionPreview ? (
                  <View style={styles.commissionRow}>
                    <Text style={styles.commissionFee}>
                      Platform kesintisi: ₺
                      {(commissionPreview.sellerFeeAmount ?? 0).toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                    <Text style={styles.commissionNet}>
                      Net kazanç: ₺
                      {(commissionPreview.sellerNetAmount ?? 0).toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* ============================================================= */}
          {/* Submit                                                          */}
          {/* ============================================================= */}
          <View style={styles.submitRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => router.back()}
            >
              <Text style={styles.cancelButtonText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitButton,
                isSubmitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>İlanı Oluştur</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ================================================================= */}
      {/* MODALS                                                             */}
      {/* ================================================================= */}

      {/* Category picker */}
      {renderPickerModal({
        visible: showCategoryPicker,
        onClose: () => setShowCategoryPicker(false),
        title: 'Kategori Seçin',
        data: flatCategories,
        onSelect: (item: Category) => setCategoryId(item.id),
        selectedId: categoryId,
        searchValue: categorySearch,
        onSearchChange: setCategorySearch,
        keyExtractor: (item: Category) => item.id,
        labelExtractor: (item: Category) => item.name,
        emptyText: 'Kategori bulunamadı',
      })}

      {/* Brand picker */}
      {renderPickerModal({
        visible: showBrandPicker,
        onClose: () => setShowBrandPicker(false),
        title: 'Marka Seçin',
        data: brands,
        onSelect: (item: Brand) => {
          setBrandId(item.id);
          setCarModelId('');
        },
        selectedId: brandId,
        searchValue: brandSearch,
        onSearchChange: setBrandSearch,
        keyExtractor: (item: Brand) => item.id,
        labelExtractor: (item: Brand) => item.name,
        emptyText: 'Marka bulunamadı',
        loading: brandsLoading,
      })}

      {/* Model picker */}
      {renderPickerModal({
        visible: showModelPicker,
        onClose: () => setShowModelPicker(false),
        title: 'Model Seçin',
        data: models,
        onSelect: (item: CarModel) => setCarModelId(item.id),
        selectedId: carModelId,
        keyExtractor: (item: CarModel) => item.id,
        labelExtractor: (item: CarModel) => item.name,
        emptyText: 'Model bulunamadı',
        loading: modelsLoading,
      })}

      {/* Material picker */}
      {renderPickerModal({
        visible: showMaterialPicker,
        onClose: () => setShowMaterialPicker(false),
        title: 'Malzeme Seçin',
        data: effectiveMaterials,
        onSelect: (item: MaterialOption) => setMaterial(item.slug),
        selectedId: material,
        keyExtractor: (item: MaterialOption) => item.slug,
        labelExtractor: (item: MaterialOption) => item.label,
        emptyText: 'Malzeme bulunamadı',
      })}

      {/* Manufacturer picker */}
      {renderPickerModal({
        visible: showManufacturerPicker,
        onClose: () => setShowManufacturerPicker(false),
        title: 'Üretici Seçin',
        data: manufacturerList,
        onSelect: (item: Manufacturer) => setManufacturerId(item.id),
        selectedId: manufacturerId,
        searchValue: manufacturerSearch,
        onSearchChange: setManufacturerSearch,
        keyExtractor: (item: Manufacturer) => item.id,
        labelExtractor: (item: Manufacturer) => item.name,
        emptyText: 'Üretici bulunamadı',
      })}

      {/* Year picker */}
      {renderPickerModal({
        visible: showYearPicker,
        onClose: () => setShowYearPicker(false),
        title: 'Yıl Seçin',
        data: YEAR_OPTIONS,
        onSelect: (item: number) => setYear(String(item)),
        selectedId: year,
        keyExtractor: (item: number) => String(item),
        labelExtractor: (item: number) => String(item),
        emptyText: 'Yıl bulunamadı',
      })}

      {/* Manufacturer-scoped attribute group picker (single-select per group on mobile).
          User can re-open to change selection; clearing is done by selecting the same item again. */}
      {manufacturerAttrGroups.map((group) => {
        const selected = customAttributes[group.slug] ?? [];
        return renderPickerModal({
          visible: showAttrGroupPicker === group.slug,
          onClose: () => setShowAttrGroupPicker(null),
          title: `${group.name} Seçin`,
          data: group.attributes,
          onSelect: (item: { slug: string; label: string }) => {
            setCustomAttributes((prev) => {
              const next = { ...prev };
              const current = next[group.slug] ?? [];
              // Tapping the already-selected single item clears it.
              if (current.length === 1 && current[0] === item.slug) {
                delete next[group.slug];
              } else {
                next[group.slug] = [item.slug];
              }
              return next;
            });
          },
          selectedId: selected[0] ?? '',
          keyExtractor: (item: { slug: string }) => item.slug,
          labelExtractor: (item: { label: string }) => item.label,
          emptyText: 'Sonuç bulunamadı',
        });
      })}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  authText: {
    fontSize: 16,
    color: colors.text.muted,
    marginBottom: 16,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.heading,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 4,
    marginBottom: 16,
  },

  // Limits
  limitsPlaceholder: {
    backgroundColor: colors.gray[200],
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  limitsCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  limitsOk: {
    backgroundColor: colors.success[50]!,
    borderColor: colors.success[200]!,
  },
  limitsExceeded: {
    backgroundColor: colors.danger[50]!,
    borderColor: colors.danger[200]!,
  },
  limitsPremium: {
    backgroundColor: colors.warning[50]!,
    borderColor: colors.warning[200]!,
  },
  limitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  limitsTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  limitsTitleOk: { color: colors.success[800]! },
  limitsTitleExceeded: { color: colors.danger[800]! },
  limitsTitlePremium: { color: colors.warning[800]! },
  limitsRemaining: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  upgradeButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.gray[200],
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressFillOk: { backgroundColor: colors.warning[500]! },
  progressFillExceeded: { backgroundColor: colors.danger[600]! },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
    letterSpacing: 1,
    marginBottom: 14,
  },

  // Labels
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: 6,
  },
  required: {
    color: colors.danger[600]!,
  },
  charCount: {
    fontSize: 11,
    color: colors.text.subtle,
    textAlign: 'right',
    marginTop: 2,
  },
  hint: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: 4,
  },

  // Inputs
  input: {
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text.heading,
    backgroundColor: colors.white,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },

  // Picker button
  pickerButton: {
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  pickerDisabled: {
    backgroundColor: colors.surface.alt,
    opacity: 0.6,
  },
  pickerValue: {
    fontSize: 15,
    color: colors.text.heading,
    flex: 1,
  },
  pickerPlaceholder: {
    fontSize: 15,
    color: colors.text.subtle,
    flex: 1,
  },
  pickerArrow: {
    fontSize: 20,
    color: colors.text.subtle,
    marginLeft: 8,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    marginRight: 8,
    backgroundColor: colors.white,
  },
  chipActive: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  chipText: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.white,
  },

  // Images
  imageUploadArea: {
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.alt,
  },
  imageUploadIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  imageUploadLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.muted,
  },
  imageUploadCount: {
    fontSize: 12,
    color: colors.text.subtle,
    marginTop: 4,
  },
  imageMaxReached: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.success[200]!,
    backgroundColor: colors.success[50]!,
    alignItems: 'center',
  },
  imageMaxReachedText: {
    fontSize: 13,
    color: colors.success[800]!,
  },
  imageRow: {
    marginTop: 12,
  },
  imageThumbWrap: {
    width: 88,
    height: 88,
    marginRight: 10,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  imageThumb: {
    width: '100%',
    height: '100%',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.danger[600]!,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRemoveText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleRowEnabled: {
    backgroundColor: colors.success[50]!,
    borderColor: colors.success[200]!,
  },
  toggleRowDisabled: {
    backgroundColor: colors.surface.alt,
    borderColor: colors.border.DEFAULT,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  toggleHint: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  upgradeLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
  },

  // Commission
  commissionCard: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  commissionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
  },
  commissionRow: {
    marginTop: 6,
  },
  commissionFee: {
    fontSize: 13,
    color: colors.text.muted,
  },
  commissionNet: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success[800]!,
    marginTop: 2,
  },

  // Submit
  submitRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.muted,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.primary[600]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  primaryButton: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay.black50,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.heading,
  },
  modalClose: {
    fontSize: 20,
    color: colors.text.subtle,
    fontWeight: '600',
  },
  modalSearch: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text.heading,
    backgroundColor: colors.surface.alt,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  modalItemSelected: {
    backgroundColor: colors.primary[50]!,
  },
  modalItemText: {
    fontSize: 15,
    color: colors.text.heading,
  },
  modalItemTextSelected: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  checkMark: {
    fontSize: 16,
    color: colors.primary[600]!,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.text.subtle,
    fontSize: 14,
    marginTop: 32,
    marginBottom: 32,
  },
});
