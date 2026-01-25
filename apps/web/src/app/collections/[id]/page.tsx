'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
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
import { collectionsApi, userApi } from '@/lib/api';
import AuthRequiredModal from '@/components/AuthRequiredModal';
import { useTranslation } from '@/i18n/LanguageContext';

interface UserProduct {
  id: string;
  title: string;
  price: number;
  images?: Array<{ url: string } | string>;
}

interface CollectionItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  productPrice: number;
  sortOrder: number;
  isFeatured: boolean;
  addedAt: string;
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

// UUID format checker
const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const collectionIdOrSlug = params.id as string;

  const [collection, setCollection] = useState<Collection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [myProducts, setMyProducts] = useState<UserProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (collectionIdOrSlug) {
      fetchCollection();
    }
  }, [collectionIdOrSlug]);

  const fetchCollection = async () => {
    if (!collectionIdOrSlug) {
      setError(t('collection.invalidLink'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Remove 'collection-' prefix if present (legacy URL format)
      let idOrSlug = collectionIdOrSlug;
      if (idOrSlug.startsWith('collection-')) {
        idOrSlug = idOrSlug.replace('collection-', '');
      }
      
      // Try UUID endpoint first if it looks like a UUID, otherwise try slug
      let response;
      if (isUUID(idOrSlug)) {
        response = await collectionsApi.getOne(idOrSlug);
      } else {
        response = await collectionsApi.getBySlug(idOrSlug);
      }
      const data = response.data.collection || response.data;
      setCollection(data);
      // Set initial like state from API
      if (data.isLiked !== undefined) {
        setIsLiked(data.isLiked);
      }
    } catch (error: any) {
      console.error('Failed to fetch collection:', error);
      const status = error.response?.status;
      if (status === 400) {
        setError(t('collection.invalidLink'));
      } else if (status === 403) {
        setError(t('collection.privateCollection'));
      } else if (status === 404) {
        setError(t('collection.collectionNotFound'));
      } else {
        setError(t('collection.loadFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    if (!collection || !collection.id) {
      toast.error(t('collection.collectionInfoNotFound'));
      return;
    }

    try {
      // Use the actual collection.id (UUID) from the loaded collection object
      // This ensures we always use the correct ID regardless of URL format
      const idToUse = collection.id;
      console.log('Liking collection with ID:', idToUse, 'URL param was:', collectionIdOrSlug);
      const response = await collectionsApi.like(idToUse);
      const { liked, likeCount } = response.data || {};
      
      setIsLiked(liked !== undefined ? liked : !isLiked);
      setCollection({
        ...collection,
        likeCount: likeCount !== undefined ? likeCount : collection.likeCount,
        isLiked: liked !== undefined ? liked : !isLiked,
      });
      toast.success(liked ? t('collection.liked') : t('collection.unliked'));
    } catch (error: any) {
      console.error('Failed to like collection:', error);
      const errorMessage = error?.response?.data?.message || error?.message || t('collection.likeFailed');
      if (error?.response?.status === 404) {
        toast.error(t('collection.collectionNotFound'));
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!collection) return;

    if (!confirm(t('collection.removeProductConfirm'))) {
      return;
    }

    try {
      await collectionsApi.removeItem(collection.id, itemId);
      toast.success(t('collection.productRemoved'));
      fetchCollection();
    } catch (error: any) {
      console.error('Failed to remove item:', error);
      toast.error(t('collection.productRemoveFailed'));
    }
  };

  const fetchMyProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await userApi.getMyProducts();
      const products = response.data.data || response.data.products || [];
      // Filter out products that are already in the collection
      const existingProductIds = collection?.items?.map(item => item.productId) || [];
      const availableProducts = products.filter((p: UserProduct) => !existingProductIds.includes(p.id));
      setMyProducts(availableProducts);
    } catch (error) {
      console.error('Failed to fetch my products:', error);
      toast.error(t('collection.productsLoadFailed'));
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleOpenAddModal = () => {
    setShowAddItemModal(true);
    fetchMyProducts();
  };

  const handleAddItemToCollection = async () => {
    if (selectedProductIds.length === 0 || !collection) {
      toast.error(t('collection.selectItems'));
      return;
    }

    setAddingItem(true);
    try {
      // Add all selected products
      const addPromises = selectedProductIds.map(productId =>
        collectionsApi.addItem(collection.id, { productId })
      );
      await Promise.all(addPromises);
      toast.success(`${selectedProductIds.length} ${t('collection.productsAddedToCollection')}`);
      setShowAddItemModal(false);
      setSelectedProductIds([]);
      fetchCollection();
    } catch (error: any) {
      console.error('Failed to add items:', error);
      toast.error(error.response?.data?.message || t('collection.productsAddFailed'));
    } finally {
      setAddingItem(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  const isOwner = user?.id === collection?.userId;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-64 bg-gray-200 rounded-xl" />
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 rounded-lg" />
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
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <p className="text-gray-600 mb-4">{error || t('collection.collectionNotFound')}</p>
            <Link href="/collections" className="text-primary-500 hover:text-primary-600">
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

  // Sort items: featured first, then by sortOrder
  const sortedItems = collection.items
    ? [...collection.items].sort((a, b) => {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return a.sortOrder - b.sortOrder;
      })
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back Button */}
        <Link
          href="/collections"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          {t('collection.backToCollections')}
        </Link>

        {/* Collection Header */}
        <div className="mb-8">
          {/* Cover Image */}
          <div className="aspect-video bg-gray-700 rounded-xl overflow-hidden mb-6 relative">
            {collection.coverImageUrl ? (
              <Image
                src={collection.coverImageUrl}
                alt={collection.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-6xl">
                🚗
              </div>
            )}
            <div className="absolute top-4 right-4">
              {collection.isPublic ? (
                <span className="px-3 py-1 bg-green-500/80 text-white text-sm rounded-full">
                  {t('collection.isPublic')}
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-600/80 text-white text-sm rounded-full">
                  {t('collection.isPrivate')}
                </span>
              )}
            </div>
          </div>

          {/* Collection Info */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{collection.name}</h1>
              {collection.description && (
                <p className="text-gray-400 text-lg mb-4">{collection.description}</p>
              )}
              <div className="flex items-center gap-6 text-sm text-gray-400">
                <span>@{collection.userName}</span>
                <span className="flex items-center gap-1">
                  <EyeIcon className="w-4 h-4" />
                  {collection.viewCount} {t('collection.views')}
                </span>
                <span className="flex items-center gap-1">
                  <HeartIcon className="w-4 h-4" />
                  {collection.likeCount} {t('collection.likes')}
                </span>
                <span>{collection.itemCount} {t('collection.products')}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {isOwner && collection && (
                <Link
                  href={`/collections/${collectionIdOrSlug}/edit`}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
                >
                  {t('collection.edit')}
                </Link>
              )}
              {!isOwner && (
                <button
                  onClick={handleLike}
                  className={`p-2 rounded-lg transition-colors ${
                    isLiked
                      ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {isLiked ? (
                    <HeartIconSolid className="w-6 h-6" />
                  ) : (
                    <HeartIcon className="w-6 h-6" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Collection Items */}
        {sortedItems.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-700 mb-4 text-lg">{t('collection.noProductsYet')}</p>
            {isOwner && (
              <button
                onClick={handleOpenAddModal}
                className="px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors font-medium"
              >
                {t('collection.addProduct')}
              </button>
            )}
          </div>
        ) : (
          <div>
            {isOwner && (
              <div className="mb-6 flex justify-end">
                <button
                  onClick={handleOpenAddModal}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors flex items-center gap-2"
                >
                  <PlusIcon className="w-5 h-5" />
                  {t('collection.addProduct')}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link
                    href={`/listings/${item.productId}`}
                    className="bg-white rounded-xl overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all block relative shadow-sm border border-gray-200"
                  >
                    {item.isFeatured && (
                      <div className="absolute top-2 left-2 z-10">
                        <span className="px-2 py-1 bg-yellow-500 text-white text-xs rounded-full font-semibold">
                          {t('collection.featured')}
                        </span>
                      </div>
                    )}
                    <div className="aspect-square bg-gray-100 relative">
                      <Image
                        src={getItemImage(item)}
                        alt={item.productTitle}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/400x400/f3f4f6/9ca3af?text=%C3%9Cr%C3%BCn';
                        }}
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-lg mb-2 line-clamp-2 text-gray-900">
                        {item.productTitle}
                      </h3>
                      <p className="text-primary-500 font-bold text-xl">
                        ₺{item.productPrice.toLocaleString('tr-TR')}
                      </p>
                    </div>
                    {isOwner && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleRemoveItem(item.id);
                        }}
                        className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-600 rounded-lg transition-colors z-10"
                      >
                        <TrashIcon className="w-4 h-4 text-white" />
                      </button>
                    )}
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
              <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('collection.addProductToCollection')}</h2>
              
              {loadingProducts ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
                </div>
              ) : myProducts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-700 mb-4">
                    {t('collection.noProductsToAdd')}
                  </p>
                  <Link
                    href="/listings/new"
                    className="text-primary-500 hover:text-primary-600 font-medium"
                    onClick={() => setShowAddItemModal(false)}
                  >
                    {t('collection.createNewListing')} →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      {selectedProductIds.length > 0 
                        ? `${selectedProductIds.length} ${t('collection.productsSelected')}`
                        : t('collection.selectProducts')}
                    </p>
                    {selectedProductIds.length > 0 && (
                      <button
                        onClick={() => setSelectedProductIds([])}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        {t('collection.clearSelection')}
                      </button>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto mb-4 space-y-2">
                    {myProducts.map((product) => {
                      const imageUrl = product.images?.[0]
                        ? typeof product.images[0] === 'string'
                          ? product.images[0]
                          : product.images[0].url
                        : 'https://placehold.co/80x80/374151/9ca3af?text=Ürün';
                      const isSelected = selectedProductIds.includes(product.id);
                      return (
                        <button
                          key={product.id}
                          onClick={() => toggleProductSelection(product.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                            isSelected
                              ? 'bg-primary-50 ring-2 ring-primary-500 border border-primary-200'
                              : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          <div className="relative">
                            <img
                              src={imageUrl}
                              alt={product.title}
                              className="w-16 h-16 rounded-lg object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://placehold.co/80x80/374151/9ca3af?text=Ürün';
                              }}
                            />
                            {isSelected && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-medium text-gray-900 line-clamp-1">{product.title}</p>
                            <p className="text-primary-600 text-sm font-semibold">₺{Number(product.price).toLocaleString('tr-TR')}</p>
                          </div>
                          <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-primary-500 border-primary-500'
                              : 'border-gray-300'
                          }`}>
                            {isSelected && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  
                  <div className="flex gap-3 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setShowAddItemModal(false);
                        setSelectedProductIds([]);
                      }}
                      className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors font-medium"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleAddItemToCollection}
                      disabled={selectedProductIds.length === 0 || addingItem}
                      className="flex-1 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
              
              {(myProducts.length === 0 || loadingProducts) && (
                <button
                  onClick={() => {
                    setShowAddItemModal(false);
                    setSelectedProductIds([]);
                  }}
                  className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors mt-4 font-medium"
                >
                  {t('common.close')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Auth Required Modal for Like */}
        <AuthRequiredModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          title={t('collection.loginToLike')}
          message={t('collection.loginToLikeMsg')}
          icon={<HeartIcon className="w-10 h-10 text-primary-500" />}
          redirectPath={`/collections/${collectionIdOrSlug}`}
        />
      </div>
    </div>
  );
}
