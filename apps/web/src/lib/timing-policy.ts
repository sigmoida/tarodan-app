/** @format */

import { PAYOUT_GRACE_DAYS, REFUND_COOLING_OFF_DAYS } from "@tarodan/shared";
import {
  fallbackTimingPolicy,
  loadTimingPolicy,
  parseTimingPolicy,
  timingMessageValues,
  type PublicTimingPolicy,
  type TimingMessageValues,
} from "@tarodan/types";
import type { Translate } from "@/types/i18n";

/**
 * Web'in politika sürelerini okuduğu TEK yer.
 *
 * Süreler (`GET /timing-rules`) admin ekranından yönetilir; metinler ve tarih
 * kararları sabit sayı yerine bu değerleri kullanır. Uç yüklenmemişse ya da
 * ulaşılamıyorsa `@tarodan/shared` sabitleri (iade penceresi, payout grace) ve
 * kayıt varsayılanları geri düşüş olarak kullanılır — otoriter değildir.
 *
 * Okuma yolları:
 *   - Server Component → `getTimingPolicy()` (`lib/server/timing-policy.ts`),
 *   - Client → `useTimingPolicy()` (`hooks/useTimingPolicy.ts`).
 * İkisi de aynı ayrıştırıcıyı ve geri düşüşü kullanır.
 */

/** Uç yüklenemediğinde geçerli değerler. */
export const FALLBACK_TIMING_POLICY: PublicTimingPolicy = fallbackTimingPolicy({
  returnWindowDays: REFUND_COOLING_OFF_DAYS,
  payoutGraceDays: PAYOUT_GRACE_DAYS,
});

/** Ham uç yanıtını politikaya çevirir (geçersiz kimlik geri düşer). */
export const parseWebTimingPolicy = (payload: unknown): PublicTimingPolicy =>
  parseTimingPolicy(payload, FALLBACK_TIMING_POLICY);

/** Yükleyiciyi çalıştırır; hata politikayı geri düşüşe çevirir. */
export const loadWebTimingPolicy = (
  load: () => Promise<unknown>,
): Promise<PublicTimingPolicy> =>
  loadTimingPolicy(load, FALLBACK_TIMING_POLICY);

/**
 * `t(key)` çağrılarına politika süreleri ICU parametresi olarak (`{returnWindowDays}`…)
 * kendiliğinden eklenir; çağıranın verdiği değerler önceliklidir. Böylece
 * "N gün" içeren her metin, çağrı yeri değişmeden politikayı izler.
 */
export function withTimingValues(
  t: Translate,
  policy: PublicTimingPolicy,
): Translate {
  const timing: TimingMessageValues = timingMessageValues(policy);
  const timed = (key: string, values?: Record<string, unknown>) =>
    (t as unknown as (k: string, v: Record<string, unknown>) => string)(key, {
      ...timing,
      ...values,
    });
  return timed as unknown as Translate;
}

/** Takvim günü toplama (backend `returnWindowEndsAt` ile aynı aritmetik). */
export function addCalendarDays(
  from: string | number | Date,
  days: number,
): Date | null {
  const date = new Date(from);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date;
}
