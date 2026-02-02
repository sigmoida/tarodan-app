'use client';

import { useState, useEffect } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import OptimizedImage, { getOptimizedImageUrl } from '@/components/OptimizedImage';
import {
  ArrowRightIcon,
  HandThumbUpIcon,
  StarIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/solid';
import { api, listingsApi } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
import { useAuthStore } from '@/stores/authStore';
import dynamic from 'next/dynamic';
import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(() => import('@/components/AuthRequiredModal'), 'AuthRequiredModal'),
  { ssr: false }
);
import { RectangleStackIcon, PlusCircleIcon, ChevronLeftIcon, ChevronRightIcon, ArrowPathIcon, TagIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import ProductLayoutSelector, { ProductLayout } from '@/components/ProductLayoutSelector';

// New professional homepage components
import HeroSlider from '@/components/home/HeroSlider';
import TrustBadges from '@/components/home/TrustBadges';
import ManufacturersSlider from '@/components/home/ManufacturersSlider';

interface Category {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
}

interface Product {
  id: string;
  title: string;
  price: number;
  oldPrice?: number | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  discountPercent?: number | null;
  images?: Array<{ id?: string; url: string; sortOrder?: number }> | string[];
  brand?: string;
  scale?: string;
  isTradeEnabled?: boolean;
  trade_available?: boolean;
  viewCount: number;
  likeCount: number;
  createdAt?: string;
  condition?: string;
  rating?: {
    average: number | null;
    count: number;
  };
}

interface Collection {
  id: string;
  name: string;
  description?: string;
  userId: string;
  userName: string;
  coverImageUrl?: string;
  itemCount: number;
  likeCount: number;
  items?: Array<{
    id: string;
    productId: string;
    productTitle: string;
    productPrice: number;
    productImage?: string;
  }>;
}

interface Seller {
  id: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  rating?: number;
  totalRatings?: number;
  isVerified?: boolean;
  products?: Product[];
}

interface FeaturedCollector {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    isVerified?: boolean;
  };
  items: Array<{
    id: string;
    productId: string;
    productTitle: string;
    productPrice: number;
    productImage?: string;
  }>;
}

interface FeaturedBusiness {
  id: string;
  displayName: string;
  companyName?: string;
  avatarUrl?: string;
  bio?: string;
  isVerified: boolean;
  stats: {
    totalProducts: number;
    totalViews: number;
    totalLikes: number;
    totalSales: number;
    averageRating: number;
    totalRatings: number;
  };
  collections: Array<{
    id: string;
    name: string;
    viewCount: number;
    likeCount: number;
    coverImageUrl?: string;
    itemCount: number;
    previewItems: Array<{
      id: string;
      productTitle: string;
      productPrice: number;
      productImage?: string;
    }>;
  }>;
  products: Array<{
    id: string;
    title: string;
    price: number;
    viewCount: number;
    likeCount: number;
    image?: string;
  }>;
}

const BRANDS = [
  { name: 'Hot Wheels', logo: '🔥' },
  { name: 'Matchbox', logo: '📦' },
  { name: 'Tamiya', logo: '🏎️' },
  { name: 'AUTOart', logo: '🎨' },
  { name: 'Kyosho', logo: '🇯🇵' },
  { name: 'Maisto', logo: '🚗' },
  { name: 'Bburago', logo: '🇮🇹' },
  { name: 'Greenlight', logo: '💚' },
];

const SCALES = ['1:8 Diecast', '1:12 Diecast', '1:18 Diecast', '1:24 Diecast', '1:32 Diecast', '1:36 Diecast', '1:43 Diecast', '1:64 Diecast'];

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
  const [currentPage, setCurrentPage] = useState(0);
  const [discountedProducts, setDiscountedProducts] = useState<Product[]>([]);
  const [isLoadingDiscounted, setIsLoadingDiscounted] = useState(false);
  const [currentCollectionIndex, setCurrentCollectionIndex] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({
    title: t('auth.authRequired'),
    message: t('auth.authRequiredMessage'),
    icon: null as React.ReactNode | null,
    redirectPath: undefined as string | undefined,
  });
  const [productLayout, setProductLayout] = useState<ProductLayout>('grid-4');

  const { data: topCollections = [] } = useQuery({
    queryKey: ['home', 'topCollections', { limit: 20 }],
    queryFn: async () => {
      const response = await api.get<FeaturedCollector[]>('/users/top-collections', { params: { limit: 20 } });
      return Array.isArray(response.data) ? response.data : [];
    },
    meta: { page: 'home', section: 'topCollections' },
  });

  const {
    data: bestSellersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingBestSellers,
  } = useInfiniteQuery({
    queryKey: ['home', 'bestSellers', { sortBy: 'viewCount', sortOrder: 'desc', status: 'active' }],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await listingsApi.getAll({
        limit: 20,
        page: pageParam,
        sortBy: 'viewCount',
        sortOrder: 'desc',
        status: 'active',
      });
      const products = response.data.data || response.data.products || [];
      return Array.isArray(products) ? products : [];
    },
    getNextPageParam: (_lastPage, allPages) => {
      if (_lastPage.length < 20) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
    meta: { page: 'home', section: 'bestSellers' },
  });
  const bestSellers = bestSellersData?.pages.flatMap((p) => p) ?? [];

  const { data: companyOfWeek = null } = useQuery({
    queryKey: ['home', 'featuredBusiness'],
    queryFn: async () => {
      const response = await api.get<FeaturedBusiness | null>('/users/featured-business');
      return response.data ?? null;
    },
    meta: { page: 'home', section: 'featuredBusiness' },
  });



  useEffect(() => {
    fetchDiscountedProducts();
  }, []);

  const fetchDiscountedProducts = async () => {
    setIsLoadingDiscounted(true);
    try {
      const response = await listingsApi.getAll({
        limit: 12,
        page: 1,
        discountOnly: true,
        status: 'active'
      });
      const products = response.data.data || response.data.products || [];
      setDiscountedProducts(Array.isArray(products) ? products : []);
    } catch (error) {
      console.error('Failed to fetch discounted products:', error);
    } finally {
      setIsLoadingDiscounted(false);
    }
  };

  // Auto-rotate collections every 10 seconds
  useEffect(() => {
    if (topCollections.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentCollectionIndex((prev) => (prev + 1) % topCollections.length);
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [topCollections.length]);

  const handleNextPage = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    const itemsPerPage = 5;
    const currentIndex = nextPage * itemsPerPage;
    // Load more if we're near the end (React Query infinite)
    if (currentIndex + itemsPerPage >= bestSellers.length && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextCollection = () => {
    if (topCollections.length > 0) {
      setCurrentCollectionIndex((prev) => (prev + 1) % topCollections.length);
    }
  };

  const handlePrevCollection = () => {
    if (topCollections.length > 0) {
      setCurrentCollectionIndex((prev) => (prev - 1 + topCollections.length) % topCollections.length);
    }
  };

  const getImageUrl = (image: any): string => {
    const placeholder = locale === 'en' ? 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Product' : 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
    if (!image) return placeholder;
    if (typeof image === 'string') return image;
    return image.url || placeholder;
  };

  const getProductTag = (product: Product): string | null => {
    const daysSinceCreation = product.createdAt
      ? Math.floor((new Date().getTime() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 100;

    if (daysSinceCreation < 7) return locale === 'en' ? 'New' : 'Yeni';
    if (product.viewCount && product.viewCount > 1000) return locale === 'en' ? 'Rare' : 'Nadir';
    return null;
  };

  const extractBrandFromTitle = (title: string): string => {
    const brandNames = BRANDS.map(b => b.name);
    for (const brand of brandNames) {
      if (title.toLowerCase().includes(brand.toLowerCase())) {
        return brand;
      }
    }
    return locale === 'en' ? 'Brand' : 'Marka';
  };

  const extractScaleFromTitle = (title: string): string => {
    const scalePattern = /\d+:\d+/;
    const scaleMatch = title.match(scalePattern);
    if (scaleMatch) return scaleMatch[0];
    return '1:18';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative bg-white text-orange-500 py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-white opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(249,115,22,0.1)_0%,transparent_70%)]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-orange-500">
                {locale === 'en' ? (
                  <>Turkey's Largest<br />Diecast Marketplace</>
                ) : (
                  <>Türkiye'nin en büyük<br />Diecast pazaryeri</>
                )}
              </h1>
              <p className="text-lg md:text-xl text-gray-700 mb-8 max-w-xl">
                {locale === 'en'
                  ? 'Buy, sell, and trade diecast models. Create your Digital Garage and showcase your collection.'
                  : 'Diecast modelleri satın alın, satın ve takas edin. Dijital Garajınızı oluşturun ve koleksiyonunuzu sergileyin.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                {isAuthenticated ? (
                  <>
                    <Link
                      href="/listings/new"
                      className="bg-orange-500 text-white px-8 py-4 rounded-xl font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 border-2 border-orange-500 shadow-lg"
                    >
                      <span className="text-xl">+</span>
                      {t('nav.newListing')}
                    </Link>
                    <Link
                      href="/collections"
                      className="bg-transparent text-orange-500 px-8 py-4 rounded-xl font-semibold hover:bg-orange-50 transition-colors flex items-center justify-center gap-2 border-2 border-orange-500"
                    >
                      {t('collection.createCollection')}
                    </Link>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setAuthModalConfig({
                          title: t('nav.loginToCreateListing'),
                          message: t('nav.loginToCreateListingMsg'),
                          icon: <PlusCircleIcon className="w-10 h-10 text-primary-500" />,
                          redirectPath: '/listings/new',
                        });
                        setShowAuthModal(true);
                      }}
                      className="bg-orange-500 text-white px-8 py-4 rounded-xl font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 border-2 border-orange-500 shadow-lg"
                    >
                      <span className="text-xl">+</span>
                      {t('nav.newListing')}
                    </button>
                    <button
                      onClick={() => {
                        setAuthModalConfig({
                          title: t('collection.createCollection'),
                          message: locale === 'en' ? 'Please login to create your digital garage and showcase your collection.' : 'Dijital garajınızı oluşturmak ve koleksiyonunuzu sergilemek için giriş yapmanız gerekiyor.',
                          icon: <RectangleStackIcon className="w-10 h-10 text-primary-500" />,
                          redirectPath: '/collections/new',
                        });
                        setShowAuthModal(true);
                      }}
                      className="bg-transparent text-orange-500 px-8 py-4 rounded-xl font-semibold hover:bg-orange-50 transition-colors flex items-center justify-center gap-2 border-2 border-orange-500"
                    >
                      {t('collection.createCollection')}
                    </button>
                  </>
                )}
                <Link
                  href="/listings"
                  className="bg-transparent text-orange-500 px-8 py-4 rounded-xl font-semibold hover:bg-orange-50 transition-colors flex items-center justify-center gap-2 border-2 border-orange-500"
                >
                  Pazaryerini incele
                </Link>
              </div>
            </motion.div>

            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative h-64 md:h-96"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/50 to-transparent rounded-3xl backdrop-blur-sm" />
              <div className="relative h-full bg-orange-50 rounded-3xl flex items-center justify-center border-2 border-orange-200">
                <div className="text-8xl md:text-9xl">🚗</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Markalar Section */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-orange-500 rounded"></div>
              <h2 className="text-2xl md:text-3xl font-bold">{locale === 'en' ? 'Brands' : 'Markalar'}</h2>
            </div>
            <Link
              href="/listings"
              className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
            >
              {locale === 'en' ? 'View All' : 'Tümünü gör'} <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
            {BRANDS.map((brand) => (
              <Link
                key={brand.name}
                href={`/listings?brand=${encodeURIComponent(brand.name)}`}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <span className="text-3xl mb-2">{brand.logo}</span>
                <span className="text-xs text-center text-gray-700 font-medium">{brand.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Section Divider - Gradient Line */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-orange-400/60 to-transparent my-0"></div>

      {/* Boyut (Scale) Section */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-orange-500 rounded"></div>
              <h2 className="text-2xl md:text-3xl font-bold">{locale === 'en' ? 'Scale' : 'Boyut'}</h2>
            </div>
            <Link
              href="/listings"
              className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
            >
              {locale === 'en' ? 'View All' : 'Tümünü gör'} <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>

          <div className="flex flex-wrap gap-3">
            {SCALES.map((scale) => {
              const scaleValue = scale.match(/\d+:\d+/)?.[0];
              return (
                <Link
                  key={scale}
                  href={`/listings?scale=${scaleValue}`}
                  className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors font-medium"
                >
                  {scale}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section Divider - Gradient Line */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-orange-400/60 to-transparent my-0"></div>



      {/* İndirimdekiler Section - Popüler ilanların üstünde */}
      <section className="py-12 bg-gradient-to-br from-red-50/80 to-orange-50/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-red-500 rounded"></div>
              <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <TagIcon className="w-7 h-7 text-red-500" />
                {locale === 'en' ? 'On Sale' : 'İndirimdekiler'}
              </h2>
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                {locale === 'en' ? 'Deals' : 'Fırsat'}
              </span>
            </div>
            <Link
              href="/listings?discountOnly=true"
              className="text-red-600 font-semibold hover:text-red-700 flex items-center gap-1"
            >
              {locale === 'en' ? 'View All' : 'Tümünü gör'} <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
          <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-4 min-w-0 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {isLoadingDiscounted ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[180px] sm:w-auto bg-white rounded-xl overflow-hidden animate-pulse border border-gray-100">
                    <div className="aspect-square bg-gray-200" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                      <div className="h-5 bg-gray-200 rounded w-1/3" />
                    </div>
                  </div>
                ))
              ) : discountedProducts.length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-500">
                  {locale === 'en' ? 'No products on sale at the moment.' : 'Şu an indirimde ürün bulunmuyor.'}
                </div>
              ) : (
                discountedProducts.slice(0, 6).map((product) => (
                  <Link key={product.id} href={`/listings/${product.id}`} className="flex-shrink-0 w-[180px] sm:w-auto block">
                    <div className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-0.5 border border-gray-100">
                      <div className="relative aspect-square bg-gray-100">
                        <Image
                          src={getImageUrl(product.images?.[0])}
                          alt={product.title}
                          fill
                          className="object-cover"
                          unoptimized
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
                          }}
                        />
                        <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-md">
                          %{product.discountPercent ?? (isProductOnSaleDisplay(product) ? Math.round((1 - getProductEffectivePrice(product) / getProductOriginalPriceForDisplay(product)) * 100) : 0)} {locale === 'en' ? 'OFF' : 'İndirim'}
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-gray-900 line-clamp-2 text-sm mb-1.5">
                          {product.title}
                        </h3>
                        {isProductOnSaleDisplay(product) && (
                          <span className="text-xs text-gray-400 line-through block">
                            {getProductOriginalPriceForDisplay(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                          </span>
                        )}
                        <p className="text-base font-bold text-red-600">
                          {getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                        </p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section Divider - Gradient Line */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-orange-400/60 to-transparent my-0"></div>

      {/* Popüler İlanlar Section */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-orange-500 rounded"></div>
              <h2 className="text-2xl md:text-3xl font-bold">{locale === 'en' ? 'Popular Listings' : 'Popüler İlanlar'}</h2>
            </div>
            <div className="flex items-center gap-4">
              <ProductLayoutSelector
                layout={productLayout}
                onLayoutChange={setProductLayout}
                storageKey="homepage-product-layout"
              />
              <Link
                href="/listings?sortBy=viewCount"
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
              >
                {locale === 'en' ? 'View All' : 'Tümünü gör'} <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className={
            productLayout === 'grid-3'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
              : productLayout === 'grid-4'
                ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'
                : productLayout === 'grid-6'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
                  : 'space-y-4'
          }>
            {bestSellers.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-500">
                {locale === 'en' ? 'Loading products...' : 'Ürünler yükleniyor...'}
              </div>
            ) : productLayout === 'list' ? (
              bestSellers.map((product, index) => {
                const tag = getProductTag(product);
                return (
                  <Link key={product.id} href={`/listings/${product.id}`}>
                    <div className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-all border border-gray-100 flex gap-4 p-4">
                      <div className="relative w-32 h-32 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                        <OptimizedImage
                          src={getImageUrl(product.images?.[0])}
                          alt={product.title}
                          fill
                          className="object-cover"
                          fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
                          logContext={{ productId: product.id, page: 'home-list' }}
                          priority={index === 0}
                        />
                        {tag && (
                          <div className="absolute top-2 right-2">
                            <span className={`text-white text-xs px-2 py-1 rounded-full font-semibold ${tag === 'İndirim' ? 'bg-red-500' : tag === 'Yeni' ? 'bg-green-500' : 'bg-purple-500'
                              }`}>
                              {tag}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2 group-hover:text-primary-500 transition-colors">
                            {product.title}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                            {(product.viewCount !== undefined && product.viewCount > 0) && (
                              <div className="flex items-center gap-1">
                                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>{product.viewCount}</span>
                              </div>
                            )}
                            {(product.likeCount !== undefined && product.likeCount > 0) && (
                              <div className="flex items-center gap-1">
                                <HandThumbUpIcon className="w-4 h-4 text-orange-500" />
                                <span>{product.likeCount}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            {isProductOnSaleDisplay(product) && (
                              <p className="text-sm text-gray-400 line-through">
                                {getProductOriginalPriceForDisplay(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                              </p>
                            )}
                            <p className="text-primary-500 font-bold text-lg">
                              {formatPrice(getProductEffectivePrice(product))}
                            </p>
                          </div>
                          {product.rating && product.rating.average !== null && product.rating.count > 0 && (
                            <div className="flex items-center gap-1">
                              <StarIcon className="w-4 h-4 text-yellow-400" />
                              <span className="text-sm font-semibold">{product.rating.average.toFixed(1)}</span>
                              <span className="text-xs text-gray-500">({product.rating.count})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              bestSellers.map((product, index) => {
                const tag = getProductTag(product);
                return (
                  <Link key={product.id} href={`/listings/${product.id}`}>
                    <div className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="relative aspect-square bg-gray-100">
                        <OptimizedImage
                          src={getImageUrl(product.images?.[0])}
                          alt={product.title}
                          fill
                          className="object-cover"
                          fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
                          logContext={{ productId: product.id, page: 'home-grid' }}
                          priority={index === 0}
                        />
                        {/* View & Like Stats */}
                        <div className="absolute top-3 left-3 flex items-center gap-2">
                          {(product.viewCount !== undefined && product.viewCount > 0) && (
                            <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                              <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span className="text-xs font-semibold">{product.viewCount}</span>
                            </div>
                          )}
                          {(product.likeCount !== undefined && product.likeCount > 0) && (
                            <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                              <HandThumbUpIcon className="w-3.5 h-3.5 text-orange-500" />
                              <span className="text-xs font-semibold">{product.likeCount}</span>
                            </div>
                          )}
                        </div>
                        {tag && (
                          <div className="absolute top-3 right-3">
                            <span className={`text-white text-xs px-2 py-1 rounded-full font-semibold ${tag === 'İndirim' ? 'bg-red-500' : tag === 'Yeni' ? 'bg-green-500' : 'bg-purple-500'
                              }`}>
                              {tag}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-gray-900 line-clamp-2 text-sm group-hover:text-primary-500 transition-colors">
                          {product.title}
                        </h3>
                        {isProductOnSaleDisplay(product) && (
                          <p className="text-xs text-gray-400 line-through mt-0.5">
                            {getProductOriginalPriceForDisplay(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                          </p>
                        )}
                        <p className="text-primary-500 font-bold mt-1">
                          {formatPrice(getProductEffectivePrice(product))}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Section Divider - Gradient Line */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-orange-400/60 to-transparent my-0"></div>



      {/* En İyi Koleksiyonlar Section */}
      {topCollections.length > 0 && (
        <section className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-orange-500 rounded"></div>
                <h2 className="text-2xl md:text-3xl font-bold">{locale === 'en' ? 'Top Collections' : 'En İyi Koleksiyonlar'}</h2>
              </div>
              <Link
                href="/collections"
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
              >
                {locale === 'en' ? 'View All' : 'Tümünü gör'} <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>

            {/* Carousel Container */}
            <div className="relative">
              {/* Navigation Buttons */}
              {topCollections.length > 1 && (
                <>
                  <button
                    onClick={handlePrevCollection}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center transition-all hover:bg-orange-500 hover:text-white text-orange-500"
                    aria-label="Previous"
                  >
                    <ChevronLeftIcon className="w-6 h-6" />
                  </button>

                  <button
                    onClick={handleNextCollection}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center transition-all hover:bg-orange-500 hover:text-white text-orange-500"
                    aria-label="Next"
                  >
                    <ChevronRightIcon className="w-6 h-6" />
                  </button>
                </>
              )}

              {/* Collections Carousel */}
              <div className="overflow-hidden px-14">
                <div
                  className="flex transition-transform duration-500 ease-in-out gap-6"
                  style={{
                    transform: `translateX(calc(-${currentCollectionIndex * 100}% - ${currentCollectionIndex * 1.5}rem))`
                  }}
                >
                  {topCollections.map((collection) => (
                    <div key={collection.id} className="flex-shrink-0 w-full">
                      <div className="bg-gray-50 rounded-2xl p-6 md:p-8">
                        <div className="grid md:grid-cols-4 gap-6">
                          {/* Collector Profile */}
                          <div className="md:col-span-1">
                            <div className="flex flex-col items-center md:items-start">
                              {collection.user?.avatarUrl ? (
                                <OptimizedImage
                                  src={collection.user.avatarUrl}
                                  alt={collection.user.displayName}
                                  width={80}
                                  height={80}
                                  className="rounded-full mb-4 object-cover"
                                  logContext={{ userId: collection.user?.id, page: 'home-collection-avatar' }}
                                />
                              ) : (
                                <div className="w-20 h-20 rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-bold mb-4">
                                  {collection.user?.displayName?.charAt(0).toUpperCase() || '?'}
                                </div>
                              )}
                              <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                                {collection.user?.displayName || (locale === 'en' ? 'Collector' : 'Koleksiyoner')}
                                {collection.user?.isVerified && (
                                  <CheckBadgeIcon className="w-5 h-5 text-green-500" />
                                )}
                              </h3>
                              <p className="text-base text-orange-600 font-medium mb-2">{collection.name}</p>
                              <p className="text-sm text-gray-600 mb-4 text-center md:text-left">
                                {collection.description || (locale === 'en' ? `${collection.itemCount || 0} items collection` : `${collection.itemCount || 0} araçlık koleksiyon`)}
                              </p>
                              <div className="flex items-center gap-4 mb-4">
                                <div className="flex items-center gap-1 text-blue-500">
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                  </svg>
                                  <span className="font-semibold">{collection.viewCount?.toLocaleString() || 0}</span>
                                </div>
                                <div className="flex items-center gap-1 text-red-500">
                                  <HandThumbUpIcon className="w-5 h-5" />
                                  <span className="font-semibold">{collection.likeCount?.toLocaleString() || 0}</span>
                                </div>
                              </div>
                              <Link
                                href={`/collections/${collection.id}`}
                                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
                              >
                                {locale === 'en' ? 'View Collection' : 'Koleksiyonu incele'} <ArrowRightIcon className="w-4 h-4" />
                              </Link>
                            </div>
                          </div>

                          {/* Featured Products */}
                          <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {collection.items?.slice(0, 3).map((item) => (
                              <Link key={item.id} href={item.productId ? `/listings/${item.productId}` : '#'}>
                                <div className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                                  <div className="relative aspect-square bg-gray-100">
                                    <OptimizedImage
                                      src={getImageUrl(item.productImage)}
                                      alt={item.productTitle}
                                      fill
                                      className="object-cover"
                                      fallbackSrc={`https://placehold.co/400x400/f3f4f6/9ca3af?text=${locale === 'en' ? 'Product' : 'Ürün'}`}
                                      logContext={{ itemId: item.id, page: 'home-collection-item' }}
                                    />
                                  </div>
                                  <div className="p-4">
                                    <h4 className="font-semibold text-sm mb-1 line-clamp-2">{item.productTitle}</h4>
                                    {item.productPrice && (
                                      <p className="text-lg font-bold text-orange-500">
                                        {formatPrice(item.productPrice)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Collection Indicators */}
              {topCollections.length > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  {topCollections.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentCollectionIndex(index)}
                      className={`w-2 h-2 rounded-full transition-all ${index === currentCollectionIndex ? 'bg-orange-500 w-8' : 'bg-gray-300'
                        }`}
                      aria-label={`Go to collection ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Section Divider - Gradient Line */}
      {topCollections.length > 0 && (
        <div className="h-px bg-gradient-to-r from-transparent via-orange-400 to-transparent opacity-30"></div>
      )}

      {/* Haftanın Şirketi Section */}
      {companyOfWeek && (
        <section className="py-12 bg-gradient-to-br from-orange-50 to-amber-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-gradient-to-b from-orange-500 to-amber-500 rounded"></div>
                <h2 className="text-2xl md:text-3xl font-bold">{locale === 'en' ? 'Company of the Week' : 'Haftanın Şirketi'}</h2>
                <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                  👑 Business
                </span>
              </div>
              <Link
                href="/listings"
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
              >
                {locale === 'en' ? 'View All Listings' : 'Tüm ilanları gör'} <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>

            <div className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-orange-100">
              <div className="grid md:grid-cols-4 gap-6">
                {/* Company Profile */}
                <div className="md:col-span-1">
                  <div className="flex flex-col items-center md:items-start">
                    {companyOfWeek.avatarUrl ? (
                      <OptimizedImage
                        src={companyOfWeek.avatarUrl}
                        alt={companyOfWeek.companyName || companyOfWeek.displayName}
                        width={80}
                        height={80}
                        className="rounded-full mb-4 object-cover border-4 border-orange-200"
                        logContext={{ companyId: companyOfWeek.id, page: 'home-company-avatar' }}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-2xl font-bold mb-4 border-4 border-orange-200">
                        {(companyOfWeek.companyName || companyOfWeek.displayName).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                      {companyOfWeek.companyName || companyOfWeek.displayName}
                      {companyOfWeek.isVerified && (
                        <CheckBadgeIcon className="w-5 h-5 text-green-500" />
                      )}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4 text-center md:text-left">
                      {companyOfWeek.bio || (locale === 'en' ? 'Premium Diecast vehicle buying and selling' : 'Premium Diecast araçların alım ve satımı')}
                    </p>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 w-full mb-4">
                      <div className="bg-orange-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-orange-600">{companyOfWeek.stats?.totalProducts || 0}</p>
                        <p className="text-xs text-gray-500">{locale === 'en' ? 'Products' : 'Ürün'}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-green-600">{companyOfWeek.stats?.totalSales || 0}</p>
                        <p className="text-xs text-gray-500">{locale === 'en' ? 'Sales' : 'Satış'}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-blue-600">{(companyOfWeek.stats?.totalViews || 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{locale === 'en' ? 'Views' : 'Görüntülenme'}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-red-500">{(companyOfWeek.stats?.totalLikes || 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{locale === 'en' ? 'Likes' : 'Beğeni'}</p>
                      </div>
                    </div>

                    {companyOfWeek.stats?.averageRating && companyOfWeek.stats.averageRating > 0 && (
                      <div className="flex items-center gap-2 mb-4">
                        <StarIcon className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                        <span className="font-semibold">{companyOfWeek.stats.averageRating.toFixed(1)}</span>
                        <span className="text-sm text-gray-500">
                          ({companyOfWeek.stats.totalRatings || 0} {locale === 'en' ? 'reviews' : 'yorum'})
                        </span>
                      </div>
                    )}

                    <Link
                      href={`/seller/${companyOfWeek.id}`}
                      className="w-full text-center bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2 rounded-lg font-semibold hover:from-orange-600 hover:to-amber-600 transition-all"
                    >
                      {locale === 'en' ? 'View Store' : 'Mağazayı İncele'}
                    </Link>
                  </div>
                </div>

                {/* Featured Products */}
                <div className="md:col-span-3">
                  <h4 className="text-lg font-semibold mb-4 text-gray-800">{locale === 'en' ? 'Featured Products' : 'Öne Çıkan Ürünler'}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {companyOfWeek.products?.slice(0, 6).map((product) => (
                      <Link key={product.id} href={`/listings/${product.id}`}>
                        <div className="bg-gray-50 rounded-xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1">
                          <div className="relative aspect-square bg-gray-100">
                            <OptimizedImage
                              src={product.image || `https://placehold.co/400x400/f3f4f6/9ca3af?text=${locale === 'en' ? 'Product' : 'Ürün'}`}
                              alt={product.title}
                              fill
                              className="object-cover"
                              fallbackSrc={`https://placehold.co/400x400/f3f4f6/9ca3af?text=${locale === 'en' ? 'Product' : 'Ürün'}`}
                              logContext={{ productId: product.id, page: 'home-company-product' }}
                            />
                            <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                              <HandThumbUpIcon className="w-4 h-4 text-orange-500" />
                              <span className="text-xs font-semibold">{product.likeCount?.toLocaleString() || 0}</span>
                            </div>
                          </div>
                          <div className="p-4">
                            <h4 className="font-semibold text-sm mb-1 line-clamp-2">{product.title}</h4>
                            <p className="text-xs text-gray-500 mb-2">
                              {extractBrandFromTitle(product.title)} • {extractScaleFromTitle(product.title)}
                            </p>
                            {isProductOnSaleDisplay(product) && (
                              <p className="text-xs text-gray-400 line-through">
                                {getProductOriginalPriceForDisplay(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                              </p>
                            )}
                            <p className="text-lg font-bold text-orange-500">
                              {getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>

                  {/* Collections Preview */}
                  {companyOfWeek.collections && companyOfWeek.collections.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-lg font-semibold mb-4 text-gray-800">{locale === 'en' ? 'Collections' : 'Koleksiyonları'}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {companyOfWeek.collections.slice(0, 2).map((collection) => (
                          <Link key={collection.id} href={`/collections/${collection.id}`}>
                            <div className="bg-gray-50 rounded-xl p-4 hover:shadow-md transition-all flex items-center gap-4">
                              <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                                {collection.coverImageUrl ? (
                                  <OptimizedImage
                                    src={collection.coverImageUrl}
                                    alt={collection.name}
                                    width={64}
                                    height={64}
                                    className="object-cover w-full h-full"
                                    logContext={{ collectionId: collection.id, page: 'home-company-collection' }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-2xl">📚</div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate">{collection.name}</p>
                                <p className="text-xs text-gray-500">{collection.itemCount} {locale === 'en' ? 'products' : 'ürün'}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs">
                                  <span className="text-blue-500">{collection.viewCount} {locale === 'en' ? 'views' : 'görüntülenme'}</span>
                                  <span className="text-red-500">{collection.likeCount} {locale === 'en' ? 'likes' : 'beğeni'}</span>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Section Divider - Gradient Line */}
      {companyOfWeek && (
        <div className="h-px bg-gradient-to-r from-transparent via-orange-400 to-transparent opacity-30"></div>
      )}

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={authModalConfig.title}
        message={authModalConfig.message}
        icon={authModalConfig.icon}
        redirectPath={authModalConfig.redirectPath}
      />
    </div>
  );
}
