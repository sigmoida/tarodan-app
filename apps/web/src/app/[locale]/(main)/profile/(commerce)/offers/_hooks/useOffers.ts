/** @format */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ConfirmProvider";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { Offer, OfferTab } from "../_lib/types";

const RESOURCE = "offers";

/** Offers for one tab (received / sent). Both tabs are queried so the metric
 * cards (computed from the union) stay independent of the active tab. */
export function useOffers(type: OfferTab, enabled: boolean) {
  const query = useWebList<Offer[]>({
    resource: RESOURCE,
    params: type,
    fetcher: async () => {
      const res = await api.get("/offers", { params: { type } });
      return res.data?.data || res.data?.offers || [];
    },
    enabled,
    query: { meta: { page: "offers" } },
  });
  return {
    offers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

type OfferActionType = "accept" | "reject" | "cancel";

/**
 * Accept / reject / cancel — one mutation; `pendingId` marks the in-flight
 * offer. Üçü de geri alınamaz olduğundan istek atılmadan önce paylaşılan
 * onay diyaloğu (useConfirm) gösterilir.
 */
export function useOfferAction() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const t = useTranslations();
  const mutation = useMutation({
    mutationFn: ({
      offerId,
      action,
    }: {
      offerId: string;
      action: OfferActionType;
    }) => api.post(`/offers/${offerId}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RESOURCE] }),
    onError: (err: any, { action }) => {
      const fallback =
        action === "accept"
          ? t("offer.acceptFailed")
          : action === "reject"
            ? t("offer.rejectFailed")
            : t("offer.cancelFailed");
      toast.error(err?.response?.data?.message || fallback);
    },
  });

  const run = async (vars: { offerId: string; action: OfferActionType }) => {
    const copy = {
      accept: {
        title: t("offer.acceptConfirmTitle"),
        description: t("offer.acceptConfirmDesc"),
        destructive: false,
      },
      reject: {
        title: t("offer.rejectConfirmTitle"),
        description: t("offer.rejectConfirmDesc"),
        destructive: true,
      },
      cancel: {
        title: t("offer.cancelConfirmTitle"),
        description: t("offer.cancelConfirmDesc"),
        destructive: true,
      },
    }[vars.action];
    if (
      !(await confirm({
        ...copy,
        confirmLabel: t("common.confirm"),
        cancelLabel: t("common.cancel"),
      }))
    ) {
      return;
    }
    mutation.mutate(vars);
  };

  return {
    run,
    pendingId: mutation.isPending
      ? (mutation.variables?.offerId ?? null)
      : null,
  };
}

type CounterMode = "buyer" | "seller";

/** Buyer (lower) / seller counter offer. */
export function useCounterOffer() {
  const t = useTranslations();
  return useWebMutation(
    ({
      offerId,
      amount,
      mode,
    }: {
      offerId: string;
      amount: number;
      mode: CounterMode;
    }) =>
      api.post(
        `/offers/${offerId}/${mode === "buyer" ? "buyer-counter" : "counter"}`,
        { amount },
      ),
    {
      invalidates: [RESOURCE],
      errorMessage: t("offer.counterFailed"),
    },
  );
}
