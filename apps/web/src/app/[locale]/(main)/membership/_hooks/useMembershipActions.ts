/** @format */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { membershipApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useConfirm } from "@/components/ConfirmProvider";
import { useTranslations } from "next-intl";
import type { MembershipDetails } from "../_lib/types";

/**
 * The three membership management mutations (auto-renew toggle, cancel,
 * cancel-scheduled-change). Each owns its toast + invalidation of the
 * `/membership/me` query; the cancel confirms first.
 */
export function useMembershipActions() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const t = useTranslations();
  const meKey = queryKeys.membership.me();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: meKey });

  const autoRenew = useMutation({
    mutationFn: (next: boolean) => membershipApi.setAutoRenew(next),
    // Optimistic: flip the cached flag immediately, roll back on error.
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: meKey });
      const prev = queryClient.getQueryData<MembershipDetails | null>(meKey);
      queryClient.setQueryData<MembershipDetails | null>(meKey, (d) =>
        d ? { ...d, autoRenew: next } : d,
      );
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(meKey, ctx.prev);
      toast.error("İşlem başarısız");
    },
    onSuccess: (_r, next) => {
      toast.success(
        next
          ? "Otomatik yenileme hatırlatması açık"
          : "Otomatik yenileme hatırlatması kapalı",
      );
    },
    onSettled: invalidate,
  });

  const cancelScheduledChange = useMutation({
    mutationFn: () => membershipApi.cancelScheduledChange(),
    onSuccess: () => {
      toast.success(t("membership.scheduledChangeCancelled"));
      invalidate();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || "İşlem başarısız"),
  });

  const cancel = useMutation({
    mutationFn: () => membershipApi.cancel(),
    onSuccess: () => {
      toast.success(t("membership.cancelRequested"));
      invalidate();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || "İptal işlemi başarısız"),
  });

  /** Confirm, then cancel (used by the cancel button and free-tier downgrade). */
  const cancelMembership = async () => {
    const ok = await confirm({
      title: t("membership.cancelMembership"),
      description: t("membership.cancelConfirmDesc"),
      confirmLabel: t("order.cancelConfirmYes"),
      cancelLabel: t("order.cancelConfirmNo"),
      destructive: true,
    });
    if (ok) cancel.mutate();
  };

  return {
    toggleAutoRenew: (next: boolean) => autoRenew.mutate(next),
    autoRenewSaving: autoRenew.isPending,
    cancelMembership,
    cancelling: cancel.isPending,
    cancelScheduledChange: () => cancelScheduledChange.mutate(),
  };
}
