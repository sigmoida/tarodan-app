'use client';

import { useState, useEffect } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import OptimizedImage, { getOptimizedImageUrl, isValidImageSrc } from '@/components/OptimizedImage';
import {
  ArrowRightIcon,
  HandThumbUpIcon,
  StarIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/solid';
import { ChevronLeftIcon, ChevronRightIcon, TagIcon } from '@heroicons/react/24/outline';
import { api, listingsApi } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
import { useAuthStore } from '@/stores/authStore';
import dynamic from 'next/dynamic';
import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';
import { useTranslation } from '@/i18n/LanguageContext';
import ProductLayoutSelector, { ProductLayout } from '@/components/ProductLayoutSelector';

import HeroSlider from '@/components/home/HeroSlider';
import TrustBadges from '@/components/home/TrustBadges';

import { SectionHeader, BrandCard, SkeletonCard, EmptyState, ProductCard, Badge } from '@/components/ui';

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(() => import('@/components/AuthRequiredModal'), 'AuthRequiredModal'),
  { ssr: false }
);

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
  isPreorder?: boolean;
  isLimited?: boolean;
  editionNumber?: string;
  rating?: { average: number | null; count: number };
}

interface FeaturedCollector {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  user: { id: string; displayName: string; avatarUrl?: string; bio?: string; isVerified?: boolean };
  items: Array<{ id: string; productId: string; productTitle: string; productPrice: number; productImage?: string }>;
}

interface FeaturedBusiness {
  id: string;
  displayName: string;
  companyName?: string;
  avatarUrl?: string;
  bio?: string;
  isVerified: boolean;
  stats: { totalProducts: number; totalViews: number; totalLikes: number; totalSales: number; averageRating: number; totalRatings: number };
  collections: Array<{ id: string; name: string; viewCount: number; likeCount: number; coverImageUrl?: string; itemCount: number; previewItems: Array<{ id: string; productTitle: string; productPrice: number; productImage?: string }> }>;
  products: Array<{ id: string; title: string; price: number; viewCount: number; likeCount: number; image?: string }>;
}

const BRANDS = [
  { name: 'Hot Wheels', logoUrl: '/photos/logolar/2158430f294b152f30824d6bb1ac7bf9.jpg' },
  { name: 'Matchbox', logoUrl: '/photos/logolar/images.png' },
  { name: 'Tamiya', logoUrl: '/photos/logolar/tamiya-logo-png_seeklogo-324507.png' },
  { name: 'AUTOart', logoUrl: '/photos/logolar/download.png' },
  { name: 'Kyosho', logoUrl: '/photos/logolar/Kyosho_corp_logo.png' },
  { name: 'Maisto', logoUrl: '/photos/logolar/maisto-logo.png' },
  { name: 'Bburago', logoUrl: '/photos/logolar/Bburago_Logo.png' },
  { name: 'Greenlight', logoUrl: '/photos/logolar/Greenlight_collectibles_logo.png' },
  { name: 'Minichamps', logoUrl: '/photos/logolar/minichamps_logo.png' },
  { name: 'MINI GT', logoUrl: '/photos/logolar/mini-gt-logo-png_seeklogo-523421.png' },
  { name: 'Tomica', logoUrl: '/photos/logolar/Tomica_brand_textlogo.png' },
  { name: 'Majorette', logoUrl: '/photos/logolar/majorette-logo-png_seeklogo-492958.png' },
  { name: 'GT Spirit', logoUrl: '/photos/logolar/GT-Spirit-Logo.webp' },
  { name: 'CMC', logoUrl: '/photos/logolar/cmc_logo-640x320.jpg' },
  { name: 'Norev', logoUrl: '/photos/logolar/5bc0b46797d85-thumbnail.jpg' },
  { name: 'Schuco', logoUrl: '/photos/logolar/logo-bmw-schuco-modell-car-toy-diecast-toy-model-car-model-building-siku-toys-png-clipart.jpg' },
];

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
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

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { data: topCollections = [] } = useQuery({
    queryKey: ['home', 'topCollections', { limit: 20 }],
    queryFn: async () => {
      const response = await api.get<FeaturedCollector[]>('/users/top-collections', { params: { limit: 20 } });
      return Array.isArray(response.data) ? response.data : [];
    },
    meta: { page: 'home', section: 'topCollections' },
  });

  const { data: featuredCollector = null } = useQuery({
    queryKey: ['home', 'featuredCollector'],
    queryFn: async () => {
      const response = await api.get<FeaturedCollector | null>('/users/featured-collector');
      return response.data ?? null;
    },
    meta: { page: 'home', section: 'featuredCollector' },
  });

  const {
    data: bestSellersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingBestSellers,
  } = useInfiniteQuery({
    queryKey: ['home', 'bestSellers', { sortBy: 'view_count_desc', status: 'active' }],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await listingsApi.getAll({ limit: 20, page: pageParam, sortBy: 'view_count_desc', status: 'active' });
      const products = response.data.data || response.data.products || [];
      return Array.isArray(products) ? products : [];
    },
    getNextPageParam: (_lastPage, allPages) => (_lastPage.length < 20 ? undefined : allPages.length + 1),
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

  const featuredCollectorToShow: FeaturedCollector | null =
    featuredCollector ?? (topCollections.length > 0 ? topCollections[0] : null);

  useEffect(() => { fetchDiscountedProducts(); }, []);

  const fetchDiscountedProducts = async () => {
    setIsLoadingDiscounted(true);
    try {
      const response = await listingsApi.getAll({ limit: 12, page: 1, discountOnly: true, status: 'active' });
      const products = response.data.data || response.data.products || [];
      setDiscountedProducts(Array.isArray(products) ? products : []);
    } catch (error) {
      console.error('Failed to fetch discounted products:', error);
    } finally {
      setIsLoadingDiscounted(false);
    }
  };

  useEffect(() => {
    if (topCollections.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentCollectionIndex((prev) => (prev + 1) % topCollections.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [topCollections.length]);

  const handleNextCollection = () => {
    if (topCollections.length > 0) setCurrentCollectionIndex((prev) => (prev + 1) % topCollections.length);
  };
  const handlePrevCollection = () => {
    if (topCollections.length > 0) setCurrentCollectionIndex((prev) => (prev - 1 + topCollections.length) % topCollections.length);
  };

  const getImageUrl = (image: any): string => {
    const placeholder = locale === 'en' ? 'https://placehold.co/400x400/f5f5f7/9ca3af?text=Product' : 'https://placehold.co/400x400/f5f5f7/9ca3af?text=%C3%9Cr%C3%BCn';
    if (!image) return placeholder;
    const raw = typeof image === 'string' ? image : image.url;
    if (raw && isValidImageSrc(raw)) return raw;
    return placeholder;
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
    for (const brand of BRANDS) {
      if (title.toLowerCase().includes(brand.name.toLowerCase())) return brand.name;
    }
    return locale === 'en' ? 'Brand' : 'Marka';
  };

  const extractScaleFromTitle = (title: string): string => {
    const m = title.match(/\d+:\d+/);
    return m ? m[0] : '1:18';
  };

  const viewAllLabel = locale === 'en' ? 'View All' : 'Tümünü gör';

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* ── Hero ── */}
      <HeroSlider />

      {/* ── Trust Badges ── */}
      <TrustBadges />

      {/* ── Brands (Marquee) ── */}
      <section className="py-6">
        <div className="relative w-full overflow-hidden">
          <div className="brands-marquee-track flex flex-nowrap items-center gap-4 px-6 sm:px-10 lg:px-16">
            {[...BRANDS, ...BRANDS].map((brand, i) => (
              <BrandCard
                key={`${brand.name}-${i}`}
                name={brand.name}
                href={`/listings?brand=${encodeURIComponent(brand.name)}`}
                logoUrl={brand.logoUrl}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── On Sale + Popular Listings (side by side) ── */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-5">
            {/* On Sale */}
            <div className="bg-white border-2 border-gray-200 rounded-xl shadow-md ring-1 ring-gray-100 p-4 md:p-5">
              <SectionHeader
                title={locale === 'en' ? 'On Sale' : 'İndirimdekiler'}
                viewAllHref="/listings?discountOnly=true"
                viewAllLabel={viewAllLabel}
                icon={<TagIcon className="w-5 h-5 text-primary-500" />}
                badge={<Badge variant="sale">{locale === 'en' ? 'Deals' : 'Fırsat'}</Badge>}
              />
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
                {isLoadingDiscounted ? (
                  [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
                ) : discountedProducts.length === 0 ? (
                  <div className="col-span-full">
                    <EmptyState
                      title={locale === 'en' ? 'No products on sale' : 'İndirimde ürün yok'}
                      description={locale === 'en' ? 'Check back later!' : 'Daha sonra tekrar bakın!'}
                      actionLabel={viewAllLabel}
                      actionHref="/listings"
                    />
                  </div>
                ) : (
                  discountedProducts.slice(0, 8).map((product) => {
                    const discountPct = product.discountPercent ??
                      (isProductOnSaleDisplay(product)
                        ? Math.round((1 - getProductEffectivePrice(product) / getProductOriginalPriceForDisplay(product)) * 100)
                        : 0);
                    return (
                      <Link key={product.id} href={`/listings/${product.id}`} className="block group">
                        <div className="rounded-lg overflow-hidden border border-gray-100 hover:border-primary-300 hover:shadow-sm transition-all">
                          <div className="relative aspect-[4/3] bg-surface-alt">
                            <Image src={getImageUrl(product.images?.[0])} alt={product.title} fill className="object-cover" unoptimized />
                            <div className="absolute top-1 left-1">
                              <span className="text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">%{discountPct}</span>
                            </div>
                          </div>
                          <div className="p-1.5">
                            <h3 className="font-medium text-heading line-clamp-1 text-[10px] leading-tight mb-0.5">{product.title}</h3>
                            <p className="text-xs font-bold text-primary-600">
                              {getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            {/* Popular Listings */}
            <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md ring-1 ring-gray-100 p-4 md:p-5">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-1 h-7 bg-primary-500 rounded-full flex-shrink-0" />
                  <h2 className="text-xl font-extrabold text-heading tracking-tight">
                    {locale === 'en' ? 'Popular Listings' : 'Popüler İlanlar'}
                  </h2>
                </div>
                <Link href="/listings?sortBy=view_count_desc" className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-primary-500 px-1.5 py-0.5 rounded border border-gray-200 hover:border-primary-300 transition-all flex-shrink-0">
                  {viewAllLabel} <ArrowRightIcon className="w-2.5 h-2.5" />
                </Link>
              </div>
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
                {isLoadingBestSellers ? (
                  [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
                ) : bestSellers.length === 0 ? (
                  <div className="col-span-full">
                    <EmptyState
                      title={locale === 'en' ? 'No listings yet' : 'Henüz ilan yok'}
                      description={locale === 'en' ? 'Be the first!' : 'İlk ilanı siz verin!'}
                      actionLabel={locale === 'en' ? 'Create Listing' : 'İlan Oluştur'}
                      actionHref="/listings/new"
                    />
                  </div>
                ) : (
                  bestSellers.slice(0, 8).map((product) => (
                    <Link key={product.id} href={`/listings/${product.id}`} className="block group">
                      <div className="rounded-lg overflow-hidden border border-gray-100 hover:border-primary-300 hover:shadow-sm transition-all">
                        <div className="relative aspect-[4/3] bg-surface-alt">
                          <Image src={getImageUrl(product.images?.[0])} alt={product.title} fill className="object-cover" unoptimized />
                        </div>
                        <div className="p-1.5">
                          <h3 className="font-medium text-heading line-clamp-1 text-[10px] leading-tight mb-0.5">{product.title}</h3>
                          <p className="text-xs font-bold text-primary-600">
                            {getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Top Collections (compact carousel) ── */}
      {topCollections.length > 0 && (
        <section className="py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white border-2 border-gray-200 rounded-xl shadow-md ring-1 ring-gray-100 p-6 md:p-8">
              <SectionHeader
                title={locale === 'en' ? 'Top Collections' : 'En İyi Koleksiyonlar'}
                viewAllHref="/collections"
                viewAllLabel={viewAllLabel}
              />
              <div className="relative">
                {topCollections.length > 1 && (
                  <>
                    <button onClick={handlePrevCollection} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center transition-all duration-300 hover:shadow-lg text-heading" aria-label="Previous">
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <button onClick={handleNextCollection} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center transition-all duration-300 hover:shadow-lg text-heading" aria-label="Next">
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                  </>
                )}
                <div className="overflow-hidden px-12">
                  <div className="flex transition-transform duration-500 ease-premium gap-6" style={{ transform: `translateX(calc(-${currentCollectionIndex * 100}% - ${currentCollectionIndex * 1.5}rem))` }}>
                    {topCollections.map((collection) => (
                      <div key={collection.id} className="flex-shrink-0 w-full">
                        <div className="bg-surface-alt rounded-xl p-5">
                          <div className="flex flex-col md:flex-row md:items-center gap-5">
                            <div className="flex items-center gap-4 md:w-1/3">
                              {collection.user?.avatarUrl ? (
                                <OptimizedImage src={collection.user.avatarUrl} alt={collection.user.displayName} width={48} height={48} className="rounded-full object-cover flex-shrink-0" logContext={{ userId: collection.user?.id, page: 'home-collection-avatar' }} />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                                  {collection.user?.displayName?.charAt(0).toUpperCase() || '?'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-heading flex items-center gap-1.5">
                                  {collection.user?.displayName || (locale === 'en' ? 'Collector' : 'Koleksiyoner')}
                                  {collection.user?.isVerified && <CheckBadgeIcon className="w-4 h-4 text-green-500" />}
                                </h3>
                                <p className="text-xs text-primary-600 font-medium truncate">{collection.name}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                                  <span>{collection.itemCount || 0} {locale === 'en' ? 'items' : 'araç'}</span>
                                  <span>{collection.viewCount?.toLocaleString() || 0} {locale === 'en' ? 'views' : 'görüntü'}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {collection.items?.slice(0, 4).map((item) => (
                                <Link key={item.id} href={item.productId ? `/listings/${item.productId}` : '#'} className="block">
                                  <div className="relative aspect-square bg-white rounded-lg overflow-hidden border border-gray-100">
                                    <OptimizedImage src={getImageUrl(item.productImage)} alt={item.productTitle} fill className="object-cover" fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`} logContext={{ itemId: item.id, page: 'home-collection-item' }} />
                                  </div>
                                </Link>
                              ))}
                            </div>
                            <Link href={`/collections/${collection.id}`} className="flex-shrink-0 text-primary-500 font-medium hover:text-primary-600 flex items-center gap-1 text-sm">
                              {locale === 'en' ? 'View' : 'İncele'} <ArrowRightIcon className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {topCollections.length > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    {topCollections.map((_, index) => (
                      <button key={index} onClick={() => setCurrentCollectionIndex(index)} className={`h-1.5 rounded-full transition-all duration-300 ease-premium ${index === currentCollectionIndex ? 'bg-primary-500 w-6' : 'bg-gray-300 w-1.5'}`} aria-label={`Go to collection ${index + 1}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Spotlights: Featured Collector + Company of the Week (side by side) ── */}
      {(featuredCollectorToShow || companyOfWeek) && (
        <section className="py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className={`grid gap-6 ${featuredCollectorToShow && companyOfWeek ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
              {featuredCollectorToShow && (
                <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md ring-1 ring-gray-100 p-6 flex flex-col">
                  <div className="flex justify-start mb-5">
                    <h2 className="text-xl font-extrabold text-heading tracking-tight flex items-center gap-2">
                      <div className="w-1 h-7 bg-primary-500 rounded-full flex-shrink-0" />
                      {locale === 'en' ? 'Collector of the Week' : 'Haftanın Koleksiyoneri'}
                    </h2>
                  </div>
                  <div className="flex items-start gap-4 mb-4">
                    {featuredCollectorToShow.user?.avatarUrl ? (
                      <OptimizedImage src={featuredCollectorToShow.user.avatarUrl} alt={featuredCollectorToShow.user.displayName} width={56} height={56} className="rounded-full object-cover flex-shrink-0" logContext={{ userId: featuredCollectorToShow.user.id, page: 'home-featured-collector-avatar' }} />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                        {featuredCollectorToShow.user?.displayName?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-heading flex items-center gap-1.5 mb-0.5">
                        {featuredCollectorToShow.user?.displayName || (locale === 'en' ? 'Collector' : 'Koleksiyoner')}
                        {featuredCollectorToShow.user?.isVerified && <CheckBadgeIcon className="w-4 h-4 text-green-500" />}
                      </h3>
                      <p className="text-xs text-primary-600 font-medium">{featuredCollectorToShow.name}</p>
                      <p className="text-xs text-muted mt-1 line-clamp-2">
                        {featuredCollectorToShow?.description || `${featuredCollectorToShow.itemCount || 0} ${locale === 'en' ? 'items' : 'araç'}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mb-4 text-xs">
                    <span className="flex items-center gap-1 text-blue-500 font-semibold">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                      {featuredCollectorToShow.viewCount?.toLocaleString() || 0}
                    </span>
                    <span className="flex items-center gap-1 text-red-500 font-semibold">
                      <HandThumbUpIcon className="w-3.5 h-3.5" /> {featuredCollectorToShow.likeCount?.toLocaleString() || 0}
                    </span>
                    <span className="text-muted">{featuredCollectorToShow.itemCount || 0} {locale === 'en' ? 'items' : 'araç'}</span>
                  </div>
                  {featuredCollectorToShow.items && featuredCollectorToShow.items.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {featuredCollectorToShow.items.slice(0, 3).map((item) => (
                        <Link key={item.id} href={item.productId ? `/listings/${item.productId}` : '#'} className="block">
                          <div className="relative aspect-square bg-surface-alt rounded-lg overflow-hidden">
                            <OptimizedImage src={getImageUrl(item.productImage)} alt={item.productTitle} fill className="object-cover" fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`} logContext={{ itemId: item.id, page: 'home-featured-collector-item' }} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link href={`/collections/${featuredCollectorToShow.id}`} className="mt-auto btn-primary w-full text-center text-sm py-2">
                    {locale === 'en' ? 'View Collection' : 'Koleksiyonu incele'}
                  </Link>
                </div>
              )}
              {companyOfWeek && (
                <div className="bg-white rounded-xl border-2 border-gray-200 shadow-md ring-1 ring-gray-100 p-6 flex flex-col">
                  <div className="flex justify-start mb-5">
                    <h2 className="text-xl font-extrabold text-heading tracking-tight flex items-center gap-2">
                      <div className="w-1 h-7 bg-primary-500 rounded-full flex-shrink-0" />
                      {locale === 'en' ? 'Company of the Week' : 'Haftanın Şirketi'}
                      <Badge variant="default">Business</Badge>
                    </h2>
                  </div>
                  <div className="flex items-start gap-4 mb-4">
                    {companyOfWeek.avatarUrl ? (
                      <OptimizedImage src={companyOfWeek.avatarUrl} alt={companyOfWeek.companyName || companyOfWeek.displayName} width={56} height={56} className="rounded-full object-cover flex-shrink-0 border-2 border-gray-100" logContext={{ companyId: companyOfWeek.id, page: 'home-company-avatar' }} />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 border-2 border-gray-100">
                        {(companyOfWeek.companyName || companyOfWeek.displayName).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-heading flex items-center gap-1.5 mb-0.5">
                        {companyOfWeek.companyName || companyOfWeek.displayName}
                        {companyOfWeek.isVerified && <CheckBadgeIcon className="w-4 h-4 text-green-500" />}
                      </h3>
                      <p className="text-xs text-muted line-clamp-2">
                        {companyOfWeek.bio || (locale === 'en' ? 'Premium Diecast vehicle buying and selling' : 'Premium Diecast araçların alım ve satımı')}
                      </p>
                      {companyOfWeek.stats?.averageRating > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <StarIcon className="w-3.5 h-3.5 text-yellow-400" />
                          <span className="text-xs font-semibold text-heading">{companyOfWeek.stats.averageRating.toFixed(1)}</span>
                          <span className="text-xs text-muted">({companyOfWeek.stats.totalRatings || 0})</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="bg-surface-alt rounded-lg p-2 text-center">
                      <p className="text-sm font-bold text-heading">{companyOfWeek.stats?.totalProducts || 0}</p>
                      <p className="text-[10px] text-muted">{locale === 'en' ? 'Products' : 'Ürün'}</p>
                    </div>
                    <div className="bg-surface-alt rounded-lg p-2 text-center">
                      <p className="text-sm font-bold text-heading">{companyOfWeek.stats?.totalSales || 0}</p>
                      <p className="text-[10px] text-muted">{locale === 'en' ? 'Sales' : 'Satış'}</p>
                    </div>
                    <div className="bg-surface-alt rounded-lg p-2 text-center">
                      <p className="text-sm font-bold text-heading">{(companyOfWeek.stats?.totalViews || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted">{locale === 'en' ? 'Views' : 'Görüntü'}</p>
                    </div>
                    <div className="bg-surface-alt rounded-lg p-2 text-center">
                      <p className="text-sm font-bold text-heading">{(companyOfWeek.stats?.totalLikes || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted">{locale === 'en' ? 'Likes' : 'Beğeni'}</p>
                    </div>
                  </div>
                  {companyOfWeek.products && companyOfWeek.products.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {companyOfWeek.products.slice(0, 3).map((product) => (
                        <Link key={product.id} href={`/listings/${product.id}`} className="block">
                          <div className="relative aspect-square bg-surface-alt rounded-lg overflow-hidden">
                            <OptimizedImage src={product.image || `https://placehold.co/200x200/f5f5f7/9ca3af?text=+`} alt={product.title} fill className="object-cover" fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`} logContext={{ productId: product.id, page: 'home-company-product' }} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link href={`/seller/${companyOfWeek.id}`} className="mt-auto btn-primary w-full text-center text-sm py-2">
                    {locale === 'en' ? 'View Store' : 'Mağazayı İncele'}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
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
