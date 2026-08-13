/**
 * Satıcının kargoya verme son tarihi TAKVİM günü değil, PAZAR HARİÇ gün
 * sayılarak hesaplanır: Türkiye'de kargo pazar günü çalışmaz; cuma günü ödenen
 * siparişin 3 günlük süresi pazar yüzünden fiilen 2 güne inmesin. Sayaç pazar
 * günlerini atlar — sonuç tarih hiçbir zaman pazara denk gelmez.
 */
export function addDaysSkippingSundays(from: Date, days: number): Date {
  const result = new Date(from);
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0) remaining--;
  }
  return result;
}
