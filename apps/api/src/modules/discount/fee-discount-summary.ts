import type { AppliedFeeDiscount } from "./fee-discount.engine";

/**
 * Ekranlar için özet: aynı kampanya çok satırlı sepette birden fazla kez
 * uygulanır (her satırın komisyonu ayrı hesaplanır). Alıcıya "komisyon indirimi"
 * satırını üç kez göstermek yerine kalem + kampanya bazında toplarız.
 */
export interface FeeDiscountSummaryLine {
  target: string;
  name: string;
  code: string | null;
  amount: number;
  side: "buyer" | "seller";
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function summarizeFeeDiscounts(
  applied: AppliedFeeDiscount[],
): FeeDiscountSummaryLine[] {
  const byKey = new Map<string, FeeDiscountSummaryLine>();
  for (const line of applied) {
    const key = `${line.discountId}:${line.target}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.amount = round2(existing.amount + line.amount);
      continue;
    }
    byKey.set(key, {
      target: line.target,
      name: line.discountName,
      code: line.discountCode ?? null,
      amount: round2(line.amount),
      side: line.side,
    });
  }
  return [...byKey.values()].filter((line) => line.amount > 0);
}

export function sumFeeDiscounts(
  applied: AppliedFeeDiscount[],
  side: "buyer" | "seller",
): number {
  return round2(
    applied
      .filter((line) => line.side === side)
      .reduce((sum, line) => sum + line.amount, 0),
  );
}
