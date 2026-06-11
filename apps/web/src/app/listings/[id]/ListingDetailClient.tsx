"use client";

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  Fragment,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import UserAvatar from "@/components/UserAvatar";
import { motion } from "framer-motion";
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
  ArrowPathIcon,
  PlayIcon,
  PauseIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import { Button, Input, Select, Spinner, Textarea } from "@tarodan/ui";
import {
  listingsApi,
  wishlistApi,
  collectionsApi,
  offersApi,
  api,
} from "@/lib/api";
import { formatCondition } from "@/lib/format";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/productPrice";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import dynamic from "next/dynamic";
import { withChunkErrorLogging } from "@/lib/dynamicWithLogging";
import { ButtonLink } from "@/components/ui/ButtonLink";

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(
    () => import("@/components/AuthRequiredModal"),
    "AuthRequiredModal",
  ),
  { ssr: false },
);
const ReportModal = dynamic(
  withChunkErrorLogging(
    () => import("@/components/ReportModal"),
    "ReportModal",
  ),
  { ssr: false },
);
import {
  HeartIcon as HeartOutlineIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "@/i18n";

interface ProductImage {
  id?: string;
  url?: string;
  cardUrl?: string;
  detailUrl?: string;
  sortOrder?: number;
}

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  oldPrice?: number | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  discountPercent?: number | null;
  images: Array<ProductImage | string>;
  brand?: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  };
  manufacturer?: {
    id: string;
    name: string;
    slug: string;
  };
  scale?: string;
  material?: string;
  year?: number;
  condition?: string;
  trade_available?: boolean;
  isTradeEnabled?: boolean;
  quantity?: number | null;
  /** Müsait adet (quantity - reserved); teklif/takas rezervasyonu düşülmüş stok */
  availableQuantity?: number | null;
  status?: "pending" | "active" | "reserved" | "sold" | "inactive" | "rejected";
  sellerId?: string;
  seller?: {
    id: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
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
  attributes?: Array<{
    id: string;
    name: string;
    label: string;
    value: string;
    group: string;
  }>;
  carModel?: {
    id: string;
    name: string;
    slug: string;
    brandSlug?: string;
  };
}

export default function ListingDetailClient() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const { t, locale } = useTranslation();

  const {
    addToCart,
    addToOfflineCart,
    items: cartItems,
    offlineItems,
    removeFromCart,
  } = useCartStore();
  const { isAuthenticated, user, limits } = useAuthStore();

  // Free üyeler takas yapamaz - Premium veya Business üyeler trade yapabilir
  const canTrade =
    limits?.canTrade ??
    (user?.membershipTier === "basic" ||
      user?.membershipTier === "premium" ||
      user?.membershipTier === "business");
  const [showTradeModal, setShowTradeModal] = useState(false);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collections, setCollections] = useState<any[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reviewSortBy, setReviewSortBy] = useState("newest");
  const [reviewFilterScore, setReviewFilterScore] = useState<number | null>(
    null,
  );
  const [authModalConfig, setAuthModalConfig] = useState({
    title: "",
    message: "",
    icon: null as React.ReactNode,
  });
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [magnifierPosition, setMagnifierPosition] = useState({ x: 0, y: 0 });
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [imageContainerRef, setImageContainerRef] =
    useState<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const zoomPreviewRef = useRef<HTMLDivElement | null>(null);
  const viewCountedRef = useRef<boolean>(false);

  // 360° View state
  const [show360Modal, setShow360Modal] = useState(false);
  const [is360Playing, setIs360Playing] = useState(false);
  const [view360Index, setView360Index] = useState(0);
  const rotation360IntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    viewCountedRef.current = false;
  }, [id]);

  // Listing: React Query (cache + single source of truth)
  const listingQuery = useQuery({
    queryKey: ["listing", id],
    queryFn: async (): Promise<Listing> => {
      const response = await listingsApi.getOne(id);
      const productData = response.data.product || response.data;
      if (!viewCountedRef.current) {
        viewCountedRef.current = true;
        try {
          const viewResponse = await api.post(`/products/${id}/view`);
          if (viewResponse.data?.viewCount !== undefined)
            productData.viewCount = viewResponse.data.viewCount;
        } catch {
          // ignore
        }
      }
      return productData;
    },
    enabled: !!id,
    meta: { page: "listing-detail" },
  });
  const listing = listingQuery.data ?? null;
  const isLoading = listingQuery.isLoading;
  const effectivePrice = listing ? getProductEffectivePrice(listing) : 0;

  // Wishlist check: React Query (only when authenticated)
  const wishlistQuery = useQuery({
    queryKey: ["wishlist-check", id],
    queryFn: async () => {
      const response = await wishlistApi.check(id);
      return response.data?.inWishlist ?? false;
    },
    enabled: !!id && !!isAuthenticated,
    meta: { page: "listing-detail-wishlist" },
  });
  const isFavorite = wishlistQuery.data ?? false;

  // Reviews: React Query
  const reviewsQuery = useQuery({
    queryKey: ["listing-reviews", id, reviewSortBy, reviewFilterScore],
    queryFn: async () => {
      const params: Record<string, any> = { sortBy: reviewSortBy };
      if (reviewFilterScore) params.score = reviewFilterScore;
      const [reviewsRes, statsRes] = await Promise.all([
        api.get(`/ratings/products/${id}`, { params }),
        api.get(`/ratings/products/${id}/stats`),
      ]);
      const reviewsList =
        reviewsRes.data?.ratings || reviewsRes.data?.data || [];
      const stats = statsRes.data;
      return {
        reviews: reviewsList,
        stats: stats
          ? {
              averageRating: stats.averageScore || 0,
              totalRatings: stats.totalRatings || 0,
              scoreDistribution: stats.scoreDistribution,
            }
          : null,
      };
    },
    enabled: !!id,
    meta: { page: "listing-detail-reviews" },
  });
  const reviews = reviewsQuery.data?.reviews ?? [];
  const reviewStats = reviewsQuery.data?.stats ?? null;
  const reviewsLoading = reviewsQuery.isLoading;

  // Check if product is in cart
  const cartItem = listing
    ? cartItems.find((item) => item.productId === listing.id)
    : null;
  const offlineCartItem = listing
    ? offlineItems.find((item) => item.productId === listing.id)
    : null;
  const isInCart = !!cartItem || !!offlineCartItem;

  // Helper: detail URL for gallery/lightbox
  const getDetailImageUrl = (image: ProductImage | string): string => {
    if (typeof image === "string")
      return image || "https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün";
    return (
      (image as ProductImage)?.detailUrl ??
      (image as ProductImage)?.cardUrl ??
      (image as ProductImage)?.url ??
      "https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün"
    );
  };
  const getCardImageUrl = (image: ProductImage | string): string => {
    if (typeof image === "string")
      return image || "https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün";
    return (
      (image as ProductImage)?.cardUrl ??
      (image as ProductImage)?.detailUrl ??
      (image as ProductImage)?.url ??
      "https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün"
    );
  };

  // Calculate images array (detail URLs for gallery/lightbox)
  const images = useMemo(() => {
    if (!listing)
      return ["https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün"];
    return listing.images?.length
      ? listing.images.map((img) => getDetailImageUrl(img))
      : ["https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün"];
  }, [listing]);

  // Handle ESC key to close lightbox
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLightboxOpen) {
        setIsLightboxOpen(false);
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return;

      if (e.key === "ArrowLeft") {
        setLightboxImageIndex((i) => (i > 0 ? i - 1 : images.length - 1));
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      } else if (e.key === "ArrowRight") {
        setLightboxImageIndex((i) => (i < images.length - 1 ? i + 1 : 0));
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleEsc);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen, images.length]);

  // Sync lightbox image index with active image index
  useEffect(() => {
    if (isLightboxOpen) {
      setLightboxImageIndex(activeImageIndex);
    }
  }, [isLightboxOpen, activeImageIndex]);

  const handleAddToCart = async () => {
    if (!listing) return;

    if (listing.status && listing.status !== "active") {
      toast.error(t("product.productNotForSale"));
      return;
    }

    setIsAddingToCart(true);
    try {
      await addToCart(listing.id);
      toast.success(t("product.addedToCart"));
    } catch (error: any) {
      if (error?.message === "AUTH_REQUIRED") {
        const imgUrl = getCardImageUrl(listing.images?.[0] ?? "");
        addToOfflineCart({
          productId: listing.id,
          title: listing.title,
          price: listing.price,
          imageUrl: imgUrl,
          seller: {
            id: listing.seller?.id || "",
            displayName: listing.seller?.displayName || "",
          },
        });
        toast.success(t("product.addedToCart"));
      } else {
        const msg =
          error instanceof Error && error.message
            ? error.message
            : t("common.operationFailed");
        toast.error(msg);
      }
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleRemoveFromCart = async () => {
    if (!cartItem) return;

    setIsAddingToCart(true);
    try {
      await removeFromCart(cartItem.productId);
      toast.success(t("product.removedFromCart"));
    } catch (error) {
      toast.error(t("product.removeFromCartFailed"));
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

    // Stokta yoksa toast yerine alıcıyı dedicated sayfaya gönder — orada
    // hero + benzer ürünler önerisi var.
    if (listing.status && listing.status !== "active") {
      if (listing.status === "sold" || listing.status === "inactive") {
        router.push(`/products/unavailable/${listing.id}`);
        return;
      }
      if (listing.status === "reserved") {
        toast.error(t("product.productReserved"));
      } else {
        toast.error(t("product.productNotForSale"));
      }
      return;
    }

    router.push(`/checkout?productId=${listing.id}`);
  };

  const handleMakeOffer = () => {
    if (!isAuthenticated) {
      setAuthModalConfig({
        title: t("auth.authRequired"),
        message: t("product.loginToOffer"),
        icon: <BoltIcon className="w-12 h-12 text-primary-500" />,
      });
      setShowAuthModal(true);
      return;
    }

    if (!listing || listing.status !== "active") {
      toast.error(t("product.productNotForSale"));
      return;
    }

    if (isOwner) {
      toast.error(t("product.cannotOfferOwn"));
      return;
    }

    setOfferAmount("");
    setOfferMessage("");
    setShowOfferModal(true);
  };

  const handleSubmitOffer = async () => {
    if (!listing) return;

    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error(t("product.enterValidAmount"));
      return;
    }

    const minOffer = effectivePrice * 0.5; // Minimum %50 of current price
    if (amount < minOffer) {
      toast.error(`Min: ${minOffer.toFixed(2)} TL (50%)`);
      return;
    }

    if (amount >= effectivePrice) {
      toast.error(t("product.offerMustBeLower"));
      return;
    }

    setIsSubmittingOffer(true);
    try {
      await offersApi.create({
        productId: listing.id,
        amount: amount,
        message: offerMessage.trim() || undefined,
      });
      toast.success(t("product.offerSentSuccess"));
      setShowOfferModal(false);
      setOfferAmount("");
      setOfferMessage("");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || t("product.offerFailed");
      toast.error(errorMessage);
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const isOwner =
    isAuthenticated &&
    user?.id &&
    listing &&
    (listing.sellerId === user.id || listing.seller?.id === user.id);

  const handleOpenCollectionModal = async () => {
    if (!isAuthenticated || !user) {
      toast.error(t("product.loginToAddCollection"));
      return;
    }

    if (!limits?.canCreateCollections) {
      toast.error(t("product.collectionFeatureNotAvailable"));
      router.push("/pricing");
      return;
    }

    setShowCollectionModal(true);
    setLoadingCollections(true);
    try {
      const response = await collectionsApi.getMyCollections();
      const data = response.data?.collections || response.data?.data || [];
      setCollections(Array.isArray(data) ? data : []);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch collections:", error);
      toast.error(t("product.collectionsLoadFailed"));
    } finally {
      setLoadingCollections(false);
    }
  };

  const handleAddToCollection = async (collectionId: string) => {
    if (!listing) return;

    setAddingToCollection(true);
    try {
      await collectionsApi.addItem(collectionId, { productId: listing.id });
      toast.success(t("product.addedToCollection"));
      setShowCollectionModal(false);
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to add to collection:", error);
      toast.error(error.response?.data?.message || t("common.operationFailed"));
    } finally {
      setAddingToCollection(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      setAuthModalConfig({
        title: t("product.addToFavorites"),
        message: t("auth.memberBenefits"),
        icon: <HeartOutlineIcon className="w-10 h-10 text-danger-500" />,
      });
      setShowAuthModal(true);
      return;
    }

    if (isOwner) {
      toast.error(t("product.cannotFavoriteOwn"));
      return;
    }

    try {
      if (isFavorite) {
        await wishlistApi.remove(id);
        toast.success(t("product.removedFromFavorites"));
      } else {
        const response = await wishlistApi.add(id);
        // API response'unu kontrol et
        if (
          response?.data ||
          response?.status === 200 ||
          response?.status === 201
        ) {
          toast.success(t("product.addToFavorites"));
        } else {
          throw new Error("Unexpected response format");
        }
      }
      // State'i hemen güncelle
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wishlist-check", id] }),
        queryClient.invalidateQueries({ queryKey: ["wishlist"] }),
        queryClient.invalidateQueries({ queryKey: ["listing", id] }),
      ]);
    } catch (error: any) {
      // Daha detaylı error handling
      if (process.env.NODE_ENV === "development") {
        console.error("Toggle favorite error:", error);
      }

      // 409 (Conflict) - zaten favorilerde ise başarılı say
      if (error?.response?.status === 409) {
        toast.success(t("product.addToFavorites"));
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["wishlist-check", id] }),
          queryClient.invalidateQueries({ queryKey: ["wishlist"] }),
        ]);
        return;
      }

      const message =
        error?.response?.data?.message ||
        error?.message ||
        t("common.operationFailed");
      toast.error(message);
    }
  };

  const handleShare = () => {
    setShowShareMenu(!showShareMenu);
  };

  const shareToSocial = async (platform: string) => {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(
      listing?.title || "Check this out on Tarodan!",
    );
    const text = encodeURIComponent(
      `${listing?.title} - ${effectivePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
    );

    let shareUrl = "";

    switch (platform) {
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
        break;
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
        break;
      case "whatsapp":
        shareUrl = `https://wa.me/?text=${text}%20${url}`;
        break;
      case "telegram":
        shareUrl = `https://t.me/share/url?url=${url}&text=${text}`;
        break;
      case "copy":
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast.success(t("common.copied"));
        } catch (e) {
          toast.error(t("common.copyFailed"));
        }
        setShowShareMenu(false);
        return;
      case "native":
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
      window.open(shareUrl, "_blank", "width=600,height=400");
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
    setDragStart({
      x: e.clientX - panPosition.x,
      y: e.clientY - panPosition.y,
    });
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
  const handleMagnifierMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
        const isOverLeftButton =
          mouseX >= buttonOffset &&
          mouseX <= buttonOffset + buttonSize &&
          mouseY >= centerY - buttonSize / 2 &&
          mouseY <= centerY + buttonSize / 2;

        // Check if mouse is over right button (right-4, centered vertically)
        const isOverRightButton =
          mouseX >= rect.width - buttonOffset - buttonSize &&
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
        if (
          mouseX >= 0 &&
          mouseX <= rect.width &&
          mouseY >= 0 &&
          mouseY <= rect.height
        ) {
          setMagnifierPosition({ x, y });
          setShowMagnifier(true);

          // Directly update background position for smooth tracking
          if (zoomPreviewRef.current) {
            const zoomLevel = 3;
            const bgX = -x * zoomLevel + rect.width / 2;
            const bgY = -y * zoomLevel + rect.height / 2;
            zoomPreviewRef.current.style.backgroundPosition = `${bgX}px ${bgY}px`;
          }
        } else {
          setShowMagnifier(false);
        }
      });
    },
    [imageContainerRef],
  );

  const handleMagnifierMouseLeave = () => {
    setShowMagnifier(false);
  };

  // 360° View handlers
  const open360View = () => {
    if (images.length < 2) {
      toast.error(
        locale === "en"
          ? "Multiple images required for 360° view"
          : "360° görüntüleme için birden fazla resim gerekli",
      );
      return;
    }
    setView360Index(0);
    setShow360Modal(true);
    setIs360Playing(true);
  };

  const close360View = () => {
    setShow360Modal(false);
    setIs360Playing(false);
    if (rotation360IntervalRef.current) {
      clearInterval(rotation360IntervalRef.current);
      rotation360IntervalRef.current = null;
    }
  };

  const toggle360Play = () => {
    setIs360Playing(!is360Playing);
  };

  // 360° auto-rotation effect
  useEffect(() => {
    if (show360Modal && is360Playing && images.length > 1) {
      rotation360IntervalRef.current = setInterval(() => {
        setView360Index((prev) => (prev + 1) % images.length);
      }, 800); // Change image every 800ms
    } else if (rotation360IntervalRef.current) {
      clearInterval(rotation360IntervalRef.current);
      rotation360IntervalRef.current = null;
    }

    return () => {
      if (rotation360IntervalRef.current) {
        clearInterval(rotation360IntervalRef.current);
        rotation360IntervalRef.current = null;
      }
    };
  }, [show360Modal, is360Playing, images.length]);

  // Check if trade is available
  const isTradeAvailable =
    listing?.trade_available || listing?.isTradeEnabled || false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="aspect-square bg-border-subtle rounded" />
              <div className="space-y-4">
                <div className="h-8 bg-border-subtle rounded w-3/4" />
                <div className="h-6 bg-border-subtle rounded w-1/2" />
                <div className="h-10 bg-border-subtle rounded w-1/3" />
                <div className="h-32 bg-border-subtle rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-muted">{t("product.listingNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-4 sm:py-8">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center flex-wrap gap-y-1 text-sm text-muted mb-6 overflow-x-auto whitespace-nowrap pb-2"
        >
          <Link
            href="/"
            className="hover:text-primary-500 transition-colors text-muted"
          >
            {t("common.home")}
          </Link>
          <ChevronRightIcon
            className="w-4 h-4 mx-1 flex-shrink-0 text-subtle"
            aria-hidden
          />
          <Link
            href="/listings"
            className="hover:text-primary-500 transition-colors text-muted"
          >
            {t("common.listings")}
          </Link>
          {listing.brand && (
            <>
              <ChevronRightIcon className="w-4 h-4 mx-2 flex-shrink-0" />
              <Link
                href={`/brands/${listing.brand.slug}`}
                className="hover:text-primary-500 transition-colors font-medium text-heading"
              >
                {listing.brand.name}
              </Link>
            </>
          )}
          {listing.carModel && (
            <>
              <ChevronRightIcon className="w-4 h-4 mx-2 flex-shrink-0" />
              <Link
                href={`/search?carModel=${listing.carModel.slug}`}
                className="hover:text-primary-500 transition-colors"
              >
                {listing.carModel.name}
              </Link>
            </>
          )}
          <ChevronRightIcon className="w-4 h-4 mx-2 flex-shrink-0" />
          <span className="text-subtle truncate max-w-[200px]">
            {listing.title}
          </span>
        </nav>

        {(() => {
          const available =
            listing.availableQuantity !== undefined &&
            listing.availableQuantity !== null
              ? listing.availableQuantity
              : listing.quantity;
          return (
            available === 0 && (
              <div className="mb-6 p-4 bg-warning-50 border border-warning-200 rounded-xl">
                <p className="text-warning-800 font-medium">
                  {t("product.stockFinished")}
                </p>
              </div>
            )
          );
        })()}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Image Gallery */}
          <div className="relative">
            {/* Küçük Resim + Büyüteç */}
            <div
              ref={setImageContainerRef}
              className="relative aspect-square bg-surface-elevated rounded overflow-visible shadow-sm cursor-zoom-in"
              onClick={() => openLightbox(activeImageIndex)}
              onMouseMove={handleMagnifierMouseMove}
              onMouseLeave={handleMagnifierMouseLeave}
            >
              <OptimizedImage
                src={images[activeImageIndex]}
                alt={listing.title}
                fill
                className="object-cover rounded"
                fallbackSrc="https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün"
                logContext={{
                  listingId: listing.id,
                  page: "listing-detail-main",
                }}
                priority
              />

              {/* Kare Büyüteç (Viewport) */}
              {showMagnifier && imageContainerRef && (
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: `${magnifierPosition.x}px`,
                    top: `${magnifierPosition.y}px`,
                    transform: "translate(-50%, -50%)",
                    width: "150px",
                    height: "150px",
                    border: "2px solid rgba(255, 140, 0, 0.8)",
                    boxShadow: "0 0 15px rgba(0, 0, 0, 0.3)",
                    overflow: "hidden",
                    background: "rgba(255, 255, 255, 0.2)",
                    borderRadius: "4px",
                  }}
                />
              )}

              {isTradeAvailable && (
                <div className="absolute top-4 left-4 badge badge-trade text-base z-10">
                  <ArrowsRightLeftIcon className="w-5 h-5 mr-1" />
                  {locale === "en" ? "Trade Available" : "Takasa Açık"}
                </div>
              )}

              {images.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((i) =>
                        i > 0 ? i - 1 : images.length - 1,
                      );
                    }}
                    onMouseEnter={() => setShowMagnifier(false)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-surface-elevated/90 rounded-full flex items-center justify-center hover:bg-primary-500 hover:text-inverted transition-colors z-10 group"
                  >
                    <ChevronLeftIcon className="w-6 h-6 text-body group-hover:text-inverted transition-colors" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((i) =>
                        i < images.length - 1 ? i + 1 : 0,
                      );
                    }}
                    onMouseEnter={() => setShowMagnifier(false)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-surface-elevated/90 rounded-full flex items-center justify-center hover:bg-primary-500 hover:text-inverted transition-colors z-10 group"
                  >
                    <ChevronRightIcon className="w-6 h-6 text-body group-hover:text-inverted transition-colors" />
                  </Button>
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
                className="absolute left-full top-0 ml-4 w-full aspect-square bg-surface-elevated rounded overflow-hidden shadow-2xl hidden md:block z-50"
                style={{ maxWidth: "600px" }}
              >
                <div
                  ref={zoomPreviewRef}
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${images[activeImageIndex]})`,
                    backgroundSize: `${imageContainerRef.offsetWidth * 3}px ${imageContainerRef.offsetHeight * 3}px`,
                    backgroundRepeat: "no-repeat",
                    willChange: "background-position",
                  }}
                />
              </motion.div>
            )}

            {/* 360° Button and Thumbnails */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2 items-center">
              {/* 360° View Button - Always visible */}
              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  open360View();
                }}
                className={`flex-shrink-0 w-20 h-20 rounded flex flex-col items-center justify-center transition-all shadow-md ${
                  images.length > 1
                    ? "bg-gradient-to-br from-primary-500 to-primary-600 text-inverted hover:from-primary-600 hover:to-primary-700"
                    : "bg-border-subtle text-subtle cursor-not-allowed"
                }`}
                title={locale === "en" ? "360° View" : "360° Görüntüle"}
                disabled={images.length <= 1}
              >
                <ArrowPathIcon className="w-6 h-6 mb-1" />
                <span className="text-xs font-semibold">360°</span>
              </Button>

              {images.map((img, index) => (
                <Button
                  variant="secondary"
                  key={index}
                  onClick={() => {
                    setActiveImageIndex(index);
                    openLightbox(index);
                  }}
                  className={`relative w-20 h-20 rounded overflow-hidden flex-shrink-0 border-2 transition-colors ${
                    index === activeImageIndex
                      ? "border-primary-500"
                      : "border-transparent"
                  }`}
                >
                  <OptimizedImage
                    src={img}
                    alt=""
                    fill
                    className="object-cover"
                    logContext={{ page: "listing-detail-thumb" }}
                  />
                </Button>
              ))}
            </div>
          </div>

          {/* Lightbox Modal */}
          {isLightboxOpen && (
            <div
              className="fixed inset-0 bg-heading/90 z-50 flex items-center justify-center p-4"
              onClick={closeLightbox}
            >
              <div
                className="relative max-w-7xl w-full h-full flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close Button */}
                <Button
                  variant="secondary"
                  onClick={closeLightbox}
                  className="absolute top-4 right-4 z-10 w-10 h-10 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </Button>

                {/* Zoom Controls */}
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleZoomIn}
                    className="w-10 h-10 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
                    disabled={zoomLevel >= 3}
                  >
                    <MagnifyingGlassPlusIcon className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleZoomOut}
                    className="w-10 h-10 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
                    disabled={zoomLevel <= 1}
                  >
                    <MagnifyingGlassMinusIcon className="w-5 h-5" />
                  </Button>
                </div>

                {/* Image Container */}
                <div
                  className="flex-1 flex items-center justify-center overflow-hidden"
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{
                    cursor:
                      zoomLevel > 1
                        ? isDragging
                          ? "grabbing"
                          : "grab"
                        : "default",
                  }}
                >
                  <div
                    className="relative"
                    style={{
                      transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                      transition: isDragging
                        ? "none"
                        : "transform 0.2s ease-out",
                    }}
                  >
                    <OptimizedImage
                      src={images[lightboxImageIndex]}
                      alt={listing.title}
                      width={1200}
                      height={1200}
                      className="max-w-[90vw] max-h-[90vh] object-contain"
                      fallbackSrc="https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün"
                      logContext={{
                        listingId: listing.id,
                        page: "listing-detail-lightbox",
                      }}
                    />
                  </div>
                </div>

                {/* Navigation Arrows */}
                {images.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setLightboxImageIndex((i) =>
                          i > 0 ? i - 1 : images.length - 1,
                        );
                        setZoomLevel(1);
                        setPanPosition({ x: 0, y: 0 });
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors z-10"
                    >
                      <ChevronLeftIcon className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setLightboxImageIndex((i) =>
                          i < images.length - 1 ? i + 1 : 0,
                        );
                        setZoomLevel(1);
                        setPanPosition({ x: 0, y: 0 });
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors z-10"
                    >
                      <ChevronRightIcon className="w-6 h-6" />
                    </Button>
                  </>
                )}

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex justify-center gap-2 pb-4 overflow-x-auto px-4">
                    {images.map((img, index) => (
                      <Button
                        variant="secondary"
                        key={index}
                        onClick={() => {
                          setLightboxImageIndex(index);
                          setZoomLevel(1);
                          setPanPosition({ x: 0, y: 0 });
                        }}
                        className={`relative w-16 h-16 rounded overflow-hidden flex-shrink-0 border-2 transition-colors ${
                          index === lightboxImageIndex
                            ? "border-primary-500"
                            : "border-surface-elevated/20 hover:border-surface-elevated/40"
                        }`}
                      >
                        <OptimizedImage
                          src={img}
                          alt=""
                          fill
                          className="object-cover"
                          logContext={{ page: "listing-detail-lightbox-thumb" }}
                        />
                      </Button>
                    ))}
                  </div>
                )}

                {/* Image Counter */}
                {images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-elevated/10 backdrop-blur-sm px-4 py-2 rounded text-inverted text-sm">
                    {lightboxImageIndex + 1} / {images.length}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 360° View Modal */}
          {show360Modal && (
            <div
              className="fixed inset-0 bg-heading/95 z-50 flex items-center justify-center p-4"
              onClick={close360View}
            >
              <div
                className="relative max-w-4xl w-full"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center">
                      <ArrowPathIcon
                        className={`w-6 h-6 text-inverted ${is360Playing ? "animate-spin" : ""}`}
                      />
                    </div>
                    <div>
                      <h3 className="text-inverted font-semibold text-lg">
                        {locale === "en" ? "360° View" : "360° Görüntüleme"}
                      </h3>
                      <p className="text-inverted/60 text-sm">
                        {locale === "en"
                          ? "Rotate to see from all angles"
                          : "Tüm açılardan görüntüleyin"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={close360View}
                    className="w-10 h-10 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </Button>
                </div>

                {/* Main Image */}
                <div className="relative aspect-square bg-heading rounded overflow-hidden mb-4">
                  <OptimizedImage
                    src={images[view360Index]}
                    alt={`${listing.title} - ${view360Index + 1}`}
                    fill
                    className="object-contain"
                    fallbackSrc="https://placehold.co/600x600/f3f4f6/9ca3af?text=Ürün"
                    logContext={{
                      listingId: listing.id,
                      page: "listing-detail-360",
                    }}
                  />

                  {/* Navigation Arrows */}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setView360Index((i) =>
                        i > 0 ? i - 1 : images.length - 1,
                      )
                    }
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
                  >
                    <ChevronLeftIcon className="w-6 h-6" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setView360Index((i) =>
                        i < images.length - 1 ? i + 1 : 0,
                      )
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors"
                  >
                    <ChevronRightIcon className="w-6 h-6" />
                  </Button>

                  {/* Progress Bar */}
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex gap-1">
                      {images.map((_, index) => (
                        <Button
                          variant="secondary"
                          key={index}
                          onClick={() => setView360Index(index)}
                          className={`h-1.5 flex-1 rounded-sm transition-all ${
                            index === view360Index
                              ? "bg-primary-500"
                              : "bg-surface-elevated/30 hover:bg-surface-elevated/50"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="secondary"
                    onClick={toggle360Play}
                    className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-inverted rounded font-semibold transition-colors"
                  >
                    {is360Playing ? (
                      <>
                        <PauseIcon className="w-5 h-5" />
                        {locale === "en" ? "Pause" : "Durdur"}
                      </>
                    ) : (
                      <>
                        <PlayIcon className="w-5 h-5" />
                        {locale === "en" ? "Auto Rotate" : "Otomatik Döndür"}
                      </>
                    )}
                  </Button>
                  <div className="text-inverted/60 text-sm">
                    {view360Index + 1} / {images.length}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Details */}
          <div>
            {/* Sold/Out of Stock Banner */}
            {listing.status === "sold" && (
              <div className="bg-danger-50 border border-danger-200 rounded p-4 mb-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-danger-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-danger-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-danger-800">
                    {t("product.soldOut")}
                  </p>
                  <p className="text-sm text-danger-600">
                    {t("product.productNoLongerAvailable")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl lg:text-3xl font-bold text-heading">
                  {listing.title}
                </h1>
                {listing.status === "sold" && (
                  <span className="px-3 py-1 bg-danger-100 text-danger-700 text-sm font-semibold rounded">
                    {t("product.sold")}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={handleToggleFavorite}
                  className="p-2 rounded hover:bg-surface-alt transition-colors"
                  title="Favorilere Ekle"
                >
                  {isFavorite ? (
                    <HeartSolidIcon className="w-6 h-6 text-danger-500" />
                  ) : (
                    <HeartIcon className="w-6 h-6 text-subtle" />
                  )}
                </Button>
                <div className="relative">
                  <Button
                    variant="secondary"
                    onClick={handleShare}
                    className="p-2 rounded hover:bg-surface-alt transition-colors"
                    title="Paylaş"
                  >
                    <ShareIcon className="w-6 h-6 text-subtle" />
                  </Button>

                  {/* Share Dropdown */}
                  {showShareMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-surface-elevated rounded shadow-lg border border-border py-2 z-50">
                      <Button
                        variant="secondary"
                        onClick={() => shareToSocial("whatsapp")}
                        className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                      >
                        <span className="text-success-500 text-lg">📱</span>
                        WhatsApp
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => shareToSocial("twitter")}
                        className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                      >
                        <span className="text-primary-400 text-lg">𝕏</span>
                        Twitter / X
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => shareToSocial("facebook")}
                        className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                      >
                        <span className="text-primary-600 text-lg">📘</span>
                        Facebook
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => shareToSocial("telegram")}
                        className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                      >
                        <span className="text-primary-500 text-lg">✈️</span>
                        Telegram
                      </Button>
                      <hr className="my-1" />
                      <Button
                        variant="secondary"
                        onClick={() => shareToSocial("copy")}
                        className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                      >
                        <span className="text-muted text-lg">📋</span>
                        Linki Kopyala
                      </Button>
                      {typeof navigator !== "undefined" &&
                        "share" in navigator && (
                          <Button
                            variant="secondary"
                            onClick={() => shareToSocial("native")}
                            className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                          >
                            <span className="text-muted text-lg">🔗</span>
                            Diğer...
                          </Button>
                        )}
                    </div>
                  )}
                </div>
                {/* Report Button */}
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!isAuthenticated) {
                      setAuthModalConfig({
                        title: t("product.reportListing"),
                        message: t("product.reportListingMsg"),
                        icon: (
                          <FlagIcon className="w-10 h-10 text-danger-500" />
                        ),
                      });
                      setShowAuthModal(true);
                    } else {
                      setShowReportModal(true);
                    }
                  }}
                  className="p-2 rounded hover:bg-danger-50 transition-colors"
                  title={t("product.reportListing")}
                >
                  <FlagIcon className="w-6 h-6 text-subtle hover:text-danger-500" />
                </Button>
              </div>
            </div>

            <div className="mb-4">
              {isProductOnSaleDisplay(listing) && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl text-subtle line-through">
                    {getProductOriginalPriceForDisplay(listing).toLocaleString(
                      "tr-TR",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )}{" "}
                    TL
                  </span>
                  <span className="bg-danger-500 text-inverted text-sm font-bold px-2 py-0.5 rounded">
                    %
                    {listing.discountPercent ??
                      (listing.oldPrice != null && listing.price
                        ? Math.round(
                            (1 -
                              Number(listing.price) /
                                Number(listing.oldPrice)) *
                              100,
                          )
                        : 0)}{" "}
                    indirim
                  </span>
                </div>
              )}
              <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-500">
                {effectivePrice.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </p>
            </div>

            {/* View & Like Stats */}
            <div className="flex items-center gap-4 text-sm text-muted mb-6">
              <div className="flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                <span>
                  {listing.viewCount || 0} {t("product.views")}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <HeartIcon className="w-4 h-4" />
                <span>
                  {listing.likeCount || 0} {t("product.likes")}
                </span>
              </div>
            </div>

            {/* Quick Info - Özet özellikler, tekrarsız */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3 sm:gap-4 sm:p-5 bg-surface-elevated rounded shadow-sm border border-border-subtle mb-4 sm:mb-6">
              {listing.brand && (
                <div className="text-center p-2">
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                    {t("product.brand")}
                  </p>
                  <Link
                    href={`/brands/${listing.brand.slug}`}
                    className="font-semibold text-heading hover:text-primary-500 transition-colors"
                  >
                    {listing.brand.name}
                  </Link>
                </div>
              )}
              <div className="text-center p-2">
                <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  {t("product.scale")}
                </p>
                <p className="font-semibold text-heading">
                  {listing.scale ||
                    listing.attributes?.find(
                      (a: any) => a.group === "Ölçek" || a.label === "Ölçek",
                    )?.value ||
                    "—"}
                </p>
              </div>
              <div className="text-center p-2">
                <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  {locale === "en" ? "Material" : "Malzeme"}
                </p>
                <p className="font-semibold text-heading">
                  {listing.material ||
                    listing.attributes?.find(
                      (a) => a.group === "material" || a.group === "Malzeme",
                    )?.value ||
                    "—"}
                </p>
              </div>
              {listing.manufacturer && (
                <div className="text-center p-2">
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                    {locale === "en" ? "Manufacturer" : "Üretici"}
                  </p>
                  <p className="font-semibold text-heading">
                    {listing.manufacturer.name}
                  </p>
                </div>
              )}
              {listing.category && (
                <div className="text-center p-2">
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                    {t("product.category")}
                  </p>
                  <p className="font-semibold text-heading">
                    {listing.category.name}
                  </p>
                </div>
              )}
              {listing.condition && (
                <div className="text-center p-2">
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                    {locale === "en" ? "Condition" : "Durum"}
                  </p>
                  <p className="font-semibold text-heading">
                    {formatCondition(listing.condition, locale)}
                  </p>
                </div>
              )}
              <div className="text-center p-2">
                <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  {locale === "en" ? "Year" : "Yıl"}
                </p>
                <p className="font-semibold text-heading">
                  {listing.year ?? "—"}
                </p>
              </div>
              {((listing.availableQuantity !== undefined &&
                listing.availableQuantity !== null) ||
                (listing.quantity !== undefined &&
                  listing.quantity !== null)) && (
                <div className="text-center p-2">
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
                    {locale === "en" ? "Stock" : "Stok"}
                  </p>
                  <p className="font-semibold text-heading">
                    {(() => {
                      const available =
                        listing.availableQuantity !== undefined &&
                        listing.availableQuantity !== null
                          ? listing.availableQuantity
                          : listing.quantity;
                      if (available === null || available === undefined)
                        return locale === "en" ? "Unlimited" : "Sınırsız";
                      return available > 0
                        ? `${available} ${locale === "en" ? "available" : "adet"}`
                        : t("product.stockFinished");
                    })()}
                  </p>
                </div>
              )}
            </div>

            {/* Description & Details Tabbed Layout would be better, but listing details below description is fine */}
            <div className="bg-surface-elevated rounded p-6 shadow-sm border border-border-subtle mb-6">
              <h2 className="text-base font-semibold text-heading mb-3 flex items-center gap-2">
                <span
                  className="w-1 h-5 bg-primary-500 rounded-sm"
                  aria-hidden
                />
                {t("product.description")}
              </h2>
              <div className="prose prose-sm max-w-none text-muted whitespace-pre-line leading-relaxed">
                {listing.description || t("product.noDescription")}
              </div>

              {/* Teknik Özellikler - Quick Info'da olmayan alanlar (tekrar yok) */}
              {(listing.attributes?.filter(
                (a) =>
                  a.group !== "scale" &&
                  a.group !== "material" &&
                  a.group !== "Malzeme",
              )?.length ?? 0) > 0 || listing.carModel ? (
                <div className="border-t pt-6 mt-6">
                  <h3 className="text-base font-semibold text-heading mb-3 flex items-center gap-2">
                    <span
                      className="w-1 h-5 bg-info-500 rounded-sm"
                      aria-hidden
                    />
                    {locale === "en"
                      ? "Technical details"
                      : "Teknik özellikler"}
                  </h3>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {listing.carModel && (
                      <>
                        <dt className="text-sm text-muted">
                          {locale === "en" ? "Model" : "Model"}
                        </dt>
                        <dd className="text-sm font-medium text-heading">
                          {listing.carModel.name}
                        </dd>
                      </>
                    )}
                    {listing.attributes
                      ?.filter(
                        (attr) =>
                          attr.group !== "scale" &&
                          attr.group !== "material" &&
                          attr.group !== "Malzeme",
                      )
                      ?.map((attr) => (
                        <Fragment key={attr.id}>
                          <dt className="text-sm text-muted">
                            {attr.label}
                          </dt>
                          <dd className="text-sm font-medium text-heading">
                            {attr.value}
                          </dd>
                        </Fragment>
                      ))}
                  </dl>
                </div>
              ) : null}
            </div>

            {/* Seller Info */}
            {listing.seller && (
              <div className="bg-surface-elevated rounded p-4 mb-6">
                <div className="flex items-center gap-4">
                  {isAuthenticated ? (
                    <Link
                      href={`/seller/${listing.seller.id}`}
                      className="flex-shrink-0"
                    >
                      <UserAvatar
                        displayName={listing.seller.displayName}
                        avatarUrl={listing.seller.avatarUrl}
                        size="md"
                        className="hover:ring-2 hover:ring-primary-500 transition-all"
                      />
                    </Link>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setAuthModalConfig({
                          title: t("product.viewSellerProfile"),
                          message: t("product.viewSellerProfileMsg"),
                          icon: (
                            <UserIcon className="w-10 h-10 text-subtle" />
                          ),
                        });
                        setShowAuthModal(true);
                      }}
                      className="flex-shrink-0"
                    >
                      <UserAvatar
                        displayName={listing.seller.displayName}
                        avatarUrl={listing.seller.avatarUrl}
                        size="md"
                        className="hover:ring-2 hover:ring-primary-500 transition-all cursor-pointer"
                      />
                    </Button>
                  )}
                  <div className="flex-1">
                    {isAuthenticated ? (
                      <Link
                        href={`/seller/${listing.seller.id}`}
                        className="font-semibold hover:text-primary-500 transition-colors"
                      >
                        {listing.seller.displayName ||
                          listing.seller.username ||
                          t("product.seller")}
                      </Link>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAuthModalConfig({
                            title: t("product.viewSellerProfile"),
                            message: t("product.viewSellerProfileMsg"),
                            icon: (
                              <UserIcon className="w-10 h-10 text-subtle" />
                            ),
                          });
                          setShowAuthModal(true);
                        }}
                        className="font-semibold hover:text-primary-500 transition-colors text-left cursor-pointer"
                      >
                        {listing.seller.displayName ||
                          listing.seller.username ||
                          t("product.seller")}
                      </Button>
                    )}
                    {(listing.seller as { isPremium?: boolean }).isPremium && (
                      <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        <StarIcon className="w-3 h-3" />
                        Premium
                      </span>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted">
                      {listing.seller.rating && listing.seller.rating > 0 ? (
                        <div className="flex items-center">
                          <StarIcon className="w-4 h-4 text-warning-400 mr-1" />
                          {listing.seller.rating.toFixed(1)}
                          {(listing.seller as { totalRatings?: number })
                            .totalRatings != null &&
                            (listing.seller as { totalRatings?: number })
                              .totalRatings! > 0 && (
                              <span className="ml-1 text-subtle">
                                (
                                {
                                  (listing.seller as { totalRatings?: number })
                                    .totalRatings
                                }
                                )
                              </span>
                            )}
                        </div>
                      ) : (
                        <div className="flex items-center text-subtle">
                          <StarIcon className="w-4 h-4 mr-1" />
                          <span>
                            {locale === "en"
                              ? "No ratings yet"
                              : "Henüz değerlendirme yok"}
                          </span>
                        </div>
                      )}
                      <span>•</span>
                      <span>
                        {listing.seller.listings_count ||
                          listing.seller.productsCount ||
                          0}{" "}
                        {t("product.listings")}
                      </span>
                    </div>
                  </div>
                  {!isOwner &&
                    (isAuthenticated ? (
                      <ButtonLink
                        variant="secondary"
                        href={`/messages?user=${listing.seller.id}&listing=${listing.id}`}
                        className="flex gap-2"
                      >
                        <ChatBubbleLeftRightIcon className="w-5 h-5" />
                        {t("product.sendMessage")}
                      </ButtonLink>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAuthModalConfig({
                            title: t("product.sendMessageToSeller"),
                            message: t("product.sendMessageToSellerMsg"),
                            icon: (
                              <ChatBubbleLeftRightIcon className="w-10 h-10 text-primary-500" />
                            ),
                          });
                          setShowAuthModal(true);
                        }}
                        className="gap-2"
                      >
                        <ChatBubbleLeftRightIcon className="w-5 h-5" />
                        {t("product.sendMessage")}
                      </Button>
                    ))}
                </div>
              </div>
            )}

            {/* Product Status Banner */}
            {listing.status && listing.status !== "active" && (
              <div
                className={`rounded p-4 mb-4 ${
                  listing.status === "reserved"
                    ? "bg-warning-50 border border-warning-200"
                    : listing.status === "sold"
                      ? "bg-danger-50 border border-danger-200"
                      : "bg-surface border border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <ExclamationTriangleIcon
                    className={`w-6 h-6 ${
                      listing.status === "reserved"
                        ? "text-warning-600"
                        : listing.status === "sold"
                          ? "text-danger-600"
                          : "text-muted"
                    }`}
                  />
                  <div>
                    <p
                      className={`font-semibold ${
                        listing.status === "reserved"
                          ? "text-warning-800"
                          : listing.status === "sold"
                            ? "text-danger-800"
                            : "text-body"
                      }`}
                    >
                      {listing.status === "reserved" &&
                        t("product.statusReserved")}
                      {listing.status === "sold" && t("product.statusSold")}
                      {listing.status === "pending" &&
                        t("product.statusPending")}
                      {listing.status === "inactive" &&
                        t("product.statusInactive")}
                      {listing.status === "rejected" &&
                        t("product.statusRejected")}
                    </p>
                    <p className="text-sm text-muted">
                      {listing.status === "reserved" &&
                        t("product.statusReservedDesc")}
                      {listing.status === "sold" && t("product.statusSoldDesc")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* Owner Notice */}
              {isOwner && (
                <div className="bg-info-50 border border-info-200 rounded p-4 text-center">
                  <p className="text-info-800 font-medium">
                    {locale === "en"
                      ? "This is your listing"
                      : "Bu sizin ilanınız"}
                  </p>
                  <div className="flex gap-2 justify-center mt-3">
                    <ButtonLink
                      variant="secondary"
                      href={`/listings/${listing.id}/edit`}
                    >
                      {locale === "en" ? "Edit Listing" : "İlanı Düzenle"}
                    </ButtonLink>
                    <ButtonLink variant="secondary" href="/profile/listings">
                      {locale === "en" ? "My Listings" : "İlanlarım"}
                    </ButtonLink>
                  </div>
                </div>
              )}

              {/* Owner Actions */}
              {isOwner && (
                <>
                  <ButtonLink
                    href={`/listings/${listing.id}/edit`}
                    className="w-full flex gap-2 py-4 text-lg"
                  >
                    <PencilIcon className="w-6 h-6" />
                    Düzenle
                  </ButtonLink>

                  {limits?.canCreateCollections && (
                    <Button
                      variant="secondary"
                      onClick={handleOpenCollectionModal}
                      className="w-full flex gap-2"
                    >
                      <FolderPlusIcon className="w-5 h-5" />
                      {t("collection.addToCollection")}
                    </Button>
                  )}
                </>
              )}

              {/* Primary Action: Buy Now - Hide for owner */}
              {!isOwner &&
                (() => {
                  const available =
                    listing.availableQuantity !== undefined &&
                    listing.availableQuantity !== null
                      ? listing.availableQuantity
                      : listing.quantity;
                  const hasStock =
                    available === null ||
                    available === undefined ||
                    available > 0;
                  return (
                    <Button
                      onClick={handleBuyNow}
                      disabled={listing.status !== "active" || !hasStock}
                      className="w-full gap-2 py-3 text-base sm:py-4 sm:text-lg"
                    >
                      <BoltIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      {listing.status === "sold"
                        ? t("product.sold")
                        : listing.status === "reserved"
                          ? t("product.reserved")
                          : !hasStock
                            ? t("product.stockFinished")
                            : t("product.buyNow")}
                    </Button>
                  );
                })()}

              {/* Secondary Actions - Hide most for owner */}
              {!isOwner && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {isTradeAvailable && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (listing.status !== "active") {
                          toast.error(t("product.notForSale"));
                          return;
                        }
                        if (!isAuthenticated) {
                          setAuthModalConfig({
                            title: t("auth.loginRequired"),
                            message: t("trade.loginToTrade"),
                            icon: (
                              <ArrowsRightLeftIcon className="w-12 h-12 text-primary-500" />
                            ),
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
                      disabled={listing.status !== "active"}
                      className={`flex items-center justify-center gap-1.5 py-2.5 sm:py-3 text-sm ${
                        listing.status === "active"
                          ? "btn-trade"
                          : "bg-border-subtle text-subtle cursor-not-allowed rounded"
                      }`}
                    >
                      <ArrowsRightLeftIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="truncate">{t("product.trade")}</span>
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={handleMakeOffer}
                    disabled={listing.status !== "active"}
                    className="gap-1.5 py-2.5 sm:py-3"
                  >
                    <BoltIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="truncate">{t("product.makeOffer")}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleCartToggle}
                    disabled={isAddingToCart || listing.status !== "active"}
                    className={`gap-1.5 py-2.5 sm:py-3 ${
                      isInCart
                        ? "bg-danger-50 border-danger-200 text-danger-600"
                        : ""
                    }`}
                  >
                    <ShoppingCartIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="truncate">
                      {isAddingToCart
                        ? isInCart
                          ? t("product.removing")
                          : t("product.adding")
                        : isInCart
                          ? t("product.removeFromCart")
                          : t("product.addToCart")}
                    </span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Product Reviews Section */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-12">
        <div className="bg-surface-elevated rounded shadow-sm p-4 sm:p-6 md:p-8">
          {/* Header: Title + Average Rating */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-heading">
              {t("product.productReviews")}
            </h2>
            {reviewStats && (
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <StarIcon
                      key={star}
                      className={`w-5 h-5 ${
                        star <= (reviewStats.averageRating || 0)
                          ? "text-warning-400 fill-warning-400"
                          : "text-border-strong"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-lg font-semibold text-heading">
                  {(reviewStats.averageRating || 0).toFixed(1)}
                </span>
                <span className="text-muted">
                  ({reviewStats.totalRatings || 0} {t("review.reviews")})
                </span>
              </div>
            )}
          </div>

          {/* Star Distribution + Filters */}
          {reviewStats &&
            reviewStats.scoreDistribution &&
            reviewStats.totalRatings > 0 && (
              <div className="mb-6 p-4 bg-surface rounded-lg">
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Star Distribution Bars */}
                  <div className="flex-1 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = reviewStats.scoreDistribution?.[star] || 0;
                      const pct =
                        reviewStats.totalRatings > 0
                          ? Math.round((count / reviewStats.totalRatings) * 100)
                          : 0;
                      const isActive = reviewFilterScore === star;
                      return (
                        <Button
                          variant="secondary"
                          key={star}
                          onClick={() =>
                            setReviewFilterScore(isActive ? null : star)
                          }
                          className={`flex items-center gap-2 w-full text-left px-2 py-0.5 rounded transition-colors ${isActive ? "bg-warning-100" : "hover:bg-surface-alt"}`}
                        >
                          <span className="text-sm font-medium w-3">
                            {star}
                          </span>
                          <StarIcon className="w-4 h-4 text-warning-400 fill-warning-400 flex-shrink-0" />
                          <div className="flex-1 h-2 bg-border-subtle rounded-full overflow-hidden">
                            <div
                              className="h-full bg-warning-400 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted w-8 text-right">
                            {count}
                          </span>
                        </Button>
                      );
                    })}
                  </div>

                  {/* Sort Dropdown */}
                  <div className="sm:w-48">
                    <label className="block text-xs font-medium text-muted mb-1">
                      {locale === "en" ? "Sort by" : "Sırala"}
                    </label>
                    <Select
                      value={reviewSortBy}
                      onChange={(e) => setReviewSortBy(e.target.value)}
                    >
                      <option value="newest">
                        {locale === "en" ? "Most Recent" : "En Yeni"}
                      </option>
                      <option value="oldest">
                        {locale === "en" ? "Oldest" : "En Eski"}
                      </option>
                      <option value="highest">
                        {locale === "en" ? "Highest Rating" : "En Yüksek Puan"}
                      </option>
                      <option value="lowest">
                        {locale === "en" ? "Lowest Rating" : "En Düşük Puan"}
                      </option>
                      <option value="helpful">
                        {locale === "en" ? "Most Helpful" : "En Faydalı"}
                      </option>
                    </Select>
                    {reviewFilterScore && (
                      <Button
                        variant="secondary"
                        onClick={() => setReviewFilterScore(null)}
                        className="mt-2 text-xs text-primary-500 hover:underline"
                      >
                        {locale === "en" ? "Clear filter" : "Filtreyi temizle"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

          {reviewsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner
                size="lg"
                color="border-primary-500 border-t-transparent"
              />
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-12 bg-surface rounded">
              <ChatBubbleLeftRightIcon className="w-12 h-12 mx-auto mb-4 text-subtle" />
              <p className="text-lg font-medium text-heading mb-2">
                {reviewFilterScore
                  ? locale === "en"
                    ? "No reviews with this rating"
                    : "Bu puana sahip değerlendirme yok"
                  : t("product.noReviews")}
              </p>
              {!reviewFilterScore && (
                <p className="text-muted">{t("product.beFirstToReview")}</p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {reviews.map((review: any) => (
                <div
                  key={review.id}
                  className="border-b border-border-subtle pb-6 last:border-0 last:pb-0"
                >
                  <div className="flex items-start gap-4">
                    <UserAvatar
                      displayName={review.userName || review.user?.displayName}
                      avatarUrl={review.user?.avatarUrl}
                      size="sm"
                    />
                    <div className="flex-1">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className="font-medium text-heading">
                          {review.isAnonymous ||
                          (!review.userName && !review.user?.displayName)
                            ? locale === "en"
                              ? "Anonymous"
                              : "Anonim"
                            : review.userName || review.user?.displayName}
                        </span>
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <StarIcon
                              key={star}
                              className={`w-4 h-4 ${
                                star <= (review.score || 0)
                                  ? "text-warning-400 fill-warning-400"
                                  : "text-border-strong"
                              }`}
                            />
                          ))}
                        </div>
                        {review.isVerifiedPurchase && (
                          <span className="inline-flex items-center gap-1 text-xs text-success-700 bg-success-50 px-2 py-0.5 rounded-full">
                            <CheckBadgeIcon className="w-3.5 h-3.5" />
                            {locale === "en"
                              ? "Verified Purchase"
                              : "Doğrulanmış Alıcı"}
                          </span>
                        )}
                        <span className="text-sm text-muted">
                          {new Date(review.createdAt).toLocaleDateString(
                            "tr-TR",
                          )}
                        </span>
                      </div>
                      {review.title && (
                        <h4 className="font-medium text-heading mb-1">
                          {review.title}
                        </h4>
                      )}
                      {(review.review || review.comment) && (
                        <p className="text-body">
                          {review.review || review.comment}
                        </p>
                      )}
                      {/* Review Images */}
                      {review.images && review.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {review.images.map((img: string, idx: number) => (
                            <a
                              key={idx}
                              href={img}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-20 h-20 rounded-lg overflow-hidden border border-border hover:border-primary-400 transition-colors"
                            >
                              <img
                                src={img}
                                alt={`Review ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      {/* Admin Reply */}
                      {review.adminReply && (
                        <div className="mt-3 p-3 bg-info-50 rounded-lg border-l-4 border-info-400">
                          <p className="text-xs font-semibold text-info-700 mb-1">
                            {locale === "en" ? "Seller Reply" : "Satıcı Yanıtı"}
                          </p>
                          <p className="text-sm text-info-900">
                            {review.adminReply}
                          </p>
                        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/50">
          <div className="bg-surface-elevated rounded p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
            <h2 className="text-xl font-semibold mb-4 text-heading">
              {t("collection.addToCollection")}
            </h2>

            {loadingCollections ? (
              <div className="flex justify-center py-8">
                <Spinner
                  size="lg"
                  color="border-primary-500 border-t-transparent"
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-2">
                  {collections.length > 0 ? (
                    collections.map((collection) => (
                      <Button
                        variant="secondary"
                        key={collection.id}
                        onClick={() => handleAddToCollection(collection.id)}
                        disabled={addingToCollection}
                        className="w-full text-left p-4 bg-surface hover:bg-surface-alt rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <h3 className="font-medium text-heading">
                          {collection.name}
                        </h3>
                        {collection.description && (
                          <p className="text-sm text-muted mt-1 line-clamp-2">
                            {collection.description}
                          </p>
                        )}
                        <p className="text-xs text-muted mt-2">
                          {collection.itemCount || 0}{" "}
                          {locale === "en" ? "products" : "ürün"}
                        </p>
                      </Button>
                    ))
                  ) : (
                    <p className="text-muted text-center py-8">
                      {t("collection.noCollections")}
                    </p>
                  )}

                  {/* New Collection Button */}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowCollectionModal(false);
                      router.push("/collections");
                    }}
                    className="w-full p-4 bg-primary-50 hover:bg-primary-100 border-2 border-dashed border-primary-300 rounded transition-colors text-primary-700 font-medium"
                  >
                    + {t("collection.createNewCollection")}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-border">
              <Button
                variant="secondary"
                onClick={() => setShowCollectionModal(false)}
                className="w-full px-4 py-2 bg-border-subtle hover:bg-border-strong text-body rounded transition-colors font-medium"
              >
                {t("common.cancel")}
              </Button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/50">
          <div className="bg-surface-elevated rounded p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-heading">
                {t("product.makeOffer")}
              </h2>
              <Button
                variant="secondary"
                onClick={() => setShowOfferModal(false)}
                className="text-subtle hover:text-muted"
              >
                <XMarkIcon className="w-6 h-6" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {t("product.productPrice")}
                </label>
                <div className="text-lg font-semibold text-heading">
                  {effectivePrice.toLocaleString("tr-TR")} TL
                </div>
                <p className="text-xs text-muted mt-1">
                  {locale === "en" ? "Minimum offer:" : "Minimum teklif:"}{" "}
                  {Math.round(effectivePrice * 0.5).toLocaleString("tr-TR")} TL
                  (%50)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === "en"
                    ? "Your Offer Amount (TL)"
                    : "Teklif Tutarınız (TL)"}
                </label>
                <Input
                  type="number"
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  placeholder={
                    locale === "en"
                      ? "Enter offer amount"
                      : "Teklif tutarını giriniz"
                  }
                  min={Math.round(effectivePrice * 0.5)}
                  max={Math.max(0, Math.round(effectivePrice) - 1)}
                  className="px-4 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === "en" ? "Message (Optional)" : "Mesaj (Opsiyonel)"}
                </label>
                <Textarea
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder={
                    locale === "en"
                      ? "Message you want to send to seller..."
                      : "Satıcıya iletmek istediğiniz mesaj..."
                  }
                  rows={4}
                  maxLength={500}
                  className="px-4 rounded resize-none"
                />
                <p className="text-xs text-muted mt-1">
                  {offerMessage.length}/500{" "}
                  {locale === "en" ? "characters" : "karakter"}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowOfferModal(false)}
                  className="flex-1 px-4 rounded text-body hover:bg-surface"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleSubmitOffer}
                  disabled={isSubmittingOffer || !offerAmount}
                  className="flex-1 px-4 py-2 bg-primary-500 text-inverted rounded hover:bg-primary-600 disabled:bg-border-strong disabled:cursor-not-allowed"
                >
                  {isSubmittingOffer
                    ? t("common.sending")
                    : t("product.sendOffer")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trade Premium Required Modal */}
      {showTradeModal && (
        <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-elevated rounded max-w-md w-full p-6 text-center"
          >
            <div className="w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ArrowsRightLeftIcon className="w-8 h-8 text-warning-600" />
            </div>
            <h2 className="text-xl font-bold text-heading mb-2">
              {t("trade.premiumRequired")}
            </h2>
            <p className="text-muted mb-6">
              {t("trade.premiumRequiredDesc")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowTradeModal(false)}
                className="flex-1 px-4 py-3 text-body rounded font-medium hover:bg-surface"
              >
                {t("common.cancel")}
              </Button>
              <Link
                href="/membership"
                className="flex-1 px-4 py-3 bg-primary-500 text-inverted rounded font-medium hover:bg-primary-600 transition-colors text-center"
              >
                {t("membership.upgrade")}
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
