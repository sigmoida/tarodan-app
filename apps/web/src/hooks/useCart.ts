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

const offlineShipping = (subtotal: number, count: number) =>
  count === 0 ? 0 : subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;

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

  // Badge hint: while the authed cart query is still loading on a cold reload,
  // fall back to the persisted last-known count so the header badge doesn't
  // flash to 0; guests always have a real (derived) count.
  const authedLoadingCount =
    isAuthenticated && !query.data ? itemCountHint : undefined;

  // Unified read: authed → the server calculation; guest → derived from the
  // offline cart (same numbers the store used to compute imperatively).
  const view = useMemo(() => {
    if (isAuthenticated) {
      const calc = query.data?.calculation;
      return {
        items: calc?.items ?? [],
        offlineItems: [] as OfflineCartItem[],
        subtotal: calc?.subtotal ?? 0,
        totalDiscount: calc?.totalDiscount ?? 0,
        shippingCost: calc?.shippingCost ?? 0,
        grandTotal: calc?.grandTotal ?? 0,
        itemCount: calc?.itemCount ?? 0,
        appliedCouponCode: calc?.appliedCouponCode ?? null,
        appliedDiscounts: calc?.appliedDiscounts ?? [],
        warnings: calc?.warnings ?? [],
      };
    }
    const subtotal = offlineItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const itemCount = offlineItems.reduce((s, i) => s + i.quantity, 0);
    const shippingCost = offlineShipping(subtotal, offlineItems.length);
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
  }, [isAuthenticated, query.data, offlineItems]);

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

  const itemCount = authedLoadingCount ?? view.itemCount;

  // Keep the persisted badge hint in sync with the currently shown count.
  useEffect(() => {
    if (itemCount !== itemCountHint) setItemCountHint(itemCount);
  }, [itemCount, itemCountHint, setItemCountHint]);

  return {
    isAuthenticated,
    ...view,
    itemCount,
    isLoading: isAuthenticated ? query.isLoading : false,
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
