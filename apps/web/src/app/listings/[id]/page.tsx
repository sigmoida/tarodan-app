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
  FolderPlusIcon,
  XMarkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  FlagIcon,
  ExclamationTriangleIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { listingsApi, wishlistApi, collectionsApi, offersApi, api } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import AuthRequiredModal from '@/components/AuthRequiredModal';
import ReportModal from '@/components/ReportModal';
import { HeartIcon as HeartOutlineIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

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
  quantity?: number | null;
  status?: 'pending' | 'active' | 'reserved' | 'sold' | 'inactive' | 'rejected';
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
  viewCount?: number;
  likeCount?: number;
}

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { t, locale } = useTranslation();
  
  const { addToCart, items: cartItems, removeFromCart } = useCartStore();
  const { isAuthenticated, user, limits } = useAuthStore();
  
  // Free üyeler takas yapamaz - Premium veya Business üyeler trade yapabilir
  const canTrade = limits?.canTrade ?? (user?.membershipTier === 'premium' || user?.membershipTier === 'business');
  const [showTradeModal, setShowTradeModal] = useState(false);
  
  const [listing, setListing] = useState<Listing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collections, setCollections] = useState<any[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({
    title: '',
    message: '',
    icon: null as React.ReactNode,
  });
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [magnifierPosition, setMagnifierPosition] = useState({ x: 0, y: 0 });
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [imageContainerRef, setImageContainerRef] = useState<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const zoomPreviewRef = useRef<HTMLDivElement | null>(null);
  const viewCountedRef = useRef<boolean>(false); // Track if view has been counted
  
  // Product reviews state
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewStats, setReviewStats] = useState<{ averageRating: number; totalRatings: number; scoreDistribution?: Record<number, number> } | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  
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
      fetchReviews();
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
      const productData = response.data.product || response.data;
      setListing(productData);
      
      // Increment view count ONLY ONCE per page load
      // Use ref to prevent double counting when auth state changes
      if (!viewCountedRef.current) {
        viewCountedRef.current = true;
        try {
          const viewResponse = await api.post(`/products/${id}/view`);
          if (viewResponse.data?.viewCount !== undefined) {
            // Update the listing with the new view count
            setListing((prev: any) => prev ? { ...prev, viewCount: viewResponse.data.viewCount } : prev);
          }
        } catch (viewError) {
          // Silent fail - view tracking is not critical
          console.debug('View tracking skipped or failed');
        }
      }
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

  const fetchReviews = async () => {
    setReviewsLoading(true);
    try {
      const [reviewsRes, statsRes] = await Promise.all([
        api.get(`/ratings/products/${id}`),
        api.get(`/ratings/products/${id}/stats`),
      ]);
      setReviews(reviewsRes.data?.ratings || reviewsRes.data?.data || []);
      // Map API response to frontend expected format
      const stats = statsRes.data;
      setReviewStats(stats ? {
        averageRating: stats.averageScore || 0,
        totalRatings: stats.totalRatings || 0,
        scoreDistribution: stats.scoreDistribution,
      } : null);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleAddToCart = async () => {
    if (!listing) return;
    
    // Check if product is available
    if (listing.status && listing.status !== 'active') {
      toast.error(t('product.productNotForSale'));
      return;
    }
    
    setIsAddingToCart(true);
    try {
      await addToCart({
        productId: listing.id,
        title: listing.title,
        price: Number(listing.price),
        imageUrl: listing.images?.length ? getImageUrl(listing.images[0]) : 'https://placehold.co/96x96/f3f4f6/9ca3af?text=Product',
        seller: {
          id: listing.sellerId || listing.seller?.id || '',
          displayName: listing.seller?.displayName || listing.seller?.username || t('product.seller'),
        },
      });
      toast.success(t('product.addedToCart'));
    } catch (error) {
      toast.error(t('common.operationFailed'));
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleRemoveFromCart = async () => {
    if (!cartItem) return;
    
    setIsAddingToCart(true);
    try {
      await removeFromCart(cartItem.id);
      toast.success(t('product.removedFromCart'));
    } catch (error) {
      toast.error(t('product.removeFromCartFailed'));
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
    
    // Check if product is available for purchase
    if (listing.status && listing.status !== 'active') {
      if (listing.status === 'reserved') {
        toast.error(t('product.productReserved'));
      } else if (listing.status === 'sold') {
        toast.error(t('product.productSold'));
      } else {
        toast.error(t('product.productNotForSale'));
      }
      return;
    }
    
    router.push(`/checkout?productId=${listing.id}`);
  };

  const handleMakeOffer = () => {
    if (!isAuthenticated) {
      setAuthModalConfig({
        title: t('auth.authRequired'),
        message: t('product.loginToOffer'),
        icon: <BoltIcon className="w-12 h-12 text-orange-500" />,
      });
      setShowAuthModal(true);
      return;
    }
    
    if (!listing || listing.status !== 'active') {
      toast.error(t('product.productNotForSale'));
      return;
    }
    
    if (isOwner) {
      toast.error(t('product.cannotOfferOwn'));
      return;
    }
    
    setOfferAmount('');
    setOfferMessage('');
    setShowOfferModal(true);
  };

  const handleSubmitOffer = async () => {
    if (!listing) return;
    
    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error(t('product.enterValidAmount'));
      return;
    }
    
    const minOffer = Number(listing.price) * 0.5; // Minimum %50
    if (amount < minOffer) {
      toast.error(`Min: ${minOffer.toFixed(2)} TL (50%)`);
      return;
    }
    
    if (amount >= Number(listing.price)) {
      toast.error(t('product.offerMustBeLower'));
      return;
    }
    
    setIsSubmittingOffer(true);
    try {
      await offersApi.create({
        productId: listing.id,
        amount: amount,
        message: offerMessage.trim() || undefined,
      });
      toast.success(t('product.offerSentSuccess'));
      setShowOfferModal(false);
      setOfferAmount('');
      setOfferMessage('');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('product.offerFailed');
      toast.error(errorMessage);
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const isOwner = isAuthenticated && user?.id && listing && (
    listing.sellerId === user.id || 
    listing.seller?.id === user.id
  );

  const handleOpenCollectionModal = async () => {
    if (!isAuthenticated || !user) {
      toast.error(t('product.loginToAddCollection'));
      return;
    }
    
    if (!limits?.canCreateCollections) {
      toast.error(t('product.collectionFeatureNotAvailable'));
      router.push('/pricing');
      return;
    }

    setShowCollectionModal(true);
    setLoadingCollections(true);
    try {
      const response = await collectionsApi.getMyCollections();
      const data = response.data?.collections || response.data?.data || [];
      setCollections(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch collections:', error);
      toast.error(t('product.collectionsLoadFailed'));
    } finally {
      setLoadingCollections(false);
    }
  };

  const handleAddToCollection = async (collectionId: string) => {
    if (!listing) return;
    
    setAddingToCollection(true);
    try {
      await collectionsApi.addItem(collectionId, { productId: listing.id });
      toast.success(t('product.addedToCollection'));
      setShowCollectionModal(false);
    } catch (error: any) {
      console.error('Failed to add to collection:', error);
      toast.error(error.response?.data?.message || t('common.operationFailed'));
    } finally {
      setAddingToCollection(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      setAuthModalConfig({
        title: t('product.addToFavorites'),
        message: t('auth.memberBenefits'),
        icon: <HeartOutlineIcon className="w-10 h-10 text-red-500" />,
      });
      setShowAuthModal(true);
      return;
    }
    
    // Cannot favorite own product
    if (isOwner) {
      toast.error(t('product.cannotFavoriteOwn'));
      return;
    }
    
    try {
      if (isFavorite) {
        await wishlistApi.remove(id);
        setIsFavorite(false);
        // Update displayed like count
        if (listing) {
          setListing({ ...listing, likeCount: Math.max(0, (listing.likeCount || 1) - 1) });
        }
        toast.success(t('product.removedFromFavorites'));
      } else {
        await wishlistApi.add(id);
        setIsFavorite(true);
        // Update displayed like count
        if (listing) {
          setListing({ ...listing, likeCount: (listing.likeCount || 0) + 1 });
        }
        toast.success(t('product.addToFavorites'));
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || t('common.operationFailed');
      toast.error(message);
    }
  };

  const handleShare = () => {
    setShowShareMenu(!showShareMenu);
  };

  const shareToSocial = async (platform: string) => {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(listing?.title || 'Check this out on Tarodan!');
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
          toast.success(t('common.copied'));
        } catch (e) {
          toast.error(t('common.copyFailed'));
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
      
      // Check if mouse is over navigation buttons
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Button dimensions and positions
      const buttonSize = 40; // w-10 h-10 = 40px
      const buttonOffset = 16; // left-4/right-4 = 16px
      const centerY = rect.height / 2;
      
      // Check if mouse is over left button (left-4, centered vertically)
      const isOverLeftButton = mouseX >= buttonOffset && 
                               mouseX <= buttonOffset + buttonSize &&
                               mouseY >= centerY - buttonSize / 2 &&
                               mouseY <= centerY + buttonSize / 2;
      
      // Check if mouse is over right button (right-4, centered vertically)
      const isOverRightButton = mouseX >= rect.width - buttonOffset - buttonSize &&
                                mouseX <= rect.width - buttonOffset &&
                                mouseY >= centerY - buttonSize / 2 &&
                                mouseY <= centerY + buttonSize / 2;
      
      // Don't show magnifier if over navigation buttons
      if (isOverLeftButton || isOverRightButton) {
        setShowMagnifier(false);
        return;
      }
      
      let x = mouseX;
      let y = mouseY;
      
      // Büyüteci resmin kenarlarında sınırla
      x = Math.max(halfSize, Math.min(rect.width - halfSize, x));
      y = Math.max(halfSize, Math.min(rect.height - halfSize, y));
      
      // Check if mouse is within image bounds
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
        <p className="text-gray-500">{t('product.listingNotFound')}</p>
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
                  {t('product.tradeAccepted')}
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((i) => (i > 0 ? i - 1 : images.length - 1));
                    }}
                    onMouseEnter={() => setShowMagnifier(false)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-primary-500 hover:text-white transition-colors z-10 group"
                  >
                    <ChevronLeftIcon className="w-6 h-6 text-gray-700 group-hover:text-white transition-colors" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((i) => (i < images.length - 1 ? i + 1 : 0));
                    }}
                    onMouseEnter={() => setShowMagnifier(false)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-primary-500 hover:text-white transition-colors z-10 group"
                  >
                    <ChevronRightIcon className="w-6 h-6 text-gray-700 group-hover:text-white transition-colors" />
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
                      index === activeImageIndex ? 'border-orange-500' : 'border-transparent'
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
                            ? 'border-orange-500' 
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
                  title="Favorilere Ekle"
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
                    title="Paylaş"
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
                {/* Report Button */}
                <button
                  onClick={() => {
                    if (!isAuthenticated) {
                      setAuthModalConfig({
                        title: t('product.reportListing'),
                        message: t('product.reportListingMsg'),
                        icon: <FlagIcon className="w-10 h-10 text-red-500" />,
                      });
                      setShowAuthModal(true);
                    } else {
                      setShowReportModal(true);
                    }
                  }}
                  className="p-2 rounded-full hover:bg-red-50 transition-colors"
                  title={t('product.reportListing')}
                >
                  <FlagIcon className="w-6 h-6 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            </div>

            <p className="text-4xl font-bold text-orange-500 mb-4">
              ₺{Number(listing.price).toLocaleString('tr-TR')}
            </p>

            {/* View & Like Stats */}
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>{listing.viewCount || 0} {t('product.views')}</span>
              </div>
              <div className="flex items-center gap-1">
                <HeartIcon className="w-4 h-4" />
                <span>{listing.likeCount || 0} {t('product.likes')}</span>
              </div>
            </div>

            {/* Quick Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-white rounded-xl mb-6">
              {listing.brand && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">{t('product.brand')}</p>
                  <p className="font-semibold">{listing.brand}</p>
                </div>
              )}
              {listing.scale && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">{t('product.scale')}</p>
                  <p className="font-semibold">{listing.scale}</p>
                </div>
              )}
              {listing.category && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">{t('product.category')}</p>
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
              {listing.quantity !== undefined && listing.quantity !== null && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">{locale === 'en' ? 'Stock' : 'Stok'}</p>
                  <p className="font-semibold">
                    {listing.quantity > 0 ? `${listing.quantity} ${locale === 'en' ? 'available' : 'adet'}` : (locale === 'en' ? 'Out of stock' : 'Stokta yok')}
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">{t('product.description')}</h2>
              <p className="text-gray-600 whitespace-pre-line">
                {listing.description || t('product.noDescription')}
              </p>
            </div>

            {/* Seller Info */}
            {listing.seller && (
              <div className="bg-white rounded-xl p-4 mb-6">
                <div className="flex items-center gap-4">
                  {isAuthenticated ? (
                    <Link href={`/seller/${listing.seller.id}`} className="flex-shrink-0">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center hover:ring-2 hover:ring-orange-500 transition-all">
                        <span className="text-xl">👤</span>
                      </div>
                    </Link>
                  ) : (
                    <button
                      onClick={() => {
                        setAuthModalConfig({
                          title: t('product.viewSellerProfile'),
                          message: t('product.viewSellerProfileMsg'),
                          icon: <span className="text-4xl">👤</span>,
                        });
                        setShowAuthModal(true);
                      }}
                      className="flex-shrink-0"
                    >
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center hover:ring-2 hover:ring-orange-500 transition-all cursor-pointer">
                        <span className="text-xl">👤</span>
                      </div>
                    </button>
                  )}
                  <div className="flex-1">
                    {isAuthenticated ? (
                      <Link href={`/seller/${listing.seller.id}`} className="font-semibold hover:text-orange-500 transition-colors">
                        {listing.seller.displayName || listing.seller.username || t('product.seller')}
                      </Link>
                    ) : (
                      <button
                        onClick={() => {
                          setAuthModalConfig({
                            title: t('product.viewSellerProfile'),
                            message: t('product.viewSellerProfileMsg'),
                            icon: <span className="text-4xl">👤</span>,
                          });
                          setShowAuthModal(true);
                        }}
                        className="font-semibold hover:text-orange-500 transition-colors text-left cursor-pointer"
                      >
                        {listing.seller.displayName || listing.seller.username || t('product.seller')}
                      </button>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <div className="flex items-center">
                        <StarIcon className="w-4 h-4 text-yellow-400 mr-1" />
                        {listing.seller.rating?.toFixed(1) || '0.0'}
                      </div>
                      <span>•</span>
                      <span>
                        {listing.seller.listings_count || listing.seller.productsCount || 0} {t('product.listings')}
                      </span>
                    </div>
                  </div>
                  {!isOwner && (
                    isAuthenticated ? (
                      <Link
                        href={`/messages?user=${listing.seller.id}&listing=${listing.id}`}
                        className="btn-secondary flex items-center gap-2"
                      >
                        <ChatBubbleLeftRightIcon className="w-5 h-5" />
                        {t('product.sendMessage')}
                      </Link>
                    ) : (
                      <button
                        onClick={() => {
                          setAuthModalConfig({
                            title: t('product.sendMessageToSeller'),
                            message: t('product.sendMessageToSellerMsg'),
                            icon: <ChatBubbleLeftRightIcon className="w-10 h-10 text-orange-500" />,
                          });
                          setShowAuthModal(true);
                        }}
                        className="btn-secondary flex items-center gap-2"
                      >
                        <ChatBubbleLeftRightIcon className="w-5 h-5" />
                        {t('product.sendMessage')}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Product Status Banner */}
            {listing.status && listing.status !== 'active' && (
              <div className={`rounded-xl p-4 mb-4 ${
                listing.status === 'reserved' 
                  ? 'bg-yellow-50 border border-yellow-200' 
                  : listing.status === 'sold' 
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-center gap-3">
                  <ExclamationTriangleIcon className={`w-6 h-6 ${
                    listing.status === 'reserved' 
                      ? 'text-yellow-600' 
                      : listing.status === 'sold' 
                        ? 'text-red-600'
                        : 'text-gray-600'
                  }`} />
                  <div>
                    <p className={`font-semibold ${
                      listing.status === 'reserved' 
                        ? 'text-yellow-800' 
                        : listing.status === 'sold' 
                          ? 'text-red-800'
                          : 'text-gray-800'
                    }`}>
                      {listing.status === 'reserved' && t('product.statusReserved')}
                      {listing.status === 'sold' && t('product.statusSold')}
                      {listing.status === 'pending' && t('product.statusPending')}
                      {listing.status === 'inactive' && t('product.statusInactive')}
                      {listing.status === 'rejected' && t('product.statusRejected')}
                    </p>
                    <p className="text-sm text-gray-600">
                      {listing.status === 'reserved' && t('product.statusReservedDesc')}
                      {listing.status === 'sold' && t('product.statusSoldDesc')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* Owner Notice */}
              {isOwner && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-blue-800 font-medium">
                    {locale === 'en' ? 'This is your listing' : 'Bu sizin ilanınız'}
                  </p>
                  <div className="flex gap-2 justify-center mt-3">
                    <Link href={`/listings/${listing.id}/edit`} className="btn-secondary text-sm">
                      {locale === 'en' ? 'Edit Listing' : 'İlanı Düzenle'}
                    </Link>
                    <Link href="/profile/listings" className="btn-secondary text-sm">
                      {locale === 'en' ? 'My Listings' : 'İlanlarım'}
                    </Link>
                  </div>
                </div>
              )}

              {/* Owner Actions */}
              {isOwner && (
                <>
                  <Link
                    href={`/listings/${listing.id}/edit`}
                    className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-lg"
                  >
                    <PencilIcon className="w-6 h-6" />
                    Düzenle
                  </Link>
                  
                  {limits?.canCreateCollections && (
                    <button
                      onClick={handleOpenCollectionModal}
                      className="w-full btn-secondary flex items-center justify-center gap-2"
                    >
                      <FolderPlusIcon className="w-5 h-5" />
                      {t('collection.addToCollection')}
                    </button>
                  )}
                </>
              )}

              {/* Primary Action: Buy Now - Hide for owner */}
              {!isOwner && (
                <button
                  onClick={handleBuyNow}
                  disabled={listing.status !== 'active'}
                  className={`w-full flex items-center justify-center gap-2 py-4 text-lg ${
                    listing.status === 'active' 
                      ? 'btn-primary' 
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed rounded-xl'
                  }`}
                >
                  <BoltIcon className="w-6 h-6" />
                  {listing.status === 'sold' ? t('product.sold') : listing.status === 'reserved' ? t('product.reserved') : t('product.buyNow')}
                </button>
              )}

              {/* Secondary Actions - Hide most for owner */}
              {!isOwner && (
                <div className="flex gap-3">
                  {isTradeAvailable && (
                    <button
                      onClick={() => {
                        if (listing.status !== 'active') {
                          toast.error(t('product.notForSale'));
                          return;
                        }
                        if (!isAuthenticated) {
                          setAuthModalConfig({
                            title: t('auth.loginRequired'),
                            message: t('trade.loginToTrade'),
                            icon: <ArrowsRightLeftIcon className="w-12 h-12 text-orange-500" />,
                          });
                          setShowAuthModal(true);
                          return;
                        }
                        if (!canTrade) {
                          setShowTradeModal(true);
                          return;
                        }
                        router.push(`/trades/new?listing=${listing.id}`);
                      }}
                      disabled={listing.status !== 'active'}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 ${
                        listing.status === 'active' ? 'btn-trade' : 'bg-gray-200 text-gray-400 cursor-not-allowed rounded-xl'
                      }`}
                    >
                      <ArrowsRightLeftIcon className="w-5 h-5" />
                      {t('product.trade')}
                    </button>
                  )}
                  <button
                    onClick={handleMakeOffer}
                    disabled={listing.status !== 'active'}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 ${
                      listing.status !== 'active'
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed rounded-xl'
                        : 'btn-secondary'
                    }`}
                  >
                    <BoltIcon className="w-5 h-5" />
                    {t('product.makeOffer')}
                  </button>
                  <button
                    onClick={handleCartToggle}
                    disabled={isAddingToCart || listing.status !== 'active'}
                    className={`flex-1 flex items-center justify-center gap-2 ${
                      listing.status !== 'active' 
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed rounded-xl py-2'
                        : isInCart 
                          ? 'btn-secondary bg-red-50 border-red-200 text-red-600' 
                          : 'btn-secondary'
                    }`}
                  >
                    <ShoppingCartIcon className="w-5 h-5" />
                    {isAddingToCart 
                      ? (isInCart ? t('product.removing') : t('product.adding')) 
                      : (isInCart ? t('product.removeFromCart') : t('product.addToCart'))
                    }
                  </button>
                  <button
                    onClick={handleToggleFavorite}
                    className={`btn-secondary flex-1 flex items-center justify-center gap-2 ${isFavorite ? 'bg-red-50 border-red-200 text-red-600' : ''}`}
                  >
                    {isFavorite ? (
                      <>
                        <HeartSolidIcon className="w-5 h-5 text-red-500" />
                        {t('product.removeFromFavorites')}
                      </>
                    ) : (
                      <>
                        <HeartIcon className="w-5 h-5" />
                        {t('product.addToFavorites')}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Product Reviews Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {t('product.productReviews')}
            </h2>
            {reviewStats && (
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <StarIcon
                      key={star}
                      className={`w-5 h-5 ${
                        star <= (reviewStats.averageRating || 0)
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-lg font-semibold text-gray-900">
                  {(reviewStats.averageRating || 0).toFixed(1)}
                </span>
                <span className="text-gray-500">
                  ({reviewStats.totalRatings || 0} {t('review.reviews')})
                </span>
              </div>
            )}
          </div>

          {reviewsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <ChatBubbleLeftRightIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                {t('product.noReviews')}
              </p>
              <p className="text-gray-600">
                {t('product.beFirstToReview')}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {reviews.map((review: any) => (
                <div
                  key={review.id}
                  className="border-b border-gray-100 pb-6 last:border-0 last:pb-0"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-orange-600 font-semibold">
                        {review.user?.displayName?.[0]?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {review.user?.displayName || (locale === 'en' ? 'Anonymous' : 'Anonim')}
                        </span>
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <StarIcon
                              key={star}
                              className={`w-4 h-4 ${
                                star <= (review.score || 0)
                                  ? 'text-yellow-400 fill-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-gray-500">
                          {new Date(review.createdAt).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                      {review.title && (
                        <h4 className="font-medium text-gray-900 mb-1">
                          {review.title}
                        </h4>
                      )}
                      {review.comment && (
                        <p className="text-gray-700">{review.comment}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add to Collection Modal */}
      {showCollectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('collection.addToCollection')}</h2>
            
            {loadingCollections ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-2">
                  {collections.length > 0 ? (
                    collections.map((collection) => (
                      <button
                        key={collection.id}
                        onClick={() => handleAddToCollection(collection.id)}
                        disabled={addingToCollection}
                        className="w-full text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <h3 className="font-medium text-gray-900">{collection.name}</h3>
                        {collection.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{collection.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          {collection.itemCount || 0} {locale === 'en' ? 'products' : 'ürün'}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="text-gray-600 text-center py-8">{t('collection.noCollections')}</p>
                  )}
                  
                  {/* New Collection Button */}
                  <button
                    onClick={() => {
                      setShowCollectionModal(false);
                      router.push('/collections');
                    }}
                    className="w-full p-4 bg-orange-50 hover:bg-orange-100 border-2 border-dashed border-orange-300 rounded-lg transition-colors text-orange-700 font-medium"
                  >
                    + {t('collection.createNewCollection')}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowCollectionModal(false)}
                className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={authModalConfig.title}
        message={authModalConfig.message}
        icon={authModalConfig.icon}
      />

      {/* Report Modal */}
      {listing && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          entityType="product"
          entityId={listing.id}
          entityName={listing.title}
          locale={locale}
        />
      )}

      {/* Offer Modal */}
      {showOfferModal && listing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">{t('product.makeOffer')}</h2>
              <button
                onClick={() => setShowOfferModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('product.productPrice')}
                </label>
                <div className="text-lg font-semibold text-gray-900">
                  {Number(listing.price).toLocaleString('tr-TR')} TL
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {locale === 'en' ? 'Minimum offer:' : 'Minimum teklif:'} {Math.round(Number(listing.price) * 0.5).toLocaleString('tr-TR')} TL (%50)
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Your Offer Amount (TL)' : 'Teklif Tutarınız (TL)'}
                </label>
                <input
                  type="number"
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  placeholder={locale === 'en' ? 'Enter offer amount' : 'Teklif tutarını giriniz'}
                  min={Math.round(Number(listing.price) * 0.5)}
                  max={Number(listing.price) - 1}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Message (Optional)' : 'Mesaj (Opsiyonel)'}
                </label>
                <textarea
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder={locale === 'en' ? 'Message you want to send to seller...' : 'Satıcıya iletmek istediğiniz mesaj...'}
                  rows={4}
                  maxLength={500}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {offerMessage.length}/500 {locale === 'en' ? 'characters' : 'karakter'}
                </p>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowOfferModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSubmitOffer}
                  disabled={isSubmittingOffer || !offerAmount}
                  className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isSubmittingOffer ? t('common.sending') : t('product.sendOffer')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trade Premium Required Modal */}
      {showTradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl max-w-md w-full p-6 text-center"
          >
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ArrowsRightLeftIcon className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {t('trade.premiumRequired')}
            </h2>
            <p className="text-gray-600 mb-6">
              {t('trade.premiumRequiredDesc')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowTradeModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <Link
                href="/membership"
                className="flex-1 px-4 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors text-center"
              >
                {t('membership.upgrade')}
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}




