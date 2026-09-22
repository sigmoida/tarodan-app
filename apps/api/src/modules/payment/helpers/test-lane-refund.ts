/**
 * Test şeridi iadesi — PayTR'ye HİÇ gidilmez.
 *
 * Test şeridi ödemesi canlı mağazada `test_mode=1` ile alınır: tahsilat yoktur,
 * dolayısıyla geri verilecek para da yoktur. Canlı iade API'sine test işleminin
 * oid'iyle gitmek ya reddedilir (iade takılır, sipariş/stok/iptal akışı
 * kilitlenir) ya da daha kötüsü canlı bakiyeden gerçek para çıkarır. Sürat
 * (TEST takip kodu) ve eLogo (belge yok) atlamalarıyla aynı felsefe: sağlayıcı
 * adımı yerel bir başarıyla değiştirilir, akışın geri kalanı (defter — trigger
 * test damgalar —, stok, iptal aktörü, bildirimler, fatura atlaması) AYNEN
 * işler.
 *
 * Sonuç deneme satırına `providerResponse` olarak yazılır; tekrar denemede
 * `finalize` yolu aynı yanıtı okur, sağlayıcı yine çağrılmaz (idempotent).
 */

export const TEST_LANE_REFUND_PREFIX = "TEST-REFUND-";

/** Sentetik sağlayıcı referansı: gerçek PayTR referanslarıyla karışmasın diye önekli. */
export function testLaneRefundReference(attemptId: string): string {
  return `${TEST_LANE_REFUND_PREFIX}${attemptId}`;
}

/**
 * PayTR iade yanıtı yerine yazılan yerel başarı. `paymentId` alanı iade
 * servislerinin `providerRefundId` çözümüyle (paymentId || merchant_oid) okunur.
 */
export function testLaneRefundResult(
  attemptId: string,
  amount: number,
): Record<string, unknown> {
  return {
    status: "success",
    err_msg: null,
    return_amount: amount,
    paymentId: testLaneRefundReference(attemptId),
    testLane: true,
  };
}
