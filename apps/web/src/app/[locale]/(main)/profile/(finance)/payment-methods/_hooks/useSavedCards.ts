/** @format */

"use client";

import { membershipApi, type SavedCard } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";

const RESOURCE = "saved-cards";

/** The user's saved cards (PayTR vault). */
export function useSavedCards(enabled: boolean) {
  const query = useWebList<SavedCard[]>({
    resource: RESOURCE,
    fetcher: async () => (await membershipApi.listCards()).data,
    enabled,
  });
  return {
    cards: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

/** Delete a saved card — owns toast + invalidation. */
export function useDeleteCard() {
  return useWebMutation((cardId: string) => membershipApi.deleteCard(cardId), {
    invalidates: [RESOURCE],
    successMessage: "Kart silindi",
    errorMessage: "Kart silinemedi",
  });
}
