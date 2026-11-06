/** @format */

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ConfirmProvider";
import { useWebMutation } from "@/hooks/useWebMutation";
import { collectionsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

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
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.collection.all(),
        }),
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

  return {
    requestRemove,
    /** The item being removed, for its control's busy state. */
    removingId: mutation.isPending ? mutation.variables : undefined,
  };
}
