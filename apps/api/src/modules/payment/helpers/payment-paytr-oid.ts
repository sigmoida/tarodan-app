import { paymentOids } from "../reconciliation/paytr-report-matching.service";

/** Admin ekranlarında bir ödemenin PayTR "sipariş no" görünümü. */
export interface PaytrOidView {
  /** Güncel `merchant_oid` (son deneme); ödeme niyeti hiç başlamadıysa `null`. */
  paytrOid: string | null;
  /** Önceki denemelerin id'leri, en yenisi başta (güncel olan hariç). */
  paytrOidHistory: string[];
}

/**
 * Bir ödeme satırından PayTR id'sini ve önceki denemelerini çıkarır. Oid
 * toplama kuralı `paymentOids` ile aynıdır (tek gerçek); burada yalnız
 * güncel/geçmiş ayrımı ve tekilleştirme yapılır.
 */
export function paytrOidViewOf(
  payment: {
    providerConversationId: string | null;
    metadata?: unknown;
  } | null,
): PaytrOidView {
  if (!payment) return { paytrOid: null, paytrOidHistory: [] };
  const paytrOid = payment.providerConversationId || null;
  const history = paymentOids({
    providerConversationId: null,
    metadata: payment.metadata,
  });
  const paytrOidHistory = [...new Set(history)]
    .filter((oid) => oid !== paytrOid)
    .reverse();
  return { paytrOid, paytrOidHistory };
}
