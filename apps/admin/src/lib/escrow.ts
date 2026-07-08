/**
 * Escrow / payout scheduling helpers (new escrow model).
 *
 * Rule (mirrors the backend): payout to seller = delivery (deliveredAt) + 14-day
 * refund window + 1-day grace. NO payout on approval/payment; PaymentHold.releaseAt
 * is set at delivery. While a refund is open the hold is locked via frozenByRefundId
 * and cannot be released.
 *
 * This module is a read-only UI computation — the backend writes the real release
 * date. The date derived from deliveredAt is shown as an "estimated release"; if the
 * payout list has a releaseAt, that real value takes precedence.
 */

/** Refund window: 14 days of unconditional returns after delivery. */
export const REFUND_WINDOW_DAYS = 14;
/** 1-day grace after the window closes, before payout. */
export const PAYOUT_GRACE_DAYS = 1;
/** Total days from delivery to release (14 + 1). */
export const ESCROW_RELEASE_DAYS = REFUND_WINDOW_DAYS + PAYOUT_GRACE_DAYS;

const DAY_MS = 86_400_000;

/**
 * deliveredAt + 14 + 1 days → estimated release date.
 * Null if no deliveredAt (not yet delivered → escrow clock hasn't started).
 */
export function computeEstimatedReleaseAt(
  deliveredAt: string | Date | null | undefined,
): Date | null {
  if (!deliveredAt) return null;
  const base = new Date(deliveredAt).getTime();
  if (Number.isNaN(base)) return null;
  return new Date(base + ESCROW_RELEASE_DAYS * DAY_MS);
}

/** End date of the refund window (delivery + 14 days). */
export function computeRefundWindowEnd(
  deliveredAt: string | Date | null | undefined,
): Date | null {
  if (!deliveredAt) return null;
  const base = new Date(deliveredAt).getTime();
  if (Number.isNaN(base)) return null;
  return new Date(base + REFUND_WINDOW_DAYS * DAY_MS);
}

export type EscrowHoldReasonCode =
  | 'frozen'
  | 'open_refund'
  | 'window_not_elapsed'
  | 'not_delivered'
  | 'ready';

export interface EscrowHoldReason {
  code: EscrowHoldReasonCode;
  /** Short badge label. */
  label: string;
  /** One-sentence description. */
  detail: string;
  /** Badge tone (for picking the tailwind class group). */
  tone: 'danger' | 'warning' | 'info' | 'success';
}

export interface EscrowHoldReasonInput {
  /** Is the hold's frozenByRefundId set (atomic lock). */
  frozen?: boolean;
  /** Is there an open refund request for the order/hold. */
  hasOpenRefund?: boolean;
  /** Delivery date (start of the escrow clock). */
  deliveredAt?: string | Date | null;
  /** Real release date (takes precedence if the backend wrote it). */
  releaseAt?: string | Date | null;
  /** Comparison instant (for testability). */
  now?: Date;
}

/**
 * Why is a hold waiting? Priority order:
 *   frozen > open refund > delivery+14 not elapsed > not delivered > ready.
 */
export function describeHoldReason(input: EscrowHoldReasonInput): EscrowHoldReason {
  const now = input.now ?? new Date();

  if (input.frozen) {
    return {
      code: 'frozen',
      label: 'Donduruldu',
      detail: 'Hold açık bir iade talebi nedeniyle kilitli (frozen) — iade sonuçlanana kadar serbest bırakılamaz.',
      tone: 'danger',
    };
  }

  if (input.hasOpenRefund) {
    return {
      code: 'open_refund',
      label: 'Açık iade var',
      detail: 'Bu sipariş için açık bir iade talebi var — talep sonuçlanana kadar ödeme bekletiliyor.',
      tone: 'danger',
    };
  }

  const release = input.releaseAt
    ? new Date(input.releaseAt)
    : computeEstimatedReleaseAt(input.deliveredAt);

  if (!input.deliveredAt && !input.releaseAt) {
    return {
      code: 'not_delivered',
      label: 'Teslim bekleniyor',
      detail: 'Ürün henüz teslim edilmedi — escrow saati teslimle başlar.',
      tone: 'warning',
    };
  }

  if (release && release.getTime() > now.getTime()) {
    return {
      code: 'window_not_elapsed',
      label: 'Teslim+14 dolmadı',
      detail: `İade penceresi + grace henüz dolmadı — ${release.toLocaleDateString('tr-TR', {
        dateStyle: 'medium',
      })} tarihinde serbest bırakılabilir.`,
      tone: 'info',
    };
  }

  return {
    code: 'ready',
    label: 'Serbest bırakılabilir',
    detail: 'İade penceresi doldu ve açık iade yok — ödeme satıcıya aktarılabilir.',
    tone: 'success',
  };
}

/** Turkish badge label for Order.cancellationType (iptal | iade). */
export function cancellationTypeLabel(
  type?: string | null,
): { label: string; detail: string } | null {
  if (!type) return null;
  if (type === 'iptal') {
    return {
      label: 'İptal (kargo öncesi)',
      detail: 'Kargo öncesi iptal — ödeme alıcıya tam iade edilir.',
    };
  }
  if (type === 'iade') {
    return {
      label: 'İade (kargo sonrası)',
      detail: 'Kargo sonrası iade — ürün geri gönderilir, iade talebi akışı işler.',
    };
  }
  return { label: type, detail: '' };
}
