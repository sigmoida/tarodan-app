/** @format */

"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useCart } from "@/hooks/useCart";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Container } from "@/components/layout/Container";
import { useCartQuote } from "./_hooks/useCartQuote";
import type { CartLineItem } from "./_lib/types";
import CartItemCard from "./_components/CartItemCard";
import CartSummary from "./_components/CartSummary";
import CartSkeleton from "./_components/CartSkeleton";
import EmptyCart from "./_components/EmptyCart";
import CartSimilarProducts from "./_components/CartSimilarProducts";

export default function CartClient() {
  const {
    isAuthenticated,
    lines: cartLines,
    lineCount,
    items,
    subtotal,
    isLoading,
    refetch: fetchCart,
    removeFromCart,
    removeFromOfflineCart,
    updateQuantity,
    totalDiscount,
    appliedDiscounts,
    appliedCouponCode,
    canCheckout,
  } = useCart();
  const t = useTranslations();

  const quote = useCartQuote(
    items.filter((item) => item.isAvailable),
    appliedCouponCode,
  );

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

  // Adet değişimi: auth → backend (stok reddini toast'lar), misafir → offline store
  // (senkron, stok tavanına kırpar). Her iki yol da tek `updateQuantity` üzerinden.
  const handleQuantityChange = async (productId: string, quantity: number) => {
    try {
      await updateQuantity(productId, quantity);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("product.removeFromCartFailed"),
      );
    }
  };

  const hasLines = lineCount > 0;

  // Show the skeleton while loading OR before the first fetch settles — but never
  // when we already have rows to render (client-side nav with a warm store).
  if ((isLoading || !fetched) && !hasLines) return <CartSkeleton />;

  if (!hasLines) return <EmptyCart />;

  // Add UI callbacks to the normalized lines created by useCart. The same list
  // now controls the empty state, row count, rendered cards, and totals.
  const lines: CartLineItem[] = cartLines.map((line) => ({
    key: line.id,
    productId: line.productId,
    image: line.imageUrl,
    title: line.title,
    sellerName: line.sellerName,
    price: line.price,
    originalPrice: line.originalPrice,
    isAvailable: line.isAvailable,
    stockWarning: line.stockWarning,
    quantity: line.quantity,
    maxQuantity: line.maxQuantity,
    onQuantityChange: (quantity: number) =>
      handleQuantityChange(line.productId, quantity),
    onRemove: () =>
      line.source === "authenticated"
        ? handleRemove(line.productId)
        : handleOfflineRemove(line.productId),
  }));

  // Toplam quote'tan gelir — sepet kendi aritmetiğini YAPMAZ. Quote henüz
  // dönmediyse (ya da sepet boşsa) ürün toplamı gösterilir.

  return (
    <PageShell>
      <PageHeader
        title={t("cart.myCart")}
        description={`${lineCount} ${t("collection.items")}`}
      />

      <div className="grid lg:grid-cols-3 gap-8">
        <div
          className="lg:col-span-2 space-y-4"
          data-testid="cart-products-column"
        >
          {lines.map((line) => (
            <CartItemCard key={line.key} item={line} />
          ))}
          <CartSimilarProducts
            productIds={lines.map((line) => line.productId)}
          />
        </div>

        <div className="lg:col-span-1">
          <CartSummary
            subtotal={subtotal}
            appliedDiscounts={appliedDiscounts}
            quote={quote}
            isAuthenticated={isAuthenticated}
            canCheckout={canCheckout}
          />
        </div>
      </div>
    </PageShell>
  );
}
