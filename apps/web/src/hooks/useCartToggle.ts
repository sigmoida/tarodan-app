"use client";

import { useMemo } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useCart } from "@/hooks/useCart";
import { useWebMutation } from "@/hooks/useWebMutation";

/**
 * Add a listing to the cart, or take it out when it is already there (the
 * listing card action and the Favorites footer; decision D10). Reads the one
 * cart (`useCart`: the authed query or the guest cart), so it sends no request
 * of its own until clicked. While a write runs, a second click is ignored.
 */
export function useCartToggle(productId: string) {
  const t = useTranslations();
  const { lines, addToCart, removeFromCart } = useCart();
  const inCart = useMemo(
    () => lines.some((line) => line.productId === productId),
    [lines, productId],
  );

  const mutation = useWebMutation(
    async (remove: boolean) => {
      if (remove) await removeFromCart(productId);
      else await addToCart(productId);
      return remove;
    },
    {
      onSuccess: (removed) =>
        toast.success(
          removed ? t("product.removedFromCart") : t("product.addedToCart"),
        ),
    },
  );

  return {
    inCart,
    isPending: mutation.isPending,
    toggle: () => {
      if (!mutation.isPending) mutation.mutate(inCart);
    },
  };
}
