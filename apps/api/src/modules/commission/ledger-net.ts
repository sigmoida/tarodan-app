/**
 * Platform NET gelirinin TEK formülü:
 *   (satıcı komisyonu − iade edileni) + (alıcı ücreti − iade edileni)
 *
 * Stopaj satıcının vergi/payout akışına aittir, platform geliri DEĞİLDİR —
 * formüle girmez. Dashboard metrikleri ve finans özeti aynı yardımcıyı
 * kullanır; formül iki yerde elle yazılıp sessizce ayrışamaz.
 */
type NumericLike = number | string | { toString(): string } | null | undefined;

const num = (v: NumericLike): number => (v == null ? 0 : Number(v));

export interface LedgerNetSums {
  sellerCommission: NumericLike;
  refundedSellerCommission: NumericLike;
  buyerFee: NumericLike;
  refundedBuyerFee: NumericLike;
}

export function ledgerNetRevenue(sums: LedgerNetSums): number {
  return (
    num(sums.sellerCommission) -
    num(sums.refundedSellerCommission) +
    num(sums.buyerFee) -
    num(sums.refundedBuyerFee)
  );
}
