/** @format */

"use client";

import toast from "react-hot-toast";
import { refundsApi } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { useWebItem, useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { RefundRequest } from "../_lib/types";

const LIST_RESOURCE = "refund-requests-buyer";
const DETAIL_RESOURCE = "refund-request";

/** The buyer's own refund requests (list page). */
export function useRefundRequests(enabled: boolean) {
  const query = useWebList<RefundRequest[]>({
    resource: LIST_RESOURCE,
    fetcher: async () => {
      const res = await refundsApi.myRequests();
      return res.data as RefundRequest[];
    },
    enabled,
  });
  return { requests: query.data ?? [], isLoading: query.isLoading };
}

/** A single refund request (detail page). */
export function useRefundDetail(refundId: string, enabled: boolean) {
  const query = useWebItem<RefundRequest>({
    resource: DETAIL_RESOURCE,
    id: refundId,
    fetcher: async (id) => {
      const res = await refundsApi.getById(id);
      return res.data as RefundRequest;
    },
    enabled: !!refundId && enabled,
  });
  return { refund: query.data, isLoading: query.isLoading };
}

/** Cancel a refund request — owns toast + invalidation. */
export function useCancelRefund(refundId: string) {
  const locale = useLocale();
  return useWebMutation(() => refundsApi.cancel(refundId), {
    invalidates: [DETAIL_RESOURCE, LIST_RESOURCE],
    errorMessage: "Hata",
    onSuccess: () =>
      toast.success(
        locale === "en" ? "Request cancelled" : "Talep iptal edildi",
      ),
  });
}
