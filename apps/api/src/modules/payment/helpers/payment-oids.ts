/**
 * Bir ödemenin PayTR `merchant_oid` kayıtları — saf okuyucular. Güncel id
 * `Payment.providerConversationId`, önceki denemeler `metadata.merchantOidHistory`.
 */

/** `metadata.merchantOidHistory` içindeki boş olmayan string'ler (kayıt sırasıyla). */
export function merchantOidHistoryOf(metadata: unknown): string[] {
  const history =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).merchantOidHistory
      : undefined;
  if (!Array.isArray(history)) return [];
  return history.filter((h): h is string => typeof h === "string" && !!h);
}

/**
 * Bir ödemenin PayTR'de görünebileceği tüm oid'ler: güncel oid + yeniden başlatma
 * geçmişi. Gün kartı, ters yön taraması ve admin mutabakat bu çözümleyiciyi
 * kullanır; eşleştiriciyle aynı gerçek.
 */
export function paymentOids(payment: {
  providerConversationId: string | null;
  metadata?: unknown;
}): string[] {
  const oids: string[] = [];
  if (payment.providerConversationId) oids.push(payment.providerConversationId);
  oids.push(...merchantOidHistoryOf(payment.metadata));
  return oids;
}

/**
 * Yeniden başlatmada oid geçmişinin yeni hâli: mevcut geçmiş + (varsa, yeni
 * id'den farklı ve henüz yazılmamış) önceki güncel oid. `assignMerchantOid` ve
 * direct-form çekimi aynı kuralı kullanır.
 */
export function nextMerchantOidHistory(
  metadata: unknown,
  previousOid: string | null | undefined,
  newOid: string,
): string[] {
  const prev = (metadata as { merchantOidHistory?: unknown } | null)
    ?.merchantOidHistory;
  const history: string[] = Array.isArray(prev) ? [...prev] : [];
  if (previousOid && previousOid !== newOid && !history.includes(previousOid)) {
    history.push(previousOid);
  }
  return history;
}
