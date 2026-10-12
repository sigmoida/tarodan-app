import { fmtTry } from "@/lib/format";
import type { RefundFinancialTotals } from "../types";

export type FinancialTotalsSide = "buyer" | "seller" | "platform";
export type FinancialTotalsLine = "refund" | "charge" | "retain" | "net";

export interface FinancialTotalsRow {
  line: FinancialTotalsLine;
  /** `fmtTry` ile biçimlenmiş tutar (`₺1.234,50`). */
  value: string;
}

export interface FinancialTotalsGroup {
  side: FinancialTotalsSide;
  rows: FinancialTotalsRow[];
}

const money = (n: number) => fmtTry(n) ?? "—";

/**
 * Tarafa göre toplam blokları: Alıcı (iade / kesinti / net), Satıcı (iade /
 * kesinti / net), Platform (alıkoyulan / iade / net). Kargo iadesi tarafsız tek
 * satırdır (`shippingRefundValue`). Hesap sunucudadır — burası yalnız sunumdur.
 */
export function financialTotalsGroups(
  totals: RefundFinancialTotals,
): FinancialTotalsGroup[] {
  return [
    {
      side: "buyer",
      rows: [
        { line: "refund", value: money(totals.buyerRefund) },
        { line: "charge", value: money(totals.buyerCharge) },
        { line: "net", value: money(totals.buyerNet) },
      ],
    },
    {
      side: "seller",
      rows: [
        { line: "refund", value: money(totals.sellerRefund) },
        { line: "charge", value: money(totals.sellerCharge) },
        { line: "net", value: money(totals.sellerNet) },
      ],
    },
    {
      side: "platform",
      rows: [
        { line: "retain", value: money(totals.platformRetain) },
        { line: "refund", value: money(totals.platformRefund) },
        { line: "net", value: money(totals.platformNet) },
      ],
    },
  ];
}

export function shippingRefundValue(totals: RefundFinancialTotals): string {
  return money(totals.shippingRefund);
}
