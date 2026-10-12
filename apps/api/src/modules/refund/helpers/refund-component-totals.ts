import { Prisma } from "@prisma/client";
import type {
  RefundComponentCodeV2,
  RefundTreatmentV2,
} from "./refund-financial-policy-v2";

/**
 * İade kararının TARAF BAŞINA toplamları — admin iade detayının özet satırı.
 *
 * Kaynak, kesinleşmiş `RefundFinancialComponent` satırlarıdır (iade, ledger ve
 * fatura da onları okur); toplam burada yeniden hesaplanmaz, yalnız satırların
 * BRÜT tutarları (net + KDV) muamelelerine göre toplanır:
 *
 * - alıcı: `buyer_refund` (geri ödenen) − `buyer_charge` (iadeden düşülen) =
 *   alıcının hesabına dönen tutar (`RefundRequest.amount` ile aynı invaryant).
 * - satıcı: `seller_refund` (satıcıya iade edilen kesinti / kargo payı) −
 *   `seller_charge` (satıcıya yazılan borç).
 * - platform: `platform_retain` (platformda kalan) − `platform_absorb`
 *   (platformun üstlendiği maliyet; `platformRefund`).
 * - shippingRefund: alıcıya geri ödenen gidiş kargosu (`outbound_shipping`
 *   × `buyer_refund`) — dönüş kargosu hiçbir zaman alıcıya iade edilmez.
 *
 * Decimal ile toplanır; sayı yalnız sınırda (`.toNumber()`) üretilir.
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

export interface RefundComponentAmountRow {
  componentCode: RefundComponentCodeV2 | string;
  treatment: RefundTreatmentV2 | string;
  grossAmount: Prisma.Decimal.Value;
}

export function refundComponentTotals(
  components: readonly RefundComponentAmountRow[],
): RefundFinancialTotals {
  const sum = (match: (row: RefundComponentAmountRow) => boolean) =>
    components
      .filter(match)
      .reduce(
        (total, row) => total.plus(new Prisma.Decimal(row.grossAmount)),
        new Prisma.Decimal(0),
      );
  const byTreatment = (treatment: RefundTreatmentV2) =>
    sum((row) => row.treatment === treatment);

  const buyerRefund = byTreatment("buyer_refund");
  const buyerCharge = byTreatment("buyer_charge");
  const sellerRefund = byTreatment("seller_refund");
  const sellerCharge = byTreatment("seller_charge");
  const platformRetain = byTreatment("platform_retain");
  const platformRefund = byTreatment("platform_absorb");
  const shippingRefund = sum(
    (row) =>
      row.componentCode === "outbound_shipping" &&
      row.treatment === "buyer_refund",
  );

  const money = (value: Prisma.Decimal) =>
    value.toDecimalPlaces(2).toNumber();
  return {
    buyerRefund: money(buyerRefund),
    buyerCharge: money(buyerCharge),
    buyerNet: money(buyerRefund.minus(buyerCharge)),
    sellerRefund: money(sellerRefund),
    sellerCharge: money(sellerCharge),
    sellerNet: money(sellerRefund.minus(sellerCharge)),
    platformRetain: money(platformRetain),
    platformRefund: money(platformRefund),
    platformNet: money(platformRetain.minus(platformRefund)),
    shippingRefund: money(shippingRefund),
  };
}
