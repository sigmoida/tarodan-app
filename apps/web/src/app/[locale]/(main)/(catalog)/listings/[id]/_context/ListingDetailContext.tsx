/** @format */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  BoltIcon,
  FlagIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  ArrowsRightLeftIcon,
  HeartIcon as HeartOutlineIcon,
} from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";
import { collectionsApi, wishlistApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useCart } from "@/hooks/useCart";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { useAuthGate } from "@/hooks/useAuthGate";
import { getCardImageUrl } from "../_lib/images";
import { useListingData } from "../_hooks/useListingData";
import { useProductGallery } from "../_hooks/useProductGallery";
import { formatTL } from "@/lib/format";

function useListingDetailValue() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const t = useTranslations();
  const locale = useLocale();

  const {
    addToCart,
    addToOfflineCart,
    items: cartItems,
    offlineItems,
    removeFromCart,
    removeFromOfflineCart,
    refetch: fetchCart,
    isLoading: cartLoading,
  } = useCart();
  const { isAuthenticated, user, limits } = useAuthStore();
  const setBuyNowProductId = useCartStore((s) => s.setBuyNowProductId);
  const { requireAuth, authModal } = useAuthGate();

  const data = useListingData(id, isAuthenticated);
  const { listing, effectivePrice, images } = data;
  const gallery = useProductGallery(images, locale);

  // Hard-reload into the detail page may land before the cart store is filled;
  // load it once so the "Add / Remove from cart" label is correct.
  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const canTrade = Boolean(limits?.canTrade);

  const isOwner = !!(
    isAuthenticated &&
    user?.id &&
    listing &&
    (listing.sellerId === user.id || listing.seller?.id === user.id)
  );

  const cartItem = listing
    ? cartItems.find((item) => item.productId === listing.id)
    : null;
  const offlineCartItem = listing
    ? offlineItems.find((item) => item.productId === listing.id)
    : null;
  const isInCart = !!cartItem || !!offlineCartItem;

  // Modal / menu state
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);

  // "My collections" for the add-to-collection picker — fetched via TanStack
  // Query, enabled only while the modal is open.
  const collectionsQuery = useQuery({
    queryKey: queryKeys.myCollections.list(),
    queryFn: async () => {
      const response = await collectionsApi.getMyCollections();
      const list = response.data?.collections || response.data?.data || [];
      return Array.isArray(list) ? list : [];
    },
    enabled: showCollectionModal,
  });

  useEffect(() => {
    if (collectionsQuery.isError) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch collections:", collectionsQuery.error);
      toast.error(t("product.collectionsLoadFailed"));
    }
  }, [collectionsQuery.isError, collectionsQuery.error, t]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  // Seçilen adet (stok-duyarlı stepper — yalnız stok>1 iken gösterilir). Sepete
  // ekleme ve "Hemen Al" bu adedi taşır.
  const [quantity, setQuantity] = useState(1);

  // ---- Cart ----
  const handleAddToCart = async () => {
    if (!listing) return false;
    if (listing.status && listing.status !== "active") {
      toast.error(t("product.productNotForSale"));
      return false;
    }
    setIsAddingToCart(true);
    try {
      await addToCart(listing.id, quantity);
      toast.success(t("product.addedToCart"));
      return true;
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
        return true;
      } else {
        const msg =
          error instanceof Error && error.message
            ? error.message
            : t("common.operationFailed");
        toast.error(msg);
        return false;
      }
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleRemoveFromCart = async () => {
    // The product may sit in both the authed cart and the guest (offline) cart;
    // remove from whichever holds it.
    if (!cartItem && !offlineCartItem) return;
    setIsAddingToCart(true);
    try {
      if (cartItem) {
        await removeFromCart(cartItem.productId);
      } else if (offlineCartItem) {
        removeFromOfflineCart(offlineCartItem.productId);
      }
      toast.success(t("product.removedFromCart"));
    } catch {
      toast.error(t("product.removeFromCartFailed"));
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleCartToggle = () => {
    if (isInCart) handleRemoveFromCart();
    else handleAddToCart();
  };

  const handleBuyNow = async () => {
    if (!listing) return;
    if (listing.status && listing.status !== "active") {
      if (listing.status === "sold" || listing.status === "inactive") {
        router.push(`/products/unavailable/${listing.id}`);
        return false;
      }
      if (listing.status === "reserved") {
        toast.error(t("product.productReserved"));
      } else {
        toast.error(t("product.productNotForSale"));
      }
      return false;
    }
    // Buy Now and Add to Cart share one physical checkout path. Do not add the
    // line twice when it is already in the cart; simply open the cart.
    if (!isInCart) {
      const added = await handleAddToCart();
      if (!added) return false;
    }
    // Ürün sepette KALIR (vazgeçilirse kaybolmasın) ama ödeme kapsamı yalnız
    // bu üründür; sepetteki kalıcı seçim bozulmaz — kullanıcı sepete dönerse
    // eski seçimini olduğu gibi bulur.
    setBuyNowProductId(listing.id);
    router.push("/cart/payment?buyNow=true");
    return true;
  };

  // ---- Offer ----
  const handleMakeOffer = () => {
    if (!isAuthenticated) {
      requireAuth({
        title: t("auth.authRequired"),
        message: t("product.loginToOffer"),
        icon: <BoltIcon className="w-12 h-12 text-primary-500" />,
      });
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
    setShowOfferModal(true);
  };

  // ---- Collections ----
  const handleOpenCollectionModal = () => {
    if (!isAuthenticated || !user) {
      toast.error(t("product.loginToAddCollection"));
      return;
    }
    if (!limits?.canCreateCollections) {
      toast.error(t("product.collectionFeatureNotAvailable"));
      router.push("/membership");
      return;
    }
    // Opening the modal enables the collections query above.
    setShowCollectionModal(true);
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

  // ---- Favorite ----
  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      requireAuth({
        title: t("product.addToFavorites"),
        message: t("auth.memberBenefits"),
        icon: <HeartOutlineIcon className="w-10 h-10 text-danger-500" />,
      });
      return;
    }
    if (isOwner) {
      toast.error(t("product.cannotFavoriteOwn"));
      return;
    }
    try {
      if (data.isFavorite) {
        await wishlistApi.remove(id);
        toast.success(t("product.removedFromFavorites"));
      } else {
        const response = await wishlistApi.add(id);
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.wishlist.check(id),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.all() }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.product.detail(id),
        }),
      ]);
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Toggle favorite error:", error);
      // 409 (Conflict) — already in favorites → treat as success
      if (error?.response?.status === 409) {
        toast.success(t("product.addToFavorites"));
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.wishlist.check(id),
          }),
          queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.all() }),
        ]);
        return;
      }
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          t("common.operationFailed"),
      );
    }
  };

  // ---- Share ----
  const handleShare = () => setShowShareMenu((s) => !s);

  const shareToSocial = async (platform: string) => {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(
      listing?.title || "Check this out on Tarodan!",
    );
    const text = encodeURIComponent(
      `${listing?.title} - ${formatTL(effectivePrice)}`,
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
        } catch {
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
          } catch {
            // share cancelled
          }
        }
        setShowShareMenu(false);
        return;
    }
    if (shareUrl) window.open(shareUrl, "_blank", "width=600,height=400");
    setShowShareMenu(false);
  };

  return {
    id,
    t,
    locale,
    router,
    ...data,
    ...gallery,
    // auth / ownership
    isAuthenticated,
    user,
    limits,
    canTrade,
    isOwner,
    requireAuth,
    // cart
    isInCart,
    cartLoading,
    isAddingToCart,
    quantity,
    setQuantity,
    handleCartToggle,
    handleBuyNow,
    // offer
    handleMakeOffer,
    showOfferModal,
    setShowOfferModal,
    // collections
    handleOpenCollectionModal,
    handleAddToCollection,
    showCollectionModal,
    setShowCollectionModal,
    collections: collectionsQuery.data ?? [],
    loadingCollections: collectionsQuery.isLoading,
    addingToCollection,
    // favorite / share / report
    handleToggleFavorite,
    handleShare,
    shareToSocial,
    showShareMenu,
    showReportModal,
    setShowReportModal,
    // trade
    showTradeModal,
    setShowTradeModal,
    // auth modal (rendered ready-to-drop-in element from useAuthGate)
    authModal,
  };
}

type ListingDetailValue = ReturnType<typeof useListingDetailValue>;

const ListingDetailContext = createContext<ListingDetailValue | null>(null);

export function ListingDetailProvider({ children }: { children: ReactNode }) {
  const value = useListingDetailValue();
  return (
    <ListingDetailContext.Provider value={value}>
      {children}
    </ListingDetailContext.Provider>
  );
}

export function useListingDetail() {
  const ctx = useContext(ListingDetailContext);
  if (!ctx)
    throw new Error(
      "useListingDetail must be used within a ListingDetailProvider",
    );
  return ctx;
}
