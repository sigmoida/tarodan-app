/**
 * Cayma (iade talep) penceresi — bir sipariş için TEK hesap.
 *
 * Pencere teslimde `Order.returnWindowEndsAt` olarak damgalanır (o an geçerli
 * `returnWindowDays`, Süreler ve Kurallar). Üç karar aynı damgayı okur:
 *   1) iade talebi "cayma içinde mi" (refund-creation),
 *   2) teslim → tamamlandı geçişi (order-scheduler),
 *   3) escrow `releaseAt` = damga + payout grace (payment-hold-release).
 * Admin pencereyi sonradan uzatıp kısaltsa da bir siparişte iade hakkı ile
 * satıcı ödemesi çakışamaz: üçü de teslimdeki değeri görür.
 *
 * Damgası olmayan (bu alandan önce teslim edilmiş) sipariş için bugünkü
 * pencereyle hesaplanır — önceki davranışın aynısı.
 */

/** Teslim anından itibaren takvim günüyle pencere sonu (escrow ile aynı aritmetik). */
export function returnWindowEndsAt(deliveredAt: Date, days: number): Date {
  const end = new Date(deliveredAt.getTime());
  end.setDate(end.getDate() + days);
  return end;
}

/** Siparişin geçerli pencere sonu: damga varsa o, yoksa bugünkü pencere. */
export function effectiveReturnWindowEnd(
  order: { returnWindowEndsAt?: Date | null },
  deliveredAt: Date,
  liveWindowDays: number,
): Date {
  return (
    order.returnWindowEndsAt ?? returnWindowEndsAt(deliveredAt, liveWindowDays)
  );
}
