"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  TrashIcon,
  ShoppingCartIcon,
  LockClosedIcon,
  // KUPON UI devre dışı (yoruma alındı) — sadece kupon bloğunda kullanılıyordu
  // TagIcon,
  // XMarkIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "@/i18n";
import { IconButton } from "@tarodan/ui";
import { ordersApi } from "@/lib/api";

export default function CartPage() {
  const {
    items,
    offlineItems,
    subtotal,
    isLoading,
    fetchCart,
    removeFromCart,
    totalDiscount,
    appliedDiscounts,
    // KUPON UI devre dışı (yoruma alındı) — store API'si korunuyor
    // appliedCouponCode,
    // applyCoupon,
    // removeCoupon,
  } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();

  // KUPON UI devre dışı (yoruma alındı)
  // const [couponInput, setCouponInput] = useState("");
  // const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  // Platform hizmet bedeli (komisyon) — backend quote'tan, sepette de net göster.
  const [buyerFee, setBuyerFee] = useState(0);
  useEffect(() => {
    const list = (items ?? []) as Array<{ productId?: string; id?: string; quantity?: number }>;
    if (list.length === 0) {
      setBuyerFee(0);
      return;
    }
    let cancelled = false;
    ordersApi
      .getQuote({
        items: list.map((it) => ({ productId: it.productId ?? it.id!, quantity: it.quantity ?? 1 })),
      })
      .then((res: any) => {
        if (!cancelled) setBuyerFee(Number(res.data?.pricing?.buyerFeeAmount ?? res.data?.buyerFeeAmount ?? 0));
      })
      .catch(() => {
        if (!cancelled) setBuyerFee(0);
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const handleRemove = async (productId: string) => {
    try {
      await removeFromCart(productId);
      toast.success(t("product.removedFromCart"));
    } catch (error) {
      toast.error(t("product.removeFromCartFailed"));
    }
  };

  const handleOfflineRemove = (itemId: string) => {
    const filtered = offlineItems.filter((item) => item.id !== itemId);
    useCartStore.setState({ offlineItems: filtered });
    fetchCart();
    toast.success(t("product.removedFromCart"));
  };

  // KUPON UI devre dışı (yoruma alındı) — handler'lar korunuyor
  /*
  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    const result = await applyCoupon(code);
    setCouponLoading(false);
    if (result.success) {
      setCouponInput("");
      toast.success(t("cart.couponApplied"));
    } else {
      toast.error(result.error || t("cart.couponApplyError"));
    }
  };

  const handleRemoveCoupon = async () => {
    setCouponLoading(true);
    await removeCoupon();
    setCouponLoading(false);
  };
  */

  if (isLoading && items.length === 0) {
    return (
      <div className="min-h-screen bg-surface py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-4 flex gap-4">
                <div className="w-24 h-24 bg-border-subtle rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-border-subtle rounded w-3/4" />
                  <div className="h-4 bg-border-subtle rounded w-1/2" />
                  <div className="h-6 bg-border-subtle rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hasOnlineItems = items.length > 0;
  const hasOfflineItems = offlineItems.length > 0;
  const isEmpty = !hasOnlineItems && !hasOfflineItems;

  if (isEmpty) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <ShoppingCartIcon className="w-20 h-20 text-border-strong mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-heading mb-2">
            {t("cart.empty")}
          </h2>
          <p className="text-muted mb-6">{t("cart.emptyDesc")}</p>
          <ButtonLink href="/listings">{t("cart.browseListings")}</ButtonLink>
        </div>
      </div>
    );
  }

  // Kargo sepette gösterilmez; ödeme adımında hesaplanır
  const displayGrandTotal = Math.max(0, subtotal - (totalDiscount ?? 0)) + buyerFee;

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-heading mb-8">
          {t("cart.myCart")}
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {/* Online cart items (authenticated) */}
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card p-4 flex gap-4"
              >
                <Link href={`/listings/${item.productId}`}>
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-surface-alt flex-shrink-0">
                    <Image
                      src={
                        item.productImage || "https://via.placeholder.com/96"
                      }
                      alt={item.productTitle}
                      width={96}
                      height={96}
                      className="object-cover w-full h-full"
                    />
                  </div>
                </Link>
                <div className="flex-1">
                  <Link href={`/listings/${item.productId}`}>
                    <h3 className="font-semibold text-heading hover:text-primary-500 line-clamp-2">
                      {item.productTitle}
                    </h3>
                  </Link>
                  <p className="text-sm text-muted mt-1">
                    {t("product.seller")}: @{item.sellerName}
                  </p>
                  <div className="mt-2">
                    {item.originalPrice != null &&
                      item.originalPrice > (item.effectivePrice ?? 0) && (
                        <p className="text-sm text-subtle line-through">
                          {(item.originalPrice ?? 0).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          TL
                        </p>
                      )}
                    <p className="text-lg font-bold text-primary-500">
                      {(item.effectivePrice ?? 0).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </p>
                  </div>
                </div>
                <IconButton
                  variant="danger"
                  size="sm"
                  onClick={() => handleRemove(item.productId)}
                  className="self-start"
                  aria-label={locale === "en" ? "Remove item" : "Ürünü kaldır"}
                >
                  <TrashIcon className="w-5 h-5" />
                </IconButton>
              </motion.div>
            ))}
            {/* Offline cart items (guest) */}
            {!isAuthenticated &&
              offlineItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="card p-4 flex gap-4"
                >
                  <Link href={`/listings/${item.productId}`}>
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-surface-alt flex-shrink-0">
                      <Image
                        src={item.imageUrl || "https://via.placeholder.com/96"}
                        alt={item.title}
                        width={96}
                        height={96}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  </Link>
                  <div className="flex-1">
                    <Link href={`/listings/${item.productId}`}>
                      <h3 className="font-semibold text-heading hover:text-primary-500 line-clamp-2">
                        {item.title}
                      </h3>
                    </Link>
                    <p className="text-sm text-muted mt-1">
                      {t("product.seller")}: @{item.seller.displayName}
                    </p>
                    <p className="text-lg font-bold text-primary-500 mt-2">
                      {item.price.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </p>
                  </div>
                  <IconButton
                    variant="danger"
                    size="sm"
                    onClick={() => handleOfflineRemove(item.id)}
                    className="self-start"
                    aria-label={locale === "en" ? "Remove item" : "Ürünü kaldır"}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </IconButton>
                </motion.div>
              ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-24">
              <h2 className="text-lg font-semibold mb-4">
                {t("checkout.orderSummary")}
              </h2>

              {/* ===== KUPON KODU UI — devre dışı (yoruma alındı, kod korunuyor) =====
              Kupon Kodu girişi veya aktif kupon badge'i
              {isAuthenticated && (
                <div className="mb-4">
                  {appliedCouponCode ? (
                    <div className="flex items-center justify-between rounded-lg bg-success-50 border border-success-200 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-success-700 min-w-0">
                        <TagIcon className="w-4 h-4 shrink-0" />
                        <span className="font-mono font-semibold truncate">{appliedCouponCode}</span>
                        {totalDiscount > 0 && (
                          <span className="shrink-0 font-medium">
                            -{totalDiscount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        disabled={couponLoading}
                        aria-label={t("cart.removeCoupon")}
                        className="text-success-600 hover:text-danger-600 transition-colors disabled:opacity-50"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === "Enter") handleApplyCoupon(); }}
                        placeholder={t("cart.couponPlaceholder")}
                        disabled={couponLoading}
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-heading placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono uppercase disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading || !couponInput.trim()}
                        className="px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {couponLoading ? "..." : t("cart.applyCoupon")}
                      </button>
                    </div>
                  )}
                </div>
              )}
              ===== KUPON KODU UI sonu ===== */}

              {/* Fiyat özeti */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">{t("checkout.subtotal")}</span>
                  <span className="font-medium">
                    {(subtotal ?? 0).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    TL
                  </span>
                </div>
                {/* Otomatik kampanya indirimleri (kodu olmayanlar) */}
                {appliedDiscounts &&
                  appliedDiscounts
                    .filter((d) => !d.discountCode)
                    .map((d) => (
                      <div
                        key={d.discountId}
                        className="flex justify-between text-success-600"
                      >
                        <span>{d.discountName}</span>
                        <span className="font-medium">
                          -{Number(d.appliedAmount).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          TL
                        </span>
                      </div>
                    ))}
                {buyerFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">
                      {locale === "en" ? "Platform Service Fee" : "Platform Hizmet Bedeli"}
                    </span>
                    <span className="font-medium">
                      {buyerFee.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted">{t("checkout.shipping")}</span>
                  <span className="text-subtle">
                    {locale === "en"
                      ? "Calculated at checkout"
                      : "Ödeme adımında hesaplanır"}
                  </span>
                </div>
                <hr className="my-1" />
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">{t("checkout.total")}</span>
                  <span className="font-bold text-primary-500">
                    ₺{(displayGrandTotal ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <ButtonLink href="/checkout" className="w-full mt-6 flex gap-2">
                {t("cart.proceedToCheckout")}
              </ButtonLink>
              {!isAuthenticated && (
                <div className="mt-3 space-y-2">
                  <ButtonLink
                    variant="secondary"
                    href={`/login?redirect=${encodeURIComponent("/cart")}`}
                    className="w-full flex gap-2"
                  >
                    <LockClosedIcon className="w-4 h-4" />
                    {locale === "en"
                      ? "Login for faster checkout"
                      : "Hızlı ödeme için giriş yapın"}
                  </ButtonLink>
                  <p className="text-xs text-muted text-center">
                    {locale === "en"
                      ? "Your cart will be saved after login."
                      : "Sepetiniz giriş yaptıktan sonra korunacak."}
                  </p>
                </div>
              )}

              <Link
                href="/listings"
                className="block text-center text-sm text-muted hover:text-primary-500 mt-4"
              >
                {t("cart.continueShopping")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
