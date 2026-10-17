/**
 * PayTR panelindeki "sipariş no" (`merchant_oid`) — API'nin ödeme bloklarında
 * taşıdığı iki alan (sipariş dosyası, ödeme detayı, takas nakit ödemesi).
 */
export interface PaytrOidFields {
  /** Güncel PayTR id'si; ödeme niyeti hiç başlamadıysa boş. */
  paytrOid?: string | null;
  /** Önceki denemeler, en yenisi başta. */
  paytrOidHistory?: string[] | null;
}

export interface PaytrOidDisplay {
  current: string | null;
  previous: string[];
}

/** Gösterilecek bir şey yoksa `null` — çağıran satırı hiç çizmez. */
export function paytrOidDisplay(
  fields: PaytrOidFields | null | undefined,
): PaytrOidDisplay | null {
  const current = fields?.paytrOid?.trim() || null;
  const previous = (fields?.paytrOidHistory ?? [])
    .map((oid) => oid.trim())
    .filter((oid) => oid && oid !== current);
  if (!current && previous.length === 0) return null;
  return { current, previous };
}
