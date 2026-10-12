import { Prisma } from "@prisma/client";
import type { RefundFinancialTotals } from "@tarodan/types";
import type {
  RefundComponentCodeV2,
  RefundTreatmentV2,
} from "./refund-financial-policy-v2";

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

/** Satış komisyonu bileşenleri: alıcı + satıcı komisyonu (hizmet bedeli değil). */
export const SALES_COMMISSION_COMPONENT_CODES = [
  "buyer_commission",
  "seller_commission",
] as const satisfies readonly RefundComponentCodeV2[];

/** Bedelin sahibine geri döndüğü muameleler (alıcıya / satıcıya iade). */
const RETURNED_TREATMENTS: readonly RefundTreatmentV2[] = [
  "buyer_refund",
  "seller_refund",
];

export interface RefundComponentNetRow {
  componentCode: string;
  treatment: string;
  netAmount: Prisma.Decimal.Value;
}

/**
 * İadede GERİ VERİLEN satış komisyonu — KDV HARİÇ (sipariş komisyon kolonları
 * da KDV hariçtir; oran aynı tabanda okunur). Alıcı komisyonu alıcıya,
 * satıcı komisyonu satıcıya iade edilen satırların toplamı; politika burada
 * yeniden çalıştırılmaz, kesinleşmiş bileşen satırları okunur.
 */
export function refundedSalesCommissionNet(
  components: readonly RefundComponentNetRow[],
): number {
  return components
    .filter(
      (row) =>
        (SALES_COMMISSION_COMPONENT_CODES as readonly string[]).includes(
          row.componentCode,
        ) && (RETURNED_TREATMENTS as readonly string[]).includes(row.treatment),
    )
    .reduce(
      (total, row) => total.plus(new Prisma.Decimal(row.netAmount)),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(2)
    .toNumber();
}
