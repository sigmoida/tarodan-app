'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  XMarkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
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
  
  const { addToCart, items: cartItems, removeFromCart } = useCartStore();
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
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [magnifierPosition, setMagnifierPosition] = useState({ x: 0, y: 0 });
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [imageContainerRef, setImageContainerRef] = useState<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const zoomPreviewRef = useRef<HTMLDivElement | null>(null);
  
  // Check if product is in cart
  const cartItem = listing ? cartItems.find(item => item.productId === listing.id) : null;
  const isInCart = !!cartItem;

  // Helper function to get image URL
  const getImageUrl = (image: ProductImage | string): string => {
    if (typeof image === 'string') {
      return image || 'https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün';
    }
    return image?.url || 'https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün';
  };

  // Calculate images array early so it can be used in useEffect hooks
  const images = useMemo(() => {
    if (!listing) return ['https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün'];
    return listing.images?.length 
      ? listing.images.map(img => getImageUrl(img))
      : ['https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün'];
  }, [listing]);

  useEffect(() => {
    if (id) {
      fetchListing();
      checkFavorite();
    }
  }, [id, isAuthenticated]);

  // Handle ESC key to close lightbox
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLightboxOpen) {
        setIsLightboxOpen(false);
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return;
      
      if (e.key === 'ArrowLeft') {
        setLightboxImageIndex((i) => (i > 0 ? i - 1 : images.length - 1));
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      } else if (e.key === 'ArrowRight') {
        setLightboxImageIndex((i) => (i < images.length - 1 ? i + 1 : 0));
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleEsc);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLightboxOpen, images.length]);

  // Sync lightbox image index with active image index
  useEffect(() => {
    if (isLightboxOpen) {
      setLightboxImageIndex(activeImageIndex);
    }
  }, [isLightboxOpen, activeImageIndex]);

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
      setIsFavorite(response.data?.inWishlist || false);
    } catch (error) {
      // Ignore - wishlist check is optional
      setIsFavorite(false);
    }
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

  const handleRemoveFromCart = async () => {
    if (!cartItem) return;
    
    setIsAddingToCart(true);
    try {
      await removeFromCart(cartItem.id);
      toast.success('Ürün sepetten çıkarıldı');
    } catch (error) {
      toast.error('Sepetten çıkarılamadı');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleCartToggle = () => {
    if (isInCart) {
      handleRemoveFromCart();
    } else {
      handleAddToCart();
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

  // Lightbox handlers
  const openLightbox = (index: number) => {
    setLightboxImageIndex(index);
    setIsLightboxOpen(true);
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) {
        setPanPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!isLightboxOpen) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoomLevel((prev) => {
      const newZoom = Math.max(1, Math.min(3, prev + delta));
      if (newZoom === 1) {
        setPanPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    setPanPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Magnifier handlers - optimized with requestAnimationFrame
  const handleMagnifierMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef) return;
    
    // Cancel previous animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Use requestAnimationFrame to throttle updates
    animationFrameRef.current = requestAnimationFrame(() => {
      if (!imageContainerRef) return;
      
      const rect = imageContainerRef.getBoundingClientRect();
      const magnifierSize = 150;
      const halfSize = magnifierSize / 2;
      
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;
      
      // Büyüteci resmin kenarlarında sınırla
      x = Math.max(halfSize, Math.min(rect.width - halfSize, x));
      y = Math.max(halfSize, Math.min(rect.height - halfSize, y));
      
      // Check if mouse is within image bounds
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
        setMagnifierPosition({ x, y });
        setShowMagnifier(true);
        
        // Directly update background position for smooth tracking
        if (zoomPreviewRef.current) {
          const zoomLevel = 3;
          const bgX = -x * zoomLevel + (rect.width / 2);
          const bgY = -y * zoomLevel + (rect.height / 2);
          zoomPreviewRef.current.style.backgroundPosition = `${bgX}px ${bgY}px`;
        }
      } else {
        setShowMagnifier(false);
      }
    });
  }, [imageContainerRef]);

  const handleMagnifierMouseLeave = () => {
    setShowMagnifier(false);
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Image Gallery */}
          <div className="relative">
            {/* Küçük Resim + Büyüteç */}
            <div 
              ref={setImageContainerRef}
              className="relative aspect-square bg-white rounded-2xl overflow-visible shadow-sm cursor-zoom-in"
              onClick={() => openLightbox(activeImageIndex)}
              onMouseMove={handleMagnifierMouseMove}
              onMouseLeave={handleMagnifierMouseLeave}
            >
              <Image
                src={images[activeImageIndex]}
                alt={listing.title}
                fill
                className="object-cover rounded-2xl"
                unoptimized
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün';
                }}
              />

              {/* Kare Büyüteç (Viewport) */}
              {showMagnifier && imageContainerRef && (
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: `${magnifierPosition.x}px`,
                    top: `${magnifierPosition.y}px`,
                    transform: 'translate(-50%, -50%)',
                    width: '150px',
                    height: '150px',
                    border: '2px solid rgba(255, 140, 0, 0.8)',
                    boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)',
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                  }}
                />
              )}
              
              {isTradeAvailable && (
                <div className="absolute top-4 left-4 badge badge-trade text-base z-10">
                  <ArrowsRightLeftIcon className="w-5 h-5 mr-1" />
                  Takas Kabul Edilir
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveImageIndex((i) => (i > 0 ? i - 1 : images.length - 1))}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors z-10"
                  >
                    <ChevronLeftIcon className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => setActiveImageIndex((i) => (i < images.length - 1 ? i + 1 : 0))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors z-10"
                  >
                    <ChevronRightIcon className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Sağ Taraf: Büyük Zoom Preview - Modal gibi açılır, yazıların üstüne gelebilir */}
            {showMagnifier && imageContainerRef && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: -20 }}
                transition={{ duration: 0.2 }}
                className="absolute left-full top-0 ml-4 w-full aspect-square bg-white rounded-2xl overflow-hidden shadow-2xl hidden md:block z-50"
                style={{ maxWidth: '600px' }}
              >
                <div
                  ref={zoomPreviewRef}
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${images[activeImageIndex]})`,
                    backgroundSize: `${imageContainerRef.offsetWidth * 3}px ${imageContainerRef.offsetHeight * 3}px`,
                    backgroundRepeat: 'no-repeat',
                    willChange: 'background-position',
                  }}
                />
              </motion.div>
            )}

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                {images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setActiveImageIndex(index);
                      openLightbox(index);
                    }}
                    className={`relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                      index === activeImageIndex ? 'border-primary-500' : 'border-transparent'
                    }`}
                  >
                    <Image src={img} alt="" fill className="object-cover" unoptimized />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lightbox Modal */}
          {isLightboxOpen && (
            <div 
              className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
              onClick={closeLightbox}
            >
              <div 
                className="relative max-w-7xl w-full h-full flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close Button */}
                <button
                  onClick={closeLightbox}
                  className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>

                {/* Zoom Controls */}
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  <button
                    onClick={handleZoomIn}
                    className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                    disabled={zoomLevel >= 3}
                  >
                    <MagnifyingGlassPlusIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                    disabled={zoomLevel <= 1}
                  >
                    <MagnifyingGlassMinusIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Image Container */}
                <div 
                  className="flex-1 flex items-center justify-center overflow-hidden"
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                >
                  <div
                    className="relative"
                    style={{
                      transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                      transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                    }}
                  >
                    <Image
                      src={images[lightboxImageIndex]}
                      alt={listing.title}
                      width={1200}
                      height={1200}
                      className="max-w-[90vw] max-h-[90vh] object-contain"
                      unoptimized
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün';
                      }}
                    />
                  </div>
                </div>

                {/* Navigation Arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => {
                        setLightboxImageIndex((i) => (i > 0 ? i - 1 : images.length - 1));
                        setZoomLevel(1);
                        setPanPosition({ x: 0, y: 0 });
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10"
                    >
                      <ChevronLeftIcon className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => {
                        setLightboxImageIndex((i) => (i < images.length - 1 ? i + 1 : 0));
                        setZoomLevel(1);
                        setPanPosition({ x: 0, y: 0 });
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10"
                    >
                      <ChevronRightIcon className="w-6 h-6" />
                    </button>
                  </>
                )}

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex justify-center gap-2 pb-4 overflow-x-auto px-4">
                    {images.map((img, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setLightboxImageIndex(index);
                          setZoomLevel(1);
                          setPanPosition({ x: 0, y: 0 });
                        }}
                        className={`relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                          index === lightboxImageIndex 
                            ? 'border-primary-500' 
                            : 'border-white/20 hover:border-white/40'
                        }`}
                      >
                        <Image 
                          src={img} 
                          alt="" 
                          fill 
                          className="object-cover" 
                          unoptimized
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Image Counter */}
                {images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm">
                    {lightboxImageIndex + 1} / {images.length}
                  </div>
                )}
              </div>
            </div>
          )}

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
                  onClick={handleCartToggle}
                  disabled={isAddingToCart}
                  className={`btn-secondary flex-1 flex items-center justify-center gap-2 ${isInCart ? 'bg-red-50 border-red-200 text-red-600' : ''}`}
                >
                  <ShoppingCartIcon className="w-5 h-5" />
                  {isAddingToCart 
                    ? (isInCart ? 'Çıkarılıyor...' : 'Ekleniyor...') 
                    : (isInCart ? 'Sepetten Çıkar' : 'Sepete Ekle')
                  }
                </button>
                <button
                  onClick={handleToggleFavorite}
                  className={`btn-secondary flex-1 flex items-center justify-center gap-2 ${isFavorite ? 'bg-red-50 border-red-200 text-red-600' : ''}`}
                >
                  {isFavorite ? (
                    <>
                      <HeartSolidIcon className="w-5 h-5 text-red-500" />
                      Favorilerden Çıkar
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




