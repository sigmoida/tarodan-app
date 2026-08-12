/** @format */

/**
 * Takas iade bacaklarının kapanış şartı — tek kaynak.
 *
 * İade bacağı sayısı yaratılış yoluna göre değişir: depo reddi İKİ bacak
 * (RET-INI + RET-REC), force-cancel-stuck TEK bacak (RET-STK) üretir. Her yol
 * bacaklarını tek transaction'da yarattığından, herhangi bir bacak teslim/kayıp
 * işaretlenebildiği anda planlanan bacakların TAMAMI zaten mevcuttur; kapanış
 * şartı "var olan bacakların hepsi çözüldü"dür. Sabit bir `>= 2` eşiği tek
 * bacaklı takası sonsuza dek `returning`de bırakır (rezervasyonlar çözülmez).
 */

export interface ReturnLegDelivery {
  deliveredAt: Date | null;
}

export interface ReturnLegResolution extends ReturnLegDelivery {
  lostAt: Date | null;
}

/** markReturnDelivered kapanışı: tüm iade bacakları teslim edildi mi? */
export function allReturnLegsDelivered(legs: ReturnLegDelivery[]): boolean {
  return legs.length > 0 && legs.every((leg) => leg.deliveredAt !== null);
}

/** markReturnLost kapanışı: tüm iade bacakları çözüldü mü (teslim ya da kayıp)? */
export function allReturnLegsResolved(legs: ReturnLegResolution[]): boolean {
  return (
    legs.length > 0 &&
    legs.every((leg) => leg.deliveredAt !== null || leg.lostAt !== null)
  );
}
