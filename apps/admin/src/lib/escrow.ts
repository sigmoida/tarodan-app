/**
 * Escrow / payout zamanlama yardımcıları (yeni escrow modeli).
 *
 * Kural (backend ile birebir): Satıcıya ödeme = teslim (deliveredAt) + 14 gün
 * iade penceresi + 1 gün grace. Onay/ödeme anında payout YOK; teslim anında
 * PaymentHold.releaseAt set edilir. Açık bir iade varken hold frozenByRefundId
 * ile kilitlenir ve serbest bırakılamaz.
 *
 * Bu modül salt-okunur UI hesabıdır — gerçek release tarihini backend yazar.
 * deliveredAt'ten türeyen tarih "tahmini serbest bırakma" olarak gösterilir;
 * payout listesindeki releaseAt varsa o gerçek değer önceliklidir.
 */

/** İade penceresi: teslimden sonra 14 gün koşulsuz iade. */
export const REFUND_WINDOW_DAYS = 14;
/** Pencere kapandıktan sonra payout'a kadar 1 gün grace. */
export const PAYOUT_GRACE_DAYS = 1;
/** Teslimden serbest bırakmaya toplam gün (14 + 1). */
export const ESCROW_RELEASE_DAYS = REFUND_WINDOW_DAYS + PAYOUT_GRACE_DAYS;

const DAY_MS = 86_400_000;

/**
 * deliveredAt + 14 + 1 gün → tahmini serbest bırakma tarihi.
 * deliveredAt yoksa null (henüz teslim edilmedi → escrow saati başlamadı).
 */
export function computeEstimatedReleaseAt(
  deliveredAt: string | Date | null | undefined,
): Date | null {
  if (!deliveredAt) return null;
  const base = new Date(deliveredAt).getTime();
  if (Number.isNaN(base)) return null;
  return new Date(base + ESCROW_RELEASE_DAYS * DAY_MS);
}

/** İade penceresinin (teslim + 14 gün) bitiş tarihi. */
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
  /** Kısa rozet etiketi. */
  label: string;
  /** Bir cümlelik açıklama. */
  detail: string;
  /** Rozet tonu (tailwind sınıf grubu seçimi için). */
  tone: 'danger' | 'warning' | 'info' | 'success';
}

export interface EscrowHoldReasonInput {
  /** Hold frozenByRefundId dolu mu (atomik kilit). */
  frozen?: boolean;
  /** Sipariş/Hold için açık bir iade talebi var mı. */
  hasOpenRefund?: boolean;
  /** Teslim tarihi (escrow saatinin başlangıcı). */
  deliveredAt?: string | Date | null;
  /** Gerçek release tarihi (backend yazdıysa öncelikli). */
  releaseAt?: string | Date | null;
  /** Karşılaştırma anı (test edilebilirlik için). */
  now?: Date;
}

/**
 * Bir hold neden bekliyor? Öncelik sırası:
 *   frozen > açık iade > teslim+14 dolmadı > teslim edilmedi > hazır.
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

/** Order.cancellationType (iptal | iade) için Türkçe rozet etiketi. */
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
