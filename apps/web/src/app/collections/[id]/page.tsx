'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import { motion } from 'framer-motion';
import {
  HeartIcon,
  EyeIcon,
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  HeartIcon as HeartIconSolid,
} from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { collectionsApi, userApi, listingsApi, api } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import dynamic from 'next/dynamic';
import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';
import { useTranslation } from '@/i18n/LanguageContext';

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(() => import('@/components/AuthRequiredModal'), 'AuthRequiredModal'),
  { ssr: false }
);

interface UserProduct {
  id: string;
  title: string;
  price: number;
  images?: Array<{ url: string } | string>;
}

interface CollectionItem {
  id: string;
  productId?: string;
  productTitle: string;
  productImage?: string;
  productPrice?: number;
  productStatus?: string;
  sortOrder: number;
  isFeatured: boolean;
  addedAt: string;
  isCustom: boolean;
  customTitle?: string;
  customDescription?: string;
  customBrand?: string;
  customModel?: string;
  customYear?: number;
  customScale?: string;
  customManufacturer?: string;
  customMaterial?: string;
  customImageUrl?: string;
}

interface Collection {
  id: string;
  userId: string;
  userName: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  items?: CollectionItem[];
  isLiked?: boolean;
  createdAt: string;
  updatedAt: string;
}

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
  const collectionIdOrSlug = params.id as string;

  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [myProducts, setMyProducts] = useState<UserProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [customYear, setCustomYear] = useState<number | ''>('');
  const [customScale, setCustomScale] = useState('');
  const [customManufacturer, setCustomManufacturer] = useState('');
  const [customMaterial, setCustomMaterial] = useState('');
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [customImagePreview, setCustomImagePreview] = useState<string | null>(null);
  const [scaleOptions, setScaleOptions] = useState<string[]>(['1:18', '1:24', '1:43', '1:64', '1:87']);
  const [brandList, setBrandList] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [modelList, setModelList] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [manufacturerList, setManufacturerList] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [materialList, setMaterialList] = useState<Array<{ slug: string; label: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'products' | 'custom'>('products');
  const slugReplacedRef = useRef(false);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const response = await listingsApi.getFilters();
        const data = response.data as {
          scales?: string[];
          brands?: Array<{ id: string; name: string; slug: string }>;
          manufacturers?: Array<{ id: string; name: string; slug: string }>;
          materials?: Array<{ slug: string; label: string }>;
        };
        if (data.scales?.length) setScaleOptions(data.scales);
        if (data.brands?.length) setBrandList(data.brands);
        if (data.manufacturers?.length) setManufacturerList(data.manufacturers);
        if (data.materials?.length) setMaterialList(data.materials);
      } catch {
        // Keep fallback
      }
    };
    fetchFilters();
  }, []);

  useEffect(() => {
    if (customBrand) {
      const selectedBrand = brandList.find((b) => b.name === customBrand);
      if (selectedBrand) {
        setModelsLoading(true);
        api.get(`/car-models?brand=${selectedBrand.slug}`)
          .then((res) => {
            const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
            setModelList(data);
          })
          .catch(() => setModelList([]))
          .finally(() => setModelsLoading(false));
      } else {
        setModelList([]);
      }
    } else {
      setCustomModel('');
      setModelList([]);
    }
  }, [customBrand, brandList]);

  const collectionQuery = useQuery({
    queryKey: ['collection', collectionIdOrSlug],
    queryFn: async (): Promise<Collection> => {
      const idOrSlug = collectionIdOrSlug;
      if (isUUID(idOrSlug)) {
        const response = await collectionsApi.getOne(idOrSlug);
        return response.data.collection || response.data;
      }
      // Slug ile API'ye sor
      const response = await collectionsApi.getBySlug(idOrSlug);
      return response.data.collection || response.data;
    },
    enabled: !!collectionIdOrSlug,
    meta: { page: 'collection-detail' },
  });
  const collection = collectionQuery.data ?? null;
  const isLoading = collectionQuery.isLoading;
  const isLiked = collection?.isLiked ?? false;

  const error = useMemo(() => {
    if (!collectionIdOrSlug) return t('collection.invalidLink');
    if (!collectionQuery.isError) return null;
    const err = collectionQuery.error as any;
    const status = err?.response?.status;
    if (status === 400) return t('collection.invalidLink');
    if (status === 403) return t('collection.privateCollection');
    if (status === 404) return t('collection.collectionNotFound');
    return t('collection.loadFailed');
  }, [collectionIdOrSlug, collectionQuery.isError, collectionQuery.error, t]);

  // Slug ile gelindiyse adres çubuğunu her zaman id ile güncelle (canonical URL)
  useEffect(() => {
    if (!collectionIdOrSlug) return;
    if (isUUID(collectionIdOrSlug)) {
      slugReplacedRef.current = false;
      return;
    }
    if (!collection?.id) return;
    if (slugReplacedRef.current) return;
    slugReplacedRef.current = true;
    queryClient.setQueryData(['collection', collection.id], collection);
    const idPath = `/collections/${collection.id}`;
    router.replace(idPath, { scroll: false });
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.history.replaceState(null, '', idPath);
      });
    }
  }, [collection, collectionIdOrSlug, queryClient, router]);

  const handleLike = async () => {
    if (!isAuthenticated) { setShowAuthModal(true); return; }
    if (!collection?.id) { toast.error(t('collection.collectionInfoNotFound')); return; }
    try {
      await collectionsApi.like(collection.id);
      toast.success(isLiked ? t('collection.unliked') : t('collection.liked'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['collection', collectionIdOrSlug] }),
        queryClient.invalidateQueries({ queryKey: ['collections-liked'] }),
      ]);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || t('collection.likeFailed');
      if (error?.response?.status === 404) toast.error(t('collection.collectionNotFound'));
      else toast.error(errorMessage);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!collection) return;
    if (!confirm(t('collection.removeProductConfirm'))) return;
    try {
      await collectionsApi.removeItem(collection.id, itemId);
      toast.success(t('collection.productRemoved'));
      await queryClient.invalidateQueries({ queryKey: ['collection', collectionIdOrSlug] });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to remove item:', error);
      toast.error(t('collection.productRemoveFailed'));
    }
  };

  const fetchMyProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await userApi.getMyProducts();
      const products = response.data.data || response.data.products || [];
      const existingProductIds = collection?.items?.map(item => item.productId) || [];
      const availableProducts = products.filter((p: UserProduct) => !existingProductIds.includes(p.id));
      setMyProducts(availableProducts);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch my products:', error);
      toast.error(t('collection.productsLoadFailed'));
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleOpenAddModal = () => {
    setShowAddItemModal(true);
    setActiveTab('products');
    fetchMyProducts();
  };

  const handleCustomImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => { setCustomImagePreview(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const handleAddCustomItem = async () => {
    if (!customTitle.trim() || !collection) { toast.error('Ürün ismi zorunludur'); return; }
    setAddingItem(true);
    try {
      await collectionsApi.addItem(collection.id, {
        customTitle: customTitle.trim(),
        customDescription: customDescription.trim() || undefined,
        customBrand: customBrand.trim() || undefined,
        customModel: customModel.trim() || undefined,
        customYear: customYear ? Number(customYear) : undefined,
        customScale: customScale || undefined,
        customManufacturer: customManufacturer.trim() || undefined,
        customMaterial: customMaterial || undefined,
        imageFile: customImageFile || undefined,
      });
      toast.success(t('collection.productsAddedToCollection'));
      setShowAddItemModal(false);
      setCustomTitle(''); setCustomDescription(''); setCustomBrand(''); setCustomModel(''); setCustomYear(''); setCustomScale(''); setCustomManufacturer(''); setCustomMaterial(''); setCustomImageFile(null); setCustomImagePreview(null);
      await queryClient.invalidateQueries({ queryKey: ['collection', collectionIdOrSlug] });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to add custom item:', error);
      toast.error(error.response?.data?.message || t('collection.productsAddFailed'));
    } finally {
      setAddingItem(false);
    }
  };

  const handleAddItemToCollection = async () => {
    if (selectedProductIds.length === 0 || !collection) { toast.error(t('collection.selectItems')); return; }
    setAddingItem(true);
    try {
      const addPromises = selectedProductIds.map(productId => collectionsApi.addItem(collection.id, { productId }));
      await Promise.all(addPromises);
      toast.success(`${selectedProductIds.length} ${t('collection.productsAddedToCollection')}`);
      setShowAddItemModal(false);
      setSelectedProductIds([]);
      await queryClient.invalidateQueries({ queryKey: ['collection', collectionIdOrSlug] });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to add items:', error);
      toast.error(error.response?.data?.message || t('collection.productsAddFailed'));
    } finally {
      setAddingItem(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds(prev => prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]);
  };

  const isOwner = user?.id === collection?.userId;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
            <div className="animate-pulse flex items-center gap-3">
              <div className="w-5 h-5 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded w-32" />
            </div>
          </div>
        </div>
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-6">
          <div className="animate-pulse space-y-6">
            <div className="bg-white rounded border border-gray-200 p-6 flex gap-6">
              <div className="w-48 h-48 bg-gray-200 rounded flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-6 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded border border-gray-100 overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-200" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
            <Link href="/collections" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
              <ArrowLeftIcon className="w-4 h-4" />
              {t('collection.backToCollections')}
            </Link>
          </div>
        </div>
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-6">
          <div className="text-center py-20 bg-white rounded border border-gray-200">
            <p className="text-gray-600 mb-4">{error || t('collection.collectionNotFound')}</p>
            <Link href="/collections" className="text-orange-500 hover:text-orange-600 text-sm font-medium">
              {t('collection.backToCollections')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const getItemImage = (item: CollectionItem) => {
    return item.productImage || 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
  };

  const sortedItems = collection.items
    ? [...collection.items]
        .filter((item) => item.isCustom || !item.productStatus || item.productStatus === 'active')
        .sort((a, b) => {
          if (a.isFeatured && !b.isFeatured) return -1;
          if (!a.isFeatured && b.isFeatured) return 1;
          return a.sortOrder - b.sortOrder;
        })
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-4">
          <Link href="/collections" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
            {t('collection.backToCollections')}
          </Link>
        </div>
      </div>

      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-6">
        {/* Collection Header Card */}
        <div className="mb-6 bg-white rounded border border-gray-200 p-5 relative">
          {!isOwner && (
            <div className="absolute top-4 right-4">
              <button
                onClick={handleLike}
                className={`p-2 rounded transition-colors ${
                  isLiked ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-gray-50 hover:bg-gray-100 text-gray-500'
                }`}
              >
                {isLiked ? <HeartIconSolid className="w-5 h-5" /> : <HeartIcon className="w-5 h-5" />}
              </button>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-5">
            <div className="flex-shrink-0">
              <div className="w-40 h-40 md:w-48 md:h-48 bg-gray-100 rounded overflow-hidden relative">
                {collection.coverImageUrl ? (
                  <OptimizedImage
                    src={collection.coverImageUrl}
                    alt={collection.name}
                    fill
                    className="object-cover"
                    fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Koleksiyon"
                    logContext={{ collectionId: collection.id, page: 'collection-detail-cover' }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 text-4xl">🚗</div>
                )}
                <div className="absolute top-1.5 right-1.5">
                  {collection.isPublic ? (
                    <span className="px-1.5 py-0.5 bg-emerald-500/90 text-white text-[10px] font-medium rounded">{t('collection.isPublic')}</span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-gray-600/90 text-white text-[10px] font-medium rounded">{t('collection.isPrivate')}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <div className="w-1 h-7 bg-orange-500 rounded-sm flex-shrink-0" />
                  {collection.name}
                </h1>
                {collection.description && (
                  <p className="text-gray-500 text-sm mb-3 leading-relaxed">{collection.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                  <span className="font-medium text-gray-600">@{collection.userName}</span>
                  <span className="flex items-center gap-1"><EyeIcon className="w-3.5 h-3.5" />{collection.viewCount} {t('collection.views')}</span>
                  <span className="flex items-center gap-1"><HeartIcon className="w-3.5 h-3.5" />{collection.likeCount} {t('collection.likes')}</span>
                  <span className="font-medium">{collection.itemCount} {t('collection.products')}</span>
                </div>
              </div>

              {isOwner && collection && (
                <div className="flex items-center gap-2 mt-4">
                  <Link
                    href={`/collections/${collection?.id ?? collectionIdOrSlug}/edit`}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                  >
                    {t('collection.edit')}
                  </Link>
                  <button
                    onClick={handleOpenAddModal}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    <PlusIcon className="w-4 h-4" />
                    {t('collection.addProduct')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collection Items */}
        {sortedItems.length === 0 ? (
          <div className="text-center py-20 bg-white rounded border border-gray-200">
            <p className="text-gray-600 mb-4 text-base">{t('collection.noProductsYet')}</p>
            {isOwner && (
              <button onClick={handleOpenAddModal} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors">
                {t('collection.addProduct')}
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {sortedItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <div className="bg-white rounded border border-gray-200 overflow-hidden hover:border-orange-300 hover:shadow-md transition-all relative group">
                    {item.isFeatured && (
                      <div className="absolute top-1.5 left-1.5 z-10">
                        <span className="px-1.5 py-0.5 bg-yellow-500 text-white text-[10px] font-semibold rounded">{t('collection.featured')}</span>
                      </div>
                    )}
                    {item.isCustom && (
                      <div className="absolute top-1.5 right-1.5 z-10">
                        <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-semibold rounded">Koleksiyon</span>
                      </div>
                    )}
                    {(item as any).productStatus === 'sold' && (
                      <div className="absolute top-1.5 left-1.5 z-10">
                        <span className="px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-semibold rounded">
                          {locale === 'en' ? 'SOLD' : 'SATILDI'}
                        </span>
                      </div>
                    )}
                    {item.productId ? (
                      <Link href={`/listings/${item.productId}`} className="block">
                        <div className="aspect-square bg-gray-100 relative overflow-hidden">
                          <OptimizedImage
                            src={getItemImage(item)}
                            alt={item.productTitle}
                            fill
                            className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                            fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
                            logContext={{ itemId: item.id, page: 'collection-detail-linked' }}
                          />
                        </div>
                        <div className="p-2.5">
                          <h3 className="font-medium text-sm line-clamp-2 text-gray-900 group-hover:text-orange-600 transition-colors">{item.productTitle}</h3>
                          {item.productPrice !== undefined && (
                            <p className="text-orange-600 font-bold text-sm mt-1">
                              {item.productPrice.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺
                            </p>
                          )}
                        </div>
                      </Link>
                    ) : (
                      <>
                        <div className="aspect-square bg-gray-100 relative overflow-hidden">
                          <OptimizedImage
                            src={item.customImageUrl || item.productImage || 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün'}
                            alt={item.productTitle}
                            fill
                            className="object-cover"
                            fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
                            logContext={{ itemId: item.id, page: 'collection-detail-custom' }}
                          />
                        </div>
                        <div className="p-2.5">
                          <h3 className="font-medium text-sm line-clamp-2 text-gray-900">{item.productTitle}</h3>
                          {item.customBrand && (
                            <p className="text-gray-500 text-xs mt-0.5">{item.customBrand}{item.customModel && ` · ${item.customModel}`}</p>
                          )}
                          {item.customYear && (
                            <p className="text-gray-400 text-[10px] mt-0.5">{item.customYear}{item.customScale && ` · ${item.customScale}`}</p>
                          )}
                        </div>
                      </>
                    )}
                    {isOwner && (
                      <button
                        onClick={(e) => { e.preventDefault(); handleRemoveItem(item.id); }}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-red-500/80 hover:bg-red-600 rounded transition-colors z-10 opacity-0 group-hover:opacity-100"
                      >
                        <TrashIcon className="w-3.5 h-3.5 text-white" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
            <h2 className="text-lg font-bold mb-4 text-gray-900">{t('collection.addProductToCollection')}</h2>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 rounded p-0.5">
              <button
                onClick={() => setActiveTab('products')}
                className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  activeTab === 'products' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                İlanlarım
              </button>
              <button
                onClick={() => setActiveTab('custom')}
                className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  activeTab === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Custom Ürün
              </button>
            </div>

            {activeTab === 'products' && (
              <>
                {loadingProducts ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
                  </div>
                ) : myProducts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 mb-3 text-sm">{t('collection.noProductsToAdd')}</p>
                    <Link href="/listings/new" className="text-orange-500 hover:text-orange-600 text-sm font-medium" onClick={() => setShowAddItemModal(false)}>
                      {t('collection.createNewListing')} →
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        {selectedProductIds.length > 0
                          ? `${selectedProductIds.length} ${t('collection.productsSelected')}`
                          : t('collection.selectProducts')}
                      </p>
                      {selectedProductIds.length > 0 && (
                        <button onClick={() => setSelectedProductIds([])} className="text-xs text-orange-600 hover:text-orange-700 font-medium">
                          {t('collection.clearSelection')}
                        </button>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto mb-4 space-y-1.5">
                      {myProducts.map((product) => {
                        const img0 = product.images?.[0];
                        const imageUrl = img0
                          ? (typeof img0 === 'string' ? img0 : (img0 as any).cardUrl ?? (img0 as any).detailUrl ?? (img0 as any).url)
                          : 'https://placehold.co/80x80/374151/9ca3af?text=Ürün';
                        const isSelected = selectedProductIds.includes(product.id);
                        return (
                          <button
                            key={product.id}
                            onClick={() => toggleProductSelection(product.id)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded transition-colors ${
                              isSelected ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 hover:bg-gray-100 border border-gray-100'
                            }`}
                          >
                            <div className="relative">
                              <img
                                src={imageUrl}
                                alt={product.title}
                                className="w-12 h-12 rounded object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/80x80/374151/9ca3af?text=Ürün'; }}
                              />
                              {isSelected && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className="font-medium text-gray-900 text-sm line-clamp-1">{product.title}</p>
                              <p className="text-orange-600 text-xs font-semibold">{getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-3 pt-3 border-t border-gray-200">
                      <button
                        onClick={() => { setShowAddItemModal(false); setSelectedProductIds([]); }}
                        className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleAddItemToCollection}
                        disabled={selectedProductIds.length === 0 || addingItem}
                        className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingItem
                          ? `${t('common.adding')} (${selectedProductIds.length})`
                          : selectedProductIds.length > 0
                            ? `${selectedProductIds.length} ${t('collection.addProduct')}`
                            : t('common.add')}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {activeTab === 'custom' && (
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 font-medium">İsim <span className="text-red-500">*</span></label>
                    <input type="text" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400" placeholder="Ürün ismi" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 font-medium">Resim</label>
                    <input type="file" accept="image/*" onChange={handleCustomImageChange}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400" />
                    {customImagePreview && (
                      <div className="mt-2"><img src={customImagePreview} alt="Preview" className="w-24 h-24 object-cover rounded" /></div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 font-medium">Açıklama</label>
                    <textarea value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400" placeholder="Açıklama" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Marka</label>
                      <select value={customBrand} onChange={(e) => { setCustomBrand(e.target.value); setCustomModel(''); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400">
                        <option value="">Marka seçin</option>
                        {brandList.map((b) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Model</label>
                      <select value={customModel} onChange={(e) => setCustomModel(e.target.value)}
                        disabled={!customBrand || modelsLoading}
                        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400 disabled:opacity-50">
                        <option value="">{modelsLoading ? 'Yükleniyor...' : 'Model seçin'}</option>
                        {modelList.map((m) => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Yıl</label>
                      <input type="number" value={customYear} onChange={(e) => setCustomYear(e.target.value ? parseInt(e.target.value) : '')} min="1900" max="2100"
                        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400" placeholder="Yıl" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Ölçek</label>
                      <select value={customScale} onChange={(e) => setCustomScale(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400">
                        <option value="">Seçiniz</option>
                        {scaleOptions.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Üretici</label>
                      <select value={customManufacturer} onChange={(e) => setCustomManufacturer(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400">
                        <option value="">Üretici seçin</option>
                        {manufacturerList.map((m) => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Malzeme</label>
                      <select value={customMaterial} onChange={(e) => setCustomMaterial(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400">
                        <option value="">Malzeme seçin</option>
                        {(materialList.length > 0 ? materialList : [
                          { slug: 'diecast', label: 'Diecast (Metal)' },
                          { slug: 'resin', label: 'Resin (Reçine)' },
                          { slug: 'composite', label: 'Composite (Kompozit)' },
                          { slug: 'plastic', label: 'Plastic (Plastik)' },
                        ]).map((m) => (
                          <option key={m.slug} value={m.slug}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 mt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowAddItemModal(false);
                      setCustomTitle(''); setCustomDescription(''); setCustomBrand(''); setCustomModel(''); setCustomYear(''); setCustomScale(''); setCustomManufacturer(''); setCustomMaterial(''); setCustomImageFile(null); setCustomImagePreview(null);
                    }}
                    className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleAddCustomItem}
                    disabled={!customTitle.trim() || addingItem}
                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingItem ? t('common.adding') : t('common.add')}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'products' && (myProducts.length === 0 || loadingProducts) && (
              <button
                onClick={() => { setShowAddItemModal(false); setSelectedProductIds([]); }}
                className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors mt-4"
              >
                {t('common.close')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={t('collection.loginToLike')}
        message={t('collection.loginToLikeMsg')}
        icon={<HeartIcon className="w-10 h-10 text-orange-500" />}
        redirectPath={collection?.id ? `/collections/${collection.id}` : `/collections/${collectionIdOrSlug}`}
      />
    </div>
  );
}
