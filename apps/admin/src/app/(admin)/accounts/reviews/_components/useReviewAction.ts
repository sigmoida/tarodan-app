"use client";

import toast from "react-hot-toast";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  type ReviewStatus,
  reviewActionConfirm,
  statusLabels,
} from "../_lib/types";
import { useTranslations } from "next-intl";

/**
 * Shared review moderation action — confirm dialog → status mutation → toast.
 * Used by both the product and seller review tabs (differ only in the API call
 * and the invalidated resource).
 */
export function useReviewAction(
  resource: string,
  updateStatus: (id: string, status: ReviewStatus) => Promise<unknown>,
  entityLabel: string,
) {
  const t = useTranslations();
  const confirm = useConfirm();

  const mut = useAdminMutation(
    (v: { id: string; status: ReviewStatus }) => updateStatus(v.id, v.status),
    {
      invalidates: [resource],
      errorMessage: t("admin.accounts.reviews.updateFailed"),
      onSuccess: (_, v) =>
        toast.success(`${entityLabel} ${statusLabels(t)[v.status]}`),
    },
  );

  const act = async (id: string, status: ReviewStatus) => {
    await confirm({
      ...reviewActionConfirm(t)[status],
      cancelLabel: t("common.cancel"),
      onConfirm: () => mut.mutateAsync({ id, status }),
    });
  };

  return { act, isPending: mut.isPending, variables: mut.variables };
}
