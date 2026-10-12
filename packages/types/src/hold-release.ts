/**
 * Escrow hold'u neden serbest bırakılamıyor — API ile admin panelinin ortak
 * sözlüğü. API bu nedeni manuel bırakma, cron ve payout'un KULLANDIĞI aynı
 * yüklemden hesaplar (`holdReleaseBlockedReason`); hold listesi
 * (`GET /admin/payouts/transactions`) her satırda `releasable` +
 * `releaseBlockedReason` döner, panel rozetini buradan çizer — kendi tahminini
 * yürütmez.
 *
 * - frozen: açık bir iade hold'u kilitliyor (ya da sipariş üzerinde açık iade
 *   talebi var).
 * - not_due: serbest bırakma tarihi gelmedi (ya da hiç planlanmadı).
 * - order_not_terminal: sipariş ne teslim edilmiş ne de iade/iptalle kapanmış.
 * - seller_at_fault: iade/iptalle kapanmış siparişte kalan tutar var ama kusur
 *   satıcıda (ya da kusur belirlenemiyor) — o tutar satıcıya ödenmez.
 * - already_released: hold artık tutulmuyor ya da bırakılacak tutar kalmadı.
 */
export const HOLD_RELEASE_BLOCKED_REASONS = [
  "frozen",
  "not_due",
  "order_not_terminal",
  "seller_at_fault",
  "already_released",
] as const;

export type HoldReleaseBlockedReason =
  (typeof HOLD_RELEASE_BLOCKED_REASONS)[number];

/** Hold listesi satırının bırakılabilirlik alanları. */
export interface HoldReleasability {
  releasable: boolean;
  releaseBlockedReason: HoldReleaseBlockedReason | null;
  /** Hold'un siparişinin GÜNCEL durumu (`null`: sipariş bulunamadı). */
  orderStatus: string | null;
}
