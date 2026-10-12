import type { AdminRefundTab } from "@tarodan/types";

/**
 * İadeler tablosunun kolonları, ekrandaki sırayla. Kolonu üreten kod
 * `columns.tsx`'tedir; hangi sekmede hangilerinin göründüğü buradadır.
 */
export const REFUND_COLUMN_KEYS = [
  "refundNo",
  "order",
  "party",
  "product",
  "money",
  "cargo",
  "warehouse",
  "reason",
  "amount",
  "status",
  "invoice",
] as const;

export type RefundColumnKey = (typeof REFUND_COLUMN_KEYS)[number];

/** Yalnız takas sekmesinde görünen kolonlar (depo akışı takasa özgüdür). */
const TRADE_ONLY_COLUMNS: readonly RefundColumnKey[] = ["warehouse"];

export function refundColumnKeys(tab: AdminRefundTab): RefundColumnKey[] {
  return REFUND_COLUMN_KEYS.filter(
    (key) => tab === "trade" || !TRADE_ONLY_COLUMNS.includes(key),
  );
}
