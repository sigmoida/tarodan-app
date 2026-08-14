/**
 * Siparişin hangi komisyon kuralına düştüğü.
 *
 * Eşleşen kural checkout anında `Order.financialSnapshot.commission` içine
 * yazılır: kural sonradan düzenlense, pasifleştirilse ya da silinse bile
 * siparişin TAHSİL EDİLDİĞİ kural budur. Ekranlar kuralı canlı kural setinden
 * yeniden eşleştirmemeli — eşleştirme kategori, üyelik ve tutar
 * aralığına bakar; bunların hepsi sipariş sonrası değişebilir ve ekran gerçekte
 * uygulanmamış bir kuralı gösterir.
 *
 * Eski siparişlerde snapshot hiç olmayabilir (kolon nullable) ya da kural
 * eşleşmemiş olabilir → null döner; ekran "—" gösterir.
 */

export interface OrderCommissionRuleSnapshot {
  id: string;
  ruleSetId: string | null;
  name: string | null;
  categoryId: string | null;
  sellerType: string | null;
  matchedAmount: number | null;
  /** Eşleşmede kullanılan üyelik katmanı. */
  membershipTier: string | null;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

export function readCommissionRuleSnapshot(
  financialSnapshot: unknown,
): OrderCommissionRuleSnapshot | null {
  if (!financialSnapshot || typeof financialSnapshot !== "object") return null;
  const commission = (financialSnapshot as Record<string, unknown>).commission;
  if (!commission || typeof commission !== "object") return null;

  const raw = commission as Record<string, unknown>;
  const id = text(raw.ruleId);
  if (!id) return null;

  return {
    id,
    ruleSetId: text(raw.ruleSetId),
    name: text(raw.ruleName),
    categoryId: text(raw.matchedCategoryId),
    sellerType: text(raw.matchedSellerType),
    matchedAmount:
      typeof raw.matchedAmount === "number" &&
      Number.isFinite(raw.matchedAmount)
        ? raw.matchedAmount
        : null,
    membershipTier: text(raw.effectiveMembershipTier),
  };
}
