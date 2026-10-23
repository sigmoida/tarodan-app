"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import type {
  ReviewModerationRequest,
  ReviewModerationStatus,
} from "@tarodan/types";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { adminKeys } from "@/lib/query/keys";
import { isReviewStatusChanged, reviewModerationError } from "./errors";
import { toModerationRequest, type ReviewModerationValues } from "./schema";

/** Past-tense result per moderation target, for the success toast. */
const moderationResultLabel = (
  t: ReturnType<typeof useTranslations<never>>,
  status: ReviewModerationStatus,
) => t(`admin.accounts.reviews.actionResult.${status}`);

export interface ModerationTarget {
  id: string;
  status: ReviewModerationStatus;
}

/**
 * Review moderation for one tab: `request` opens the reason modal, the modal's
 * submit runs the status mutation. Both tabs share it and differ only in the
 * API call and the invalidated resource. A 409 (`statusChanged`) means somebody
 * else moderated the review first: the modal closes and the list refreshes.
 */
export function useReviewModeration(
  resource: string,
  updateStatus: (id: string, body: ReviewModerationRequest) => Promise<unknown>,
  entityLabel: string,
) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ModerationTarget | null>(null);

  const mut = useAdminMutation(
    (v: ModerationTarget & { values: ReviewModerationValues }) =>
      updateStatus(v.id, toModerationRequest(v.status, v.values)),
    {
      invalidates: [resource],
      showErrorToast: false,
      onSuccess: (_, v) => {
        toast.success(`${entityLabel} ${moderationResultLabel(t, v.status)}`);
        setTarget(null);
      },
      mutation: {
        onSettled: (_data, error) => {
          if (!error) return;
          toast.error(
            reviewModerationError(
              error,
              t,
              t("admin.accounts.reviews.updateFailed"),
            ),
          );
          if (isReviewStatusChanged(error)) {
            queryClient.invalidateQueries({
              queryKey: adminKeys.all(resource),
            });
            setTarget(null);
          }
        },
      },
    },
  );

  return {
    request: (id: string, status: ReviewModerationStatus) =>
      setTarget({ id, status }),
    busyId: mut.isPending ? mut.variables?.id : undefined,
    modalProps: {
      target,
      isPending: mut.isPending,
      onClose: () => setTarget(null),
      onSubmit: (values: ReviewModerationValues) =>
        target && mut.mutate({ ...target, values }),
    },
  };
}
