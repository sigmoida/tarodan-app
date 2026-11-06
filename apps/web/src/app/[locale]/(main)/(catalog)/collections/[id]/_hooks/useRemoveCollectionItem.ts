/** @format */

"use client";

import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ConfirmProvider";
import { useWebMutation } from "@/hooks/useWebMutation";
import { collectionsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

const REMOVE_ITEM_KEY = ["collection-remove-item"] as const;

/**
 * The owner removes one item (a listing or a custom item, visible or hidden)
 * from a collection: a destructive confirm, `DELETE /collections/:id/items/:itemId`,
 * a toast, and a refresh of the collection queries. Shared by the detail and
 * the edit pages. Nothing is called when the confirmation is cancelled.
 */
export function useRemoveCollectionItem(collectionId: string | undefined) {
  const t = useTranslations();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const mutation = useWebMutation(
    (itemId: string) => collectionsApi.removeItem(collectionId!, itemId),
    {
      successMessage: t("collection.productRemoved"),
      errorMessage: t("collection.productRemoveFailed"),
      mutation: {
        mutationKey: REMOVE_ITEM_KEY,
        // Awaited by the mutation, so a row stays busy until the refresh has
        // dropped it. It also runs on failure: a 404 means the item is gone.
        // `collection.all()` because a detail is cached by id and by slug.
        onSettled: () =>
          Promise.all(
            [
              queryKeys.collection.all(),
              queryKeys.collections.all(),
              queryKeys.myCollections.list(),
            ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
          ),
      },
    },
  );

  const requestRemove = async (itemId: string) => {
    if (!collectionId) return;
    const confirmed = await confirm({
      title: t("collection.removeProduct"),
      description: t("collection.removeProductConfirm"),
      confirmLabel: t("common.remove"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (confirmed) mutation.mutate(itemId);
  };

  // From the mutation cache: `mutation.variables` only knows the latest call,
  // and two removals can overlap.
  const removingIds = useMutationState({
    filters: { mutationKey: REMOVE_ITEM_KEY, status: "pending" },
    select: (pending) => pending.state.variables as string,
  });

  return {
    requestRemove,
    /** The items being removed, for their controls' busy state. */
    removingIds,
  };
}
