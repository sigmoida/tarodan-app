/**
 * İade kararının TARAF BAŞINA toplamları — admin iade detayının özet satırı.
 * API `RefundFinancialComponent` satırlarından hesaplar
 * (`refund/helpers/refund-component-totals.ts`); panel yalnız çizer, kendi
 * toplamını yapmaz. Taraflar birbirine EKLENMEZ: alıcı iadesi ile satıcı
 * kesintisi aynı paranın iki yüzüdür.
 *
 * - buyer*: `buyer_refund` (geri ödenen) − `buyer_charge` (iadeden düşülen).
 * - seller*: `seller_refund` (satıcıya iade edilen kesinti / kargo payı) −
 *   `seller_charge` (satıcıya yazılan borç).
 * - platform*: `platform_retain` (platformda kalan) − `platform_absorb`
 *   (platformun üstlendiği maliyet; `platformRefund`).
 * - shippingRefund: alıcıya geri ödenen gidiş kargosu.
 *
 * Tutarlar 2 haneli sayıdır (sunucu Decimal ile toplar, sınırda sayıya çevirir).
 */
export interface RefundFinancialTotals {
  buyerRefund: number;
  buyerCharge: number;
  buyerNet: number;
  sellerRefund: number;
  sellerCharge: number;
  sellerNet: number;
  platformRetain: number;
  platformRefund: number;
  platformNet: number;
  shippingRefund: number;
}
