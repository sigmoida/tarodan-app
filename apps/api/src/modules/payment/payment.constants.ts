/**
 * Faz 9.2: Ödeme sabitleri + config anahtarları için tek referans. Kod tabanında
 * dağınık "magic number"lar (para epsilon 0.01, pencere süreleri) ve env anahtarları
 * vardı; bu dosya tek kaynak olarak toplar. Config-tabanlı değerler ConfigService/env
 * ile okunur (varsayılanları burada belgelenir) — sabitler (epsilon) doğrudan kullanılır.
 */

/**
 * Para karşılaştırma epsilon'u (kuruş yuvarlama toleransı). `>= X - MONEY_EPSILON` /
 * `> cap + MONEY_EPSILON` kalıplarında kullanılır. Tek yerden yönetilir ki tüm para
 * karşılaştırmaları tutarlı olsun.
 */
export const MONEY_EPSILON = 0.01;

/**
 * Ödeme/iade ile ilgili env config anahtarları ve varsayılanları (tek referans).
 * Kodda `configService.get(KEY) || DEFAULT` deseniyle okunur.
 */
export const PAYMENT_CONFIG_KEYS = {
  /** Ödeme satırını `failed` yapma penceresi (dk). PayTR 3DS ~30dk > bu olmalı. */
  FAIL_TIMEOUT_MINUTES: { key: "PAYMENT_FAIL_TIMEOUT_MINUTES", default: 35 },
  /** Escrow hold gün sayısı. */
  HOLD_DAYS: { key: "PAYMENT_HOLD_DAYS", default: 7 },
  /** İade talep penceresi (gün). */
  RETURN_WINDOW_DAYS: { key: "RETURN_WINDOW_DAYS", default: 14 },
  /** Payout uygunluğu grace (gün) — iade penceresinden sonra. */
  PAYOUT_GRACE_DAYS: { key: "PAYOUT_GRACE_DAYS", default: 1 },
  /** Satıcı hazırlık (kargoya verme) son tarihi (gün). */
  PREPARING_DEADLINE_DAYS: { key: "PREPARING_DEADLINE_DAYS", default: 3 },
  /** PayTR reconcile tutar toleransı (TL). */
  RECONCILE_AMOUNT_TOLERANCE_TL: {
    key: "PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL",
    default: 0.05,
  },
  /** İade drop-off (şubeye götürme) süresi (gün) — D25. */
  RETURN_DROPOFF_DAYS: { key: "REFUND_RETURN_DROPOFF_DAYS", default: 7 },
  /** wait_for_delivery'de takılı iade timeout (gün) — MONEY-H6. */
  WAIT_DELIVERY_MAX_DAYS: { key: "REFUND_WAIT_DELIVERY_MAX_DAYS", default: 30 },
  /** İade sonrası satıcı inceleme penceresi (saat) — D26. */
  RETURN_INSPECTION_HOURS: {
    key: "REFUND_RETURN_INSPECTION_HOURS",
    default: 24,
  },
  /** Orphan capture geriye-bakış (saat) — FLOW-M3. */
  ORPHAN_LOOKBACK_HOURS: { key: "PAYTR_ORPHAN_LOOKBACK_HOURS", default: 72 },
} as const;
