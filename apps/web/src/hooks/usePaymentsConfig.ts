/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { paymentsApi, type PaymentConfig } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/**
 * The public payment config (`GET /payments/config`: dev bypass, card storage
 * per PayTR store, installments). Callers read a missing answer (loading,
 * failed, older API) as the safe default: new card only, no installments.
 */
export function usePaymentsConfig() {
  return useQuery<PaymentConfig>({
    queryKey: queryKeys.payments.config(),
    queryFn: async () => (await paymentsApi.getConfig()).data,
    staleTime: 60 * 1000,
  });
}
