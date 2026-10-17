import { PAYOUT_GRACE_DAYS, REFUND_COOLING_OFF_DAYS } from "@tarodan/shared";
import {
  fallbackTimingPolicy,
  loadTimingPolicy,
  type PublicTimingPolicy,
} from "@tarodan/types";

/**
 * Admin'in politika sürelerini okuduğu TEK yer (okuyan hook:
 * `hooks/useTimingPolicy.ts`). Değerler `GET /timing-rules`'tan gelir; uç
 * yüklenemezse `@tarodan/shared` sabitleri (iade penceresi, payout grace) ve
 * kayıt varsayılanları geri düşüş olarak kullanılır — otoriter değildir.
 */
export const FALLBACK_TIMING_POLICY: PublicTimingPolicy = fallbackTimingPolicy({
  returnWindowDays: REFUND_COOLING_OFF_DAYS,
  payoutGraceDays: PAYOUT_GRACE_DAYS,
});

/** Yükleyiciyi çalıştırır; hata politikayı geri düşüşe çevirir. */
export const loadAdminTimingPolicy = (
  load: () => Promise<unknown>,
): Promise<PublicTimingPolicy> =>
  loadTimingPolicy(load, FALLBACK_TIMING_POLICY);
