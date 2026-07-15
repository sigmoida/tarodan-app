/** @format */

"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useCart } from "@/hooks/useCart";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Container } from "@/components/layout/Container";
import { useBuyerFee } from "./_hooks/useBuyerFee";
import type { CartLineItem } from "./_lib/types";
import CartItemCard from "./_components/CartItemCard";
import CartSummary from "./_components/CartSummary";
import CartSkeleton from "./_components/CartSkeleton";
import EmptyCart from "./_components/EmptyCart";

export default function CartClient() {
  const {
    items,
    offlineItems,
    subtotal,
    isLoading,
    refetch: fetchCart,
    removeFromCart,
    removeFromOfflineCart,
    totalDiscount,
    appliedDiscounts,
  } = useCart();
  const { isAuthenticated } = useAuthStore();
  const t = useTranslations();

  const buyerFee = useBuyerFee(items);

  // `isLoading` starts false in the store, so on a hard reload the very first
  // render has no items AND isn't "loading" yet → the empty state would flash
  // before `fetchCart` runs. Gate on a local "fetched once" flag so we show the
  // skeleton until the initial fetch resolves.
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.resolve(fetchCart()).finally(() => {
      if (active) setFetched(true);
    });
    return () => {
      active = false;
    };
  }, [fetchCart]);

  const handleRemove = async (productId: string) => {
    try {
      await removeFromCart(productId);
      toast.success(t("product.removedFromCart"));
    } catch {
      toast.error(t("product.removeFromCartFailed"));
    }
  };

  const handleOfflineRemove = (productId: string) => {
    removeFromOfflineCart(productId);
    toast.success(t("product.removedFromCart"));
  };

  const hasOnlineItems = items.length > 0;
  const hasOfflineItems = offlineItems.length > 0;

  // Show the skeleton while loading OR before the first fetch settles — but never
  // when we already have rows to render (client-side nav with a warm store).
  if ((isLoading || !fetched) && !hasOnlineItems && !hasOfflineItems)
    return <CartSkeleton />;

  if (!hasOnlineItems && !hasOfflineItems) return <EmptyCart />;

  // One normalized list feeds a single CartItemCard for both authed + guest rows.
  const lines: CartLineItem[] = [
    ...items.map((item) => ({
      key: item.id,
      productId: item.productId,
      image: item.productImage,
      title: item.productTitle,
      sellerName: item.sellerName,
      price: item.effectivePrice ?? 0,
      originalPrice: item.originalPrice,
      onRemove: () => handleRemove(item.productId),
    })),
    ...(!isAuthenticated
      ? offlineItems.map((item) => ({
          key: item.id,
          productId: item.productId,
          image: item.imageUrl,
          title: item.title,
          sellerName: item.seller.displayName,
          price: item.price,
          originalPrice: undefined,
          onRemove: () => handleOfflineRemove(item.productId),
        }))
      : []),
  ];

  // Shipping is shown at checkout, not here.
  const grandTotal = Math.max(0, subtotal - (totalDiscount ?? 0)) + buyerFee;

  return (
    <PageShell>
      <PageHeader
        title={t("cart.myCart")}
        description={`${lines.length} ${t("collection.items")}`}
      />

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {lines.map((line) => (
            <CartItemCard key={line.key} item={line} />
          ))}
        </div>

        <div className="lg:col-span-1">
          <CartSummary
            subtotal={subtotal}
            appliedDiscounts={appliedDiscounts}
            buyerFee={buyerFee}
            grandTotal={grandTotal}
            isAuthenticated={isAuthenticated}
          />
        </div>
      </div>
    </PageShell>
  );
}
