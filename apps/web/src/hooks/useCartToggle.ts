"use client";

import { useMemo } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useCart } from "@/hooks/useCart";
import { apiErrorMessage, useWebMutation } from "@/hooks/useWebMutation";
import { isCancellation } from "@/lib/query/client";

/**
 * The reason to show for a failed cart write: the API's message (an axios
 * error from a remove), or the message `useCart` rethrew for an add. An
 * axios error's own `message` ("Request failed with status code 500") is
 * never shown.
 */
function cartErrorText(error: unknown): string | undefined {
  const fromApi = apiErrorMessage(error);
  if (fromApi) return fromApi;
  const isHttpError =
    typeof error === "object" &&
    error !== null &&
    (error as { isAxiosError?: unknown }).isAxiosError === true;
  return !isHttpError && error instanceof Error && error.message
    ? error.message
    : undefined;
}

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
      // `useCart().addToCart` rethrows the API's reason as a plain `Error`
      // (its contract with the cart page), which the default toast cannot
      // read; this toast keeps that reason ("not enough stock", ...).
      silentError: true,
      mutation: {
        onSettled: (_data, error) => {
          if (!error || isCancellation(error)) return;
          toast.error(cartErrorText(error) ?? t("common.operationFailed"));
        },
      },
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
