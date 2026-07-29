"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  cartApi,
  discountsApi,
  listingsApi,
  type CartItem,
  type CartResponse,
  type AppliedDiscount,
  type CouponValidationResult,
  type OfflineCartItem,
} from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";

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
  /** Adet tavanı: mevcut stok ∧ sipariş-cap'i. Stepper `+` bunda kilitlenir.
   * Bilinmiyorsa (misafir eski satır) undefined → tavan yok, checkout doğrular. */
  maxQuantity?: number;
  price: number;
  originalPrice?: number;
  lineTotal: number;
  isAvailable: boolean;
  stockWarning?: string;
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
  const offlineCouponCode = useCartStore((s) => s.offlineCouponCode);
  const setOfflineCouponCode = useCartStore((s) => s.setOfflineCouponCode);
  const addToOfflineCart = useCartStore((s) => s.addToOfflineCart);
  const updateOfflineQuantity = useCartStore((s) => s.updateOfflineQuantity);
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

  // Guest coupon: the store keeps only the code; the discount is (re)computed
  // server-side against the CURRENT offline items, so changing quantities can
  // never leave a stale amount (and a coupon that stops qualifying surfaces as
  // invalid). Keyed on code + items so it refreshes whenever either changes.
  const guestItemsKey = offlineItems
    .map((i) => `${i.productId}:${i.quantity}`)
    .join(",");
  const guestCouponQuery = useQuery({
    queryKey: queryKeys.cart.guestCoupon(offlineCouponCode, guestItemsKey),
    queryFn: async (): Promise<CouponValidationResult> =>
      (
        await discountsApi.validateGuest({
          code: offlineCouponCode!,
          cartItems: offlineItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        })
      ).data as CouponValidationResult,
    enabled: !isAuthenticated && !!offlineCouponCode && offlineItems.length > 0,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isAuthenticated || offlineItems.length === 0) return;
    if (offlineCartMergePromise) return;

    const itemsToMerge = offlineItems.map(({ productId, quantity }) => ({
      productId,
      quantity,
    }));

    const couponToMerge = offlineCouponCode;

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
      // Carry the guest coupon onto the now-authenticated cart (best-effort —
      // a per-user limit or expiry may reject it, which must not break login).
      if (couponToMerge) {
        try {
          await cartApi.applyCoupon(couponToMerge);
        } catch {
          // ignore — user can re-enter it in the cart
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
  }, [
    clearOfflineCart,
    isAuthenticated,
    offlineItems,
    offlineCouponCode,
    queryClient,
  ]);

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
        maxQuantity: item.maxQuantity,
        price: item.effectivePrice,
        originalPrice: item.originalPrice,
        lineTotal: item.lineTotal,
        isAvailable: item.isAvailable,
        stockWarning: item.stockWarning,
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
      maxQuantity: item.stock,
      price: item.price,
      originalPrice: undefined,
      lineTotal: item.price * item.quantity,
      isAvailable: true,
      stockWarning: undefined,
    }));
  }, [isAuthenticated, isAuthLoading, query.data, offlineItems]);

  // Keep unavailable lines visible, but derive every payable signal from the
  // available subset of that same normalized list.
  const view = useMemo(() => {
    const payableLines = lines.filter((line) => line.isAvailable);
    const canCheckout = payableLines.length > 0;
    const subtotal = payableLines.reduce(
      (sum, line) => sum + line.lineTotal,
      0,
    );
    const itemCount = payableLines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    );

    if (isAuthenticated || isAuthLoading) {
      const calc = isAuthenticated ? query.data?.calculation : undefined;
      const totalDiscount = calc?.totalDiscount ?? 0;
      // Shipping comes from the server cart calculation (active shipping tariff) —
      // no hardcoded fee/threshold on the client.
      const shippingCost = calc?.shippingCost ?? 0;
      return {
        items: calc?.items ?? [],
        offlineItems: [] as OfflineCartItem[],
        subtotal,
        totalDiscount,
        shippingCost,
        grandTotal: Math.max(0, subtotal - totalDiscount + shippingCost),
        itemCount,
        canCheckout,
        appliedCouponCode: calc?.appliedCouponCode ?? null,
        appliedDiscounts: calc?.appliedDiscounts ?? [],
        couponDiscount: calc?.couponDiscountTotal ?? 0,
        couponError: null as string | null,
        warnings: calc?.warnings ?? [],
      };
    }

    // Guest coupon: derive from the reactive validation query (fresh vs items).
    const guestCoupon = guestCouponQuery.data;
    const guestCouponValid = !!guestCoupon?.isValid && !!offlineCouponCode;
    const guestCouponDiscount = guestCouponValid
      ? Math.min(guestCoupon!.discount?.estimatedDiscount ?? 0, subtotal)
      : 0;

    return {
      items: [] as CartItem[],
      offlineItems,
      subtotal,
      totalDiscount: guestCouponDiscount,
      // Guest cart has no server calculation; shipping is computed at checkout
      // (from the tariff, once the subtotal is known). Preview total excludes it.
      shippingCost: 0,
      grandTotal: Math.max(0, subtotal - guestCouponDiscount),
      itemCount,
      canCheckout,
      appliedCouponCode: guestCouponValid ? offlineCouponCode : null,
      appliedDiscounts: guestCouponValid
        ? [
            {
              discountId: guestCoupon!.discount!.id,
              discountName: guestCoupon!.discount!.name,
              discountCode: guestCoupon!.discount!.code,
              appliedAmount: guestCouponDiscount,
            } as AppliedDiscount,
          ]
        : [],
      couponDiscount: guestCouponDiscount,
      // Applied code that no longer validates (e.g. items dropped below min) →
      // surface the reason so the coupon box can show it / prompt removal.
      couponError:
        offlineCouponCode && guestCoupon && !guestCoupon.isValid
          ? (guestCoupon.error ?? null)
          : null,
      warnings: [] as string[],
    };
  }, [
    isAuthenticated,
    isAuthLoading,
    query.data,
    offlineItems,
    lines,
    offlineCouponCode,
    guestCouponQuery.data,
  ]);

  // ── Writes ── (branch on auth; keep the old throw/return contracts so the
  // cart-page stepper and coupon box behave exactly as before)
  const addToCart = async (productId: string, quantity = 1) => {
    if (!productId) return;
    if (!isAuthenticated) {
      const { data: product } = await listingsApi.getOne(productId);
      // Misafir adet tavanı: müsait stok (rezervasyon düşülmüş) ∧ 20 sipariş-cap'i.
      // Bilinmiyorsa undefined → stepper serbest, backend checkout'ta doğrular.
      const avail = product.availableQuantity;
      const stock =
        typeof avail === "number" && avail > 0
          ? Math.min(avail, 20)
          : undefined;
      addToOfflineCart({
        productId: product.id,
        title: product.title,
        price: product.salePrice ?? product.price,
        stock,
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
      // `addToOfflineCart` yeni satırı adet 1 ekler; ürün sayfasında adet>1
      // seçildiyse satırı seçilen adede ayarla (stok tavanına kırpılır).
      if (quantity > 1) updateOfflineQuantity(product.id, quantity);
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
  // rejection. Misafir sepetinde offline store'da (stok tavanına kırparak) günceller.
  const updateQuantity = async (productId: string, quantity: number) => {
    if (!isAuthenticated) {
      updateOfflineQuantity(productId, quantity);
      return;
    }
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
    // Error strings are intentionally NOT hardcoded here — the hook returns the
    // backend's (localized) message or undefined, and the caller (CouponBox)
    // renders a translated fallback via `t()`.
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return { success: false };

    // Guest: validate against the offline cart (no per-user limit), then persist
    // only the CODE — the discount is recomputed reactively from current items.
    if (!isAuthenticated) {
      if (offlineItems.length === 0) return { success: false };
      try {
        const result = (
          await discountsApi.validateGuest({
            code: trimmed,
            cartItems: offlineItems.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            })),
          })
        ).data as CouponValidationResult;
        if (!result.isValid) return { success: false, error: result.error };
        setOfflineCouponCode(trimmed);
        return { success: true };
      } catch (error) {
        return { success: false, error: cartErrorMessage(error, "") };
      }
    }

    try {
      await cartApi.applyCoupon(trimmed);
      await invalidate();
      return { success: true };
    } catch (error) {
      return { success: false, error: cartErrorMessage(error, "") };
    }
  };

  const removeCoupon = async () => {
    if (!isAuthenticated) {
      setOfflineCouponCode(null);
      return;
    }
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
