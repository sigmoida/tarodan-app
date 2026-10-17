"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { timingMessageValues, type PublicTimingPolicy } from "@tarodan/types";
import { timingRulesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  FALLBACK_TIMING_POLICY,
  parseWebTimingPolicy,
} from "@/lib/timing-policy";

const POLICY_STALE_MS = 5 * 60_000;

/**
 * Politika süreleri (iade penceresi, ödeme süresi, teklif geçerliliği…) —
 * uygulamadaki TEK istemci okuması. Aynı sorgu anahtarı tüm bileşenleri tek
 * isteğe bağlar (bileşen başına fetch yok). Yüklenene ya da istek başarısız
 * olana kadar `@tarodan/shared` geri düşüşü döner.
 */
export function useTimingPolicy(): PublicTimingPolicy {
  const { data } = useQuery({
    queryKey: queryKeys.timingPolicy.all(),
    queryFn: async () =>
      parseWebTimingPolicy((await timingRulesApi.getPolicy()).data),
    staleTime: POLICY_STALE_MS,
    retry: 1,
    meta: { page: "global-timing-policy" },
  });
  return data ?? FALLBACK_TIMING_POLICY;
}

/** ICU parametreleri: `t("order.refundWindowPassed", values)`. */
export function useTimingValues() {
  const policy = useTimingPolicy();
  return useMemo(() => timingMessageValues(policy), [policy]);
}
