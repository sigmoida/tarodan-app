'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowRightIcon,
  HandThumbUpIcon,
  StarIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/solid';
import { api, listingsApi, collectionsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import AuthRequiredModal from '@/components/AuthRequiredModal';
import { RectangleStackIcon } from '@heroicons/react/24/outline';

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
  images?: Array<{ id?: string; url: string; sortOrder?: number }> | string[];
  brand?: string;
  scale?: string;
  isTradeEnabled?: boolean;
  trade_available?: boolean;
  viewCount?: number;
  likeCount?: number;
  createdAt?: string;
  condition?: string;
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
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [featuredCollector, setFeaturedCollector] = useState<Collection | null>(null);
  const [companyOfWeek, setCompanyOfWeek] = useState<Seller | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    fetchBestSellers();
    fetchFeaturedCollector();
    fetchCompanyOfWeek();
  }, []);

  const fetchBestSellers = async () => {
    try {
      const response = await listingsApi.getAll({ 
        limit: 6,
        sortBy: 'viewCount',
        status: 'active'
      });
      const products = response.data.data || response.data.products || [];
      setBestSellers(Array.isArray(products) ? products.slice(0, 6) : []);
    } catch (error) {
      console.error('Failed to fetch best sellers:', error);
    }
  };

  const fetchFeaturedCollector = async () => {
    try {
      const response = await collectionsApi.browse({ isPublic: true, page: 1, pageSize: 1 });
      const collections = response.data?.collections || response.data?.data || [];
      if (collections.length > 0) {
        const collectionId = collections[0].id;
        const detailResponse = await collectionsApi.getOne(collectionId);
        const collection = detailResponse.data?.collection || detailResponse.data;
        setFeaturedCollector(collection);
      }
    } catch (error) {
      console.error('Failed to fetch featured collector:', error);
    }
  };

  const fetchCompanyOfWeek = async () => {
    try {
      // Get top seller as company of the week
      const response = await api.get('/users/top-sellers?limit=1');
      const sellers = response.data?.data || response.data || [];
      if (sellers.length > 0) {
        const sellerId = sellers[0].id;
        const productsResponse = await listingsApi.getAll({ sellerId, limit: 3 });
        const products = productsResponse.data?.data || productsResponse.data?.products || [];
        setCompanyOfWeek({
          ...sellers[0],
          products: products.slice(0, 3),
        });
      }
    } catch (error) {
      console.error('Failed to fetch company of week:', error);
    }
  };

  const getImageUrl = (image: any): string => {
    if (!image) return 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
    if (typeof image === 'string') return image;
    return image.url || 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
  };

  const getProductTag = (product: Product): string | null => {
    const daysSinceCreation = product.createdAt 
      ? Math.floor((new Date().getTime() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 100;
    
    if (daysSinceCreation < 7) return 'Yeni';
    if (product.viewCount && product.viewCount > 1000) return 'Nadir';
    if (Math.random() > 0.7) return 'İndirim';
    return null;
  };

  const extractBrandFromTitle = (title: string): string => {
    const brandNames = BRANDS.map(b => b.name);
    for (const brand of brandNames) {
      if (title.toLowerCase().includes(brand.toLowerCase())) {
        return brand;
      }
    }
    return 'Marka';
  };

  const extractScaleFromTitle = (title: string): string => {
    const scaleMatch = title.match(/\d+:\d+/);
    if (scaleMatch) return scaleMatch[0];
    return '1:18';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative bg-orange-500 text-white py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-600 opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Türkiye'nin en büyük
                <br />
                Diecast pazaryeri
              </h1>
              <p className="text-lg md:text-xl text-orange-50 mb-8 max-w-xl">
                Diecast modelleri satın alın, satın ve takas edin. Dijital Garajınızı oluşturun ve koleksiyonunuzu sergileyin.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                {isAuthenticated ? (
                  <>
                    <Link 
                      href="/listings/new"
                      className="bg-white text-orange-500 px-8 py-4 rounded-xl font-semibold hover:bg-orange-50 transition-colors flex items-center justify-center gap-2 border-2 border-white shadow-lg"
                    >
                      <span className="text-xl">+</span>
                      İlan Ver
                    </Link>
                    <Link 
                      href="/collections"
                      className="bg-transparent text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/10 transition-colors flex items-center justify-center gap-2 border-2 border-white"
                    >
                      Koleksiyon oluştur
                    </Link>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        window.location.href = '/login?redirect=/listings/new';
                      }}
                      className="bg-white text-orange-500 px-8 py-4 rounded-xl font-semibold hover:bg-orange-50 transition-colors flex items-center justify-center gap-2 border-2 border-white shadow-lg"
                    >
                      <span className="text-xl">+</span>
                      İlan Ver
                    </button>
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="bg-transparent text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/10 transition-colors flex items-center justify-center gap-2 border-2 border-white"
                    >
                      Koleksiyon oluştur
                    </button>
                  </>
                )}
                <Link 
                  href="/listings"
                  className="bg-transparent text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/10 transition-colors flex items-center justify-center gap-2 border-2 border-white"
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
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl backdrop-blur-sm" />
              <div className="relative h-full bg-white/10 rounded-3xl flex items-center justify-center">
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
              <h2 className="text-2xl md:text-3xl font-bold">Markalar</h2>
            </div>
            <Link 
              href="/listings"
              className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
            >
              Tümünü gör <ArrowRightIcon className="w-4 h-4" />
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

      {/* Boyut (Scale) Section */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-orange-500 rounded"></div>
              <h2 className="text-2xl md:text-3xl font-bold">Boyut</h2>
            </div>
            <Link 
              href="/listings"
              className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
            >
              Tümünü gör <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {SCALES.map((scale) => {
              const scaleValue = scale.match(/\d+:\d+/)?.[0];
              return (
                <Link
                  key={scale}
                  href={`/listings?scale=${scaleValue}`}
                  className="px-4 py-2 bg-yellow-100 text-gray-800 rounded-lg hover:bg-orange-200 transition-colors font-medium"
                >
                  {scale}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Haftanın Koleksiyoneri Section */}
      {featuredCollector && (
        <section className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-orange-500 rounded"></div>
                <h2 className="text-2xl md:text-3xl font-bold">Haftanın Koleksiyoneri</h2>
              </div>
              <Link 
                href="/collections"
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
              >
                Tümünü gör <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6 md:p-8">
              <div className="grid md:grid-cols-4 gap-6">
                {/* Collector Profile */}
                <div className="md:col-span-1">
                  <div className="flex flex-col items-center md:items-start">
                    <div className="w-20 h-20 rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-bold mb-4">
                      {featuredCollector.userName.charAt(0).toUpperCase()}
                    </div>
                    <h3 className="text-xl font-bold mb-2">{featuredCollector.userName}</h3>
                    <p className="text-sm text-gray-600 mb-4 text-center md:text-left">
                      {featuredCollector.description || `${featuredCollector.itemCount || 0} araçlık koleksiyon`}
                    </p>
                    <div className="flex items-center gap-2 mb-4">
                      <HandThumbUpIcon className="w-5 h-5 text-orange-500" />
                      <span className="font-semibold">{featuredCollector.likeCount || 0}</span>
                    </div>
                    <Link
                      href={`/collections/${featuredCollector.id}`}
                      className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
                    >
                      Garajını incele <ArrowRightIcon className="w-4 h-4" />
                    </Link>
                  </div>
                </div>

                {/* Featured Products */}
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {featuredCollector.items?.slice(0, 3).map((item, index) => (
                    <Link key={item.id} href={`/listings/${item.productId}`}>
                      <div className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="relative aspect-square bg-gray-100">
                          <Image
                            src={getImageUrl(item.productImage)}
                            alt={item.productTitle}
                            fill
                            className="object-cover"
                            unoptimized
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
                            }}
                          />
                          <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                            <HandThumbUpIcon className="w-4 h-4 text-orange-500" />
                            <span className="text-xs font-semibold">{Math.floor(Math.random() * 3000 + 300)}</span>
                          </div>
                          <div className="absolute top-3 right-3">
                            <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                              {index === 0 ? 'Yeni' : 'Nadir'}
                            </span>
                          </div>
                        </div>
                        <div className="p-4">
                          <h4 className="font-semibold text-sm mb-1 line-clamp-2">{item.productTitle}</h4>
                          <p className="text-xs text-gray-500 mb-2">
                            {extractBrandFromTitle(item.productTitle)} • {extractScaleFromTitle(item.productTitle)}
                          </p>
                          <p className="text-lg font-bold text-orange-500">
                            TRY {item.productPrice.toLocaleString('tr-TR')}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Çok Satanlar Section */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-orange-500 rounded"></div>
              <h2 className="text-2xl md:text-3xl font-bold">Çok Satanlar</h2>
            </div>
            <Link 
              href="/listings?sortBy=viewCount"
              className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
            >
              Tümünü gör <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {bestSellers.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-500">
                Ürünler yükleniyor...
              </div>
            ) : (
              bestSellers.map((product) => {
                const tag = getProductTag(product);
                return (
                  <Link key={product.id} href={`/listings/${product.id}`}>
                    <div className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
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
                        <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                          <HandThumbUpIcon className="w-4 h-4 text-orange-500" />
                          <span className="text-xs font-semibold">{product.likeCount || Math.floor(Math.random() * 2000 + 200)}</span>
                        </div>
                        {tag && (
                          <div className="absolute top-3 right-3">
                            <span className={`text-white text-xs px-2 py-1 rounded-full font-semibold ${
                              tag === 'İndirim' ? 'bg-red-500' : tag === 'Yeni' ? 'bg-green-500' : 'bg-purple-500'
                            }`}>
                              {tag}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h4 className="font-semibold text-sm mb-1 line-clamp-2">{product.title}</h4>
                        <p className="text-xs text-gray-500 mb-2">
                          {extractBrandFromTitle(product.title)} • {extractScaleFromTitle(product.title)}
                        </p>
                        <p className="text-lg font-bold text-orange-500">
                          TRY {product.price.toLocaleString('tr-TR')}
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

      {/* Haftanın Şirketi Section */}
      {companyOfWeek && (
        <section className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-orange-500 rounded"></div>
                <h2 className="text-2xl md:text-3xl font-bold">Haftanın Şirketi</h2>
              </div>
              <Link 
                href="/collections"
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
              >
                Tümünü gör <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6 md:p-8">
              <div className="grid md:grid-cols-4 gap-6">
                {/* Company Profile */}
                <div className="md:col-span-1">
                  <div className="flex flex-col items-center md:items-start">
                    <div className="w-20 h-20 rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-bold mb-4">
                      {companyOfWeek.displayName.charAt(0).toUpperCase()}
                    </div>
                    <h3 className="text-xl font-bold mb-2">{companyOfWeek.displayName}</h3>
                    <p className="text-sm text-gray-600 mb-4 text-center md:text-left">
                      {companyOfWeek.bio || 'Premium Diecast araçların alım ve satımı'}
                    </p>
                    {companyOfWeek.rating && (
                      <div className="flex items-center gap-2 mb-2">
                        <StarIcon className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                        <span className="font-semibold">{companyOfWeek.rating.toFixed(1)}</span>
                        <span className="text-sm text-gray-500">
                          ({companyOfWeek.totalRatings || 0} yorum)
                        </span>
                      </div>
                    )}
                    {companyOfWeek.isVerified && (
                      <div className="flex items-center gap-2 mb-4 text-green-600">
                        <CheckBadgeIcon className="w-5 h-5" />
                        <span className="text-sm font-medium">Onaylanmış hesap</span>
                      </div>
                    )}
                    <Link
                      href={`/profile/${companyOfWeek.id}`}
                      className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-1"
                    >
                      Garajını incele <ArrowRightIcon className="w-4 h-4" />
                    </Link>
                  </div>
                </div>

                {/* Featured Products */}
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {companyOfWeek.products?.slice(0, 3).map((product, index) => {
                    const tag = getProductTag(product);
                    return (
                      <Link key={product.id} href={`/listings/${product.id}`}>
                        <div className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
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
                            <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                              <HandThumbUpIcon className="w-4 h-4 text-orange-500" />
                              <span className="text-xs font-semibold">{product.likeCount || Math.floor(Math.random() * 3000 + 300)}</span>
                            </div>
                            {tag && (
                              <div className="absolute top-3 right-3">
                                <span className={`text-white text-xs px-2 py-1 rounded-full font-semibold ${
                                  tag === 'İndirim' ? 'bg-red-500' : tag === 'Yeni' ? 'bg-green-500' : 'bg-purple-500'
                                }`}>
                                  {tag}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <h4 className="font-semibold text-sm mb-1 line-clamp-2">{product.title}</h4>
                            <p className="text-xs text-gray-500 mb-2">
                              {extractBrandFromTitle(product.title)} • {extractScaleFromTitle(product.title)}
                            </p>
                            <p className="text-lg font-bold text-orange-500">
                              TRY {product.price.toLocaleString('tr-TR')}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Koleksiyon Oluştur"
        message="Dijital garajınızı oluşturmak ve koleksiyonunuzu sergilemek için giriş yapmanız gerekiyor."
        icon={<RectangleStackIcon className="w-10 h-10 text-primary-500" />}
      />
    </div>
  );
}
