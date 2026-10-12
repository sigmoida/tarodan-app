import { Prisma } from "@prisma/client";
import type { RefundFinancialTotals } from "@tarodan/types";
import type { RefundTreatmentV2 } from "./refund-financial-policy-v2";

export type { RefundFinancialTotals };

/**
 * İade kararının TARAF BAŞINA toplamları — admin iade detayının özet satırı
 * (şekil: `@tarodan/types` `RefundFinancialTotals`).
 *
 * Kaynak, kesinleşmiş `RefundFinancialComponent` satırlarıdır (iade, ledger ve
 * fatura da onları okur); toplam burada yeniden hesaplanmaz, yalnız satırların
 * BRÜT tutarları (net + KDV) muamelelerine göre toplanır. `shippingRefund` =
 * `outbound_shipping` × `buyer_refund` — dönüş kargosu hiçbir zaman alıcıya
 * iade edilmez.
 *
 * Decimal ile toplanır; sayı yalnız sınırda (`.toNumber()`) üretilir.
 */
export interface RefundComponentAmountRow {
  /** DB satırı düz string taşır (`RefundComponentCodeV2` ya da eski kod). */
  componentCode: string;
  treatment: string;
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
