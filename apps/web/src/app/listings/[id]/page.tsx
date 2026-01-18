'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowsRightLeftIcon,
  ShoppingCartIcon,
  HeartIcon,
  ShareIcon,
  ChatBubbleLeftRightIcon,
  StarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { listingsApi, wishlistApi } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import AuthRequiredModal from '@/components/AuthRequiredModal';
import { HeartIcon as HeartOutlineIcon } from '@heroicons/react/24/outline';

interface ProductImage {
  id?: string;
  url: string;
  sortOrder?: number;
}

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  images: Array<ProductImage | string>;
  brand?: string;
  scale?: string;
  year?: number;
  condition?: string;
  trade_available?: boolean;
  isTradeEnabled?: boolean;
  sellerId?: string;
  seller?: {
    id: string;
    displayName?: string;
    username?: string;
    rating?: number;
    listings_count?: number;
    productsCount?: number;
    created_at?: string;
  };
  category?: {
    id: string;
    name: string;
  };
  created_at?: string;
  createdAt?: string;
}

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const { addToCart } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  
  const [listing, setListing] = useState<Listing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({
    title: 'Giriş Yapmanız Gerekiyor',
    message: '',
    icon: null as React.ReactNode,
  });

  useEffect(() => {
    if (id) {
      fetchListing();
      checkFavorite();
    }
  }, [id, isAuthenticated]);

  const fetchListing = async () => {
    try {
      const response = await listingsApi.getOne(id);
      setListing(response.data.product || response.data);
    } catch (error) {
      console.error('Failed to fetch listing:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkFavorite = async () => {
    if (!isAuthenticated) return;
    try {
      const response = await wishlistApi.check(id);
      setIsFavorite(response.data?.isFavorite || response.data?.exists || false);
    } catch (error) {
      // Ignore - wishlist check is optional
    }
  };

  const getImageUrl = (image: ProductImage | string): string => {
    if (typeof image === 'string') {
      return image || 'https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün';
    }
    return image?.url || 'https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün';
  };

  const handleAddToCart = async () => {
    if (!listing) return;
    
    setIsAddingToCart(true);
    try {
      await addToCart({
        productId: listing.id,
        title: listing.title,
        price: Number(listing.price),
        imageUrl: listing.images?.length ? getImageUrl(listing.images[0]) : 'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
        seller: {
          id: listing.sellerId || listing.seller?.id || '',
          displayName: listing.seller?.displayName || listing.seller?.username || 'Satıcı',
        },
      });
      toast.success('Ürün sepete eklendi');
    } catch (error) {
      toast.error('Sepete eklenemedi');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = () => {
    if (!listing) return;
    router.push(`/checkout?productId=${listing.id}`);
  };

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      setAuthModalConfig({
        title: 'Favorilere Ekle',
        message: 'Bu ürünü favorilerinize eklemek için giriş yapmanız gerekiyor.',
        icon: <HeartOutlineIcon className="w-10 h-10 text-red-500" />,
      });
      setShowAuthModal(true);
      return;
    }
    
    try {
      if (isFavorite) {
        await wishlistApi.remove(id);
        setIsFavorite(false);
        toast.success('Favorilerden çıkarıldı');
      } else {
        await wishlistApi.add(id);
        setIsFavorite(true);
        toast.success('Favorilere eklendi');
      }
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleShare = () => {
    setShowShareMenu(!showShareMenu);
  };

  const shareToSocial = async (platform: string) => {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(listing?.title || 'Taro\'da bu ürüne göz at!');
    const text = encodeURIComponent(`${listing?.title} - ₺${listing?.price?.toLocaleString('tr-TR')}`);
    
    let shareUrl = '';
    
    switch (platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
        break;
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${text}%20${url}`;
        break;
      case 'telegram':
        shareUrl = `https://t.me/share/url?url=${url}&text=${text}`;
        break;
      case 'copy':
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast.success('Link kopyalandı!');
        } catch (e) {
          toast.error('Link kopyalanamadı');
        }
        setShowShareMenu(false);
        return;
      case 'native':
        if (navigator.share) {
          try {
            await navigator.share({
              title: listing?.title,
              url: window.location.href,
            });
          } catch (e) {
            // Share cancelled
          }
        }
        setShowShareMenu(false);
        return;
    }
    
    if (shareUrl) {
      window.open(shareUrl, '_blank', 'width=600,height=400');
    }
    setShowShareMenu(false);
  };

  // Check if trade is available
  const isTradeAvailable = listing?.trade_available || listing?.isTradeEnabled || false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="aspect-square bg-gray-200 rounded-2xl" />
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded w-3/4" />
                <div className="h-6 bg-gray-200 rounded w-1/2" />
                <div className="h-10 bg-gray-200 rounded w-1/3" />
                <div className="h-32 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">İlan bulunamadı</p>
      </div>
    );
  }

  const images = listing.images?.length 
    ? listing.images.map(img => getImageUrl(img))
    : ['https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün'];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Image Gallery */}
          <div>
            <div className="relative aspect-square bg-white rounded-2xl overflow-hidden shadow-sm">
              <Image
                src={images[activeImageIndex]}
                alt={listing.title}
                fill
                className="object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün';
                }}
              />
              
              {isTradeAvailable && (
                <div className="absolute top-4 left-4 badge badge-trade text-base">
                  <ArrowsRightLeftIcon className="w-5 h-5 mr-1" />
                  Takas Kabul Edilir
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveImageIndex((i) => (i > 0 ? i - 1 : images.length - 1))}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <ChevronLeftIcon className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => setActiveImageIndex((i) => (i < images.length - 1 ? i + 1 : 0))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <ChevronRightIcon className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                {images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveImageIndex(index)}
                    className={`relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                      index === activeImageIndex ? 'border-primary-500' : 'border-transparent'
                    }`}
                  >
                    <Image src={img} alt="" fill className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                {listing.title}
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={handleToggleFavorite}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  {isFavorite ? (
                    <HeartSolidIcon className="w-6 h-6 text-red-500" />
                  ) : (
                    <HeartIcon className="w-6 h-6 text-gray-400" />
                  )}
                </button>
                <div className="relative">
                  <button
                    onClick={handleShare}
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <ShareIcon className="w-6 h-6 text-gray-400" />
                  </button>
                  
                  {/* Share Dropdown */}
                  {showShareMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                      <button
                        onClick={() => shareToSocial('whatsapp')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="text-green-500 text-lg">📱</span>
                        WhatsApp
                      </button>
                      <button
                        onClick={() => shareToSocial('twitter')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="text-orange-400 text-lg">𝕏</span>
                        Twitter / X
                      </button>
                      <button
                        onClick={() => shareToSocial('facebook')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="text-orange-600 text-lg">📘</span>
                        Facebook
                      </button>
                      <button
                        onClick={() => shareToSocial('telegram')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="text-orange-500 text-lg">✈️</span>
                        Telegram
                      </button>
                      <hr className="my-1" />
                      <button
                        onClick={() => shareToSocial('copy')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="text-gray-500 text-lg">📋</span>
                        Linki Kopyala
                      </button>
                      {typeof navigator !== 'undefined' && 'share' in navigator && (
                        <button
                          onClick={() => shareToSocial('native')}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                        >
                          <span className="text-gray-500 text-lg">🔗</span>
                          Diğer...
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-4xl font-bold text-primary-500 mb-6">
              ₺{Number(listing.price).toLocaleString('tr-TR')}
            </p>

            {/* Quick Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-white rounded-xl mb-6">
              {listing.brand && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">Marka</p>
                  <p className="font-semibold">{listing.brand}</p>
                </div>
              )}
              {listing.scale && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">Ölçek</p>
                  <p className="font-semibold">{listing.scale}</p>
                </div>
              )}
              {listing.category && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">Kategori</p>
                  <p className="font-semibold">{listing.category.name}</p>
                </div>
              )}
              {listing.condition && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">Durum</p>
                  <p className="font-semibold">{listing.condition}</p>
                </div>
              )}
              {listing.year && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">Yıl</p>
                  <p className="font-semibold">{listing.year}</p>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Açıklama</h2>
              <p className="text-gray-600 whitespace-pre-line">
                {listing.description || 'Açıklama bulunmuyor.'}
              </p>
            </div>

            {/* Seller Info */}
            {listing.seller && (
              <div className="bg-white rounded-xl p-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-xl">👤</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {listing.seller.displayName || listing.seller.username || 'Satıcı'}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <div className="flex items-center">
                        <StarIcon className="w-4 h-4 text-yellow-400 mr-1" />
                        {listing.seller.rating?.toFixed(1) || '0.0'}
                      </div>
                      <span>•</span>
                      <span>
                        {listing.seller.listings_count || listing.seller.productsCount || 0} ilan
                      </span>
                    </div>
                  </div>
                  {isAuthenticated ? (
                    <Link
                      href={`/messages?user=${listing.seller.id}&listing=${listing.id}`}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <ChatBubbleLeftRightIcon className="w-5 h-5" />
                      Mesaj Gönder
                    </Link>
                  ) : (
                    <button
                      onClick={() => {
                        setAuthModalConfig({
                          title: 'Satıcıya Mesaj Gönder',
                          message: 'Satıcıyla iletişime geçmek için giriş yapmanız gerekiyor.',
                          icon: <ChatBubbleLeftRightIcon className="w-10 h-10 text-primary-500" />,
                        });
                        setShowAuthModal(true);
                      }}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <ChatBubbleLeftRightIcon className="w-5 h-5" />
                      Mesaj Gönder
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* Primary Action: Buy Now */}
              <button
                onClick={handleBuyNow}
                className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-lg"
              >
                <BoltIcon className="w-6 h-6" />
                Hemen Al
              </button>

              {/* Secondary Actions */}
              <div className="flex gap-3">
                {isTradeAvailable && (
                  <Link
                    href={`/trades/new?listing=${listing.id}`}
                    className="btn-trade flex-1 flex items-center justify-center gap-2"
                  >
                    <ArrowsRightLeftIcon className="w-5 h-5" />
                    Takas Teklifi
                  </Link>
                )}
                <button
                  onClick={handleAddToCart}
                  disabled={isAddingToCart}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2"
                >
                  <ShoppingCartIcon className="w-5 h-5" />
                  {isAddingToCart ? 'Ekleniyor...' : 'Sepete Ekle'}
                </button>
                <button
                  onClick={handleToggleFavorite}
                  className={`btn-secondary flex-1 flex items-center justify-center gap-2 ${isFavorite ? 'bg-red-50 border-red-200 text-red-600' : ''}`}
                >
                  {isFavorite ? (
                    <>
                      <HeartSolidIcon className="w-5 h-5 text-red-500" />
                      Favorilerde
                    </>
                  ) : (
                    <>
                      <HeartIcon className="w-5 h-5" />
                      Favorilere Ekle
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={authModalConfig.title}
        message={authModalConfig.message}
        icon={authModalConfig.icon}
      />
    </div>
  );
}




