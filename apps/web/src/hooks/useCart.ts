"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  cartApi,
  listingsApi,
  type CartItem,
  type CartResponse,
  type AppliedDiscount,
  type OfflineCartItem,
} from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";

const FREE_SHIPPING_THRESHOLD = 500;
const FLAT_SHIPPING = 29.99;

const calculateShipping = (subtotal: number, count: number) =>
  count === 0 ? 0 : subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;

// `useCart` is mounted by the header and may also be mounted by the current
// page. Keep the login merge single-flight so those consumers cannot submit the
// same persisted guest quantities more than once.
let offlineCartMergePromise: Promise<void> | null = null;

export interface CartLine {
  id: string;
  source: "authenticated" | "offline";
  productId: string;
  title: string;
  imageUrl: string | null;
  sellerId: string;
  sellerName: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  lineTotal: number;
  isAvailable: boolean;
}

/** Pull a human message off an axios error (message may be a string or array). */
function cartErrorMessage(error: unknown, fallback: string): string {
  const msg = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string") return msg;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * The single cart hook (web analogue of admin's resource hooks). Reads the
 * authenticated cart via TanStack Query (`['cart']`) and, for guests, derives
 * the same shape from the client-only offline cart in `cartStore`. Writes branch
 * on auth: server calls go through `cartApi` (then invalidate the query), guest
 * ops mutate the offline store. This replaces the old fetching `cartStore`, which
 * held server data and made API calls itself (CLAUDE.md §7/§8). Consumers get the
 * same fields + methods the store exposed, so they read one unified cart.
 */
export function useCart() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);

  const offlineItems = useCartStore((s) => s.offlineItems);
  const addToOfflineCart = useCartStore((s) => s.addToOfflineCart);
  const removeFromOfflineCart = useCartStore((s) => s.removeFromOfflineCart);
  const clearOfflineCart = useCartStore((s) => s.clearOfflineCart);
  const itemCountHint = useCartStore((s) => s.itemCount);
  const setItemCountHint = useCartStore((s) => s.setItemCount);

  const query = useQuery({
    queryKey: queryKeys.cart.all(),
    queryFn: async () => (await cartApi.get()).data as CartResponse,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.cart.all() });

  useEffect(() => {
    if (!isAuthenticated || offlineItems.length === 0) return;
    if (offlineCartMergePromise) return;

    const itemsToMerge = offlineItems.map(({ productId, quantity }) => ({
      productId,
      quantity,
    }));

    offlineCartMergePromise = (async () => {
      // Add sequentially so a brand-new account cannot race multiple attempts
      // to create its first server cart. A rejected line must not stop the rest.
      for (const { productId, quantity } of itemsToMerge) {
        try {
          await cartApi.addItem(productId, quantity);
        } catch {
          // Already-in-cart, unavailable, and other per-line failures are safe
          // to skip; the authenticated session itself remains successful.
        }
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.cart.all() });
    })()
      // A failed merge or refresh must not interrupt the completed login flow.
      .catch(() => undefined)
      .finally(() => {
        clearOfflineCart();
        offlineCartMergePromise = null;
      });
  }, [clearOfflineCart, isAuthenticated, offlineItems, queryClient]);

  // A single effective list feeds every cart signal. Authenticated users only
  // see server lines; persisted guest lines are deliberately ignored.
  const lines = useMemo<CartLine[]>(() => {
    if (isAuthLoading) return [];

    if (isAuthenticated) {
      return (query.data?.calculation.items ?? []).map((item) => ({
        id: item.id,
        source: "authenticated",
        productId: item.productId,
        title: item.productTitle,
        imageUrl: item.productImage,
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        quantity: item.quantity,
        price: item.effectivePrice,
        originalPrice: item.originalPrice,
        lineTotal: item.lineTotal,
        isAvailable: item.isAvailable,
      }));
    }

    return offlineItems.map((item) => ({
      id: item.id,
      source: "offline",
      productId: item.productId,
      title: item.title,
      imageUrl: item.imageUrl,
      sellerId: item.seller.id,
      sellerName: item.seller.displayName,
      quantity: item.quantity,
      price: item.price,
      originalPrice: undefined,
      lineTotal: item.price * item.quantity,
      isAvailable: true,
    }));
  }, [isAuthenticated, isAuthLoading, query.data, offlineItems]);

  // Counts and prices are derived from the same lines that consumers render.
  const view = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const shippingCost = calculateShipping(subtotal, lines.length);

    if (isAuthenticated || isAuthLoading) {
      const calc = isAuthenticated ? query.data?.calculation : undefined;
      const totalDiscount = calc?.totalDiscount ?? 0;
      return {
        items: calc?.items ?? [],
        offlineItems: [] as OfflineCartItem[],
        subtotal,
        totalDiscount,
        shippingCost,
        grandTotal: Math.max(0, subtotal - totalDiscount + shippingCost),
        itemCount,
        appliedCouponCode: calc?.appliedCouponCode ?? null,
        appliedDiscounts: calc?.appliedDiscounts ?? [],
        warnings: calc?.warnings ?? [],
      };
    }

    return {
      items: [] as CartItem[],
      offlineItems,
      subtotal,
      totalDiscount: 0,
      shippingCost,
      grandTotal: subtotal + shippingCost,
      itemCount,
      appliedCouponCode: null as string | null,
      appliedDiscounts: [] as AppliedDiscount[],
      warnings: [] as string[],
    };
  }, [isAuthenticated, isAuthLoading, query.data, offlineItems, lines]);

  // ── Writes ── (branch on auth; keep the old throw/return contracts so the
  // cart-page stepper and coupon box behave exactly as before)
  const addToCart = async (productId: string, quantity = 1) => {
    if (!productId) return;
    if (!isAuthenticated) {
      const { data: product } = await listingsApi.getOne(productId);
      addToOfflineCart({
        productId: product.id,
        title: product.title,
        price: product.salePrice ?? product.price,
        imageUrl:
          product.images?.[0]?.cardUrl ??
          product.images?.[0]?.detailUrl ??
          product.images?.[0]?.url ??
          product.imageUrl ??
          "",
        seller: {
          id: product.sellerId || product.seller?.id || "",
          displayName:
            product.sellerName ||
            product.seller?.displayName ||
            product.seller?.name ||
            "Satıcı",
        },
      });
      return;
    }
    try {
      await cartApi.addItem(productId, quantity);
    } catch (error) {
      throw new Error(cartErrorMessage(error, "Sepete eklenirken hata oluştu"));
    }
    await invalidate();
  };

  const removeFromCart = async (productId: string) => {
    if (!productId) return;
    if (!isAuthenticated) {
      removeFromOfflineCart(productId);
      return;
    }
    await cartApi.removeItem(productId);
    await invalidate();
  };

  // Rethrows so the cart-page stepper can toast the backend's quantity/stock
  // rejection.
  const updateQuantity = async (productId: string, quantity: number) => {
    if (!isAuthenticated) return;
    try {
      await cartApi.updateItem(productId, quantity);
    } catch (error) {
      throw new Error(
        cartErrorMessage(error, "Miktar güncellenirken hata oluştu"),
      );
    }
    await invalidate();
  };

  const applyCoupon = async (
    code: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isAuthenticated)
      return { success: false, error: "Giriş yapmanız gerekiyor" };
    try {
      await cartApi.applyCoupon(code);
      await invalidate();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: cartErrorMessage(error, "Kupon uygulanamadı"),
      };
    }
  };

  const removeCoupon = async () => {
    if (!isAuthenticated) return;
    await cartApi.removeCoupon();
    await invalidate();
  };

  const clearCart = async () => {
    if (!isAuthenticated) {
      clearOfflineCart();
      return;
    }
    await cartApi.clear();
    await invalidate();
  };

  // Use the persisted badge hint only during a genuine initial fetch. As soon
  // as that request settles, expose (and persist) the count derived from lines.
  const isLoading = isAuthLoading || (isAuthenticated && query.isLoading);
  const itemCount = isLoading ? itemCountHint : view.itemCount;

  // Keep the persisted badge hint in sync with the currently shown count.
  useEffect(() => {
    if (itemCount !== itemCountHint) setItemCountHint(itemCount);
  }, [itemCount, itemCountHint, setItemCountHint]);

  return {
    isAuthenticated,
    ...view,
    lines,
    lineCount: lines.length,
    itemCount,
    isLoading,
    /** Refetch the authed cart (no-op for guests — their cart is local/derived). */
    refetch: async () => {
      if (isAuthenticated) await query.refetch();
    },
    addToCart,
    removeFromCart,
    updateQuantity,
    applyCoupon,
    removeCoupon,
    clearCart,
    // Low-level offline-cart ops (the listing page adds the product it already
    // has, avoiding a re-fetch; the cart page removes a guest line by product).
    addToOfflineCart,
    removeFromOfflineCart,
    clearOfflineCart,
  };
}
