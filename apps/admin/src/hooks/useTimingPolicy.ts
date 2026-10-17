import { useQuery } from "@tanstack/react-query";
import type { PublicTimingPolicy } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import {
  FALLBACK_TIMING_POLICY,
  loadAdminTimingPolicy,
} from "@/lib/timing-policy";

/** Süreler ve Kurallar kaydedilince bu sorgu da tazelensin diye dışa açık. */
export const TIMING_POLICY_RESOURCE = "timing-policy";

/**
 * Politika süreleri (iade penceresi, payout grace …) — admin'deki TEK okuma.
 * Aynı sorgu anahtarı tüm ekranları tek isteğe bağlar. Sorgu hata yutmaz:
 * `loadAdminTimingPolicy` başarısızlıkta geri düşüşü döner, ekran süre yüzünden
 * kırılmaz.
 */
export function useTimingPolicy(): PublicTimingPolicy {
  const { data } = useQuery({
    queryKey: adminKeys.all(TIMING_POLICY_RESOURCE),
    queryFn: () =>
      loadAdminTimingPolicy(
        async () => (await adminApi.getTimingPolicy()).data,
      ),
    staleTime: 5 * 60_000,
  });
  return data ?? FALLBACK_TIMING_POLICY;
}
