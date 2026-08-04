/**
 * Fatura tarih/saat biçimlendirmesi — TEK takvim: Türkiye.
 *
 * Belgenin tarihi, saati ve numara yılı aynı takvimden okunmak ZORUNDA: üçü
 * ayrışırsa belge kendi içinde çelişir ve yasal düzenlenme tarihi kayar.
 *
 * Eskiden tarih `toISOString()` (UTC), saat `toTimeString()` (süreç yerel saati)
 * ile üretiliyordu. Sunucu UTC koştuğu için tüm belgeler Türkiye saatinden 3 saat
 * geri düşüyor, gece yarısından sonra kesilen fatura bir önceki güne yazılıyordu;
 * 31 Aralık gecesinde ise numara yılı ile belge tarihi farklı yıllara düşüyor ve
 * boşluksuz (gap-free) numara sırası bozuluyordu.
 *
 * Süreç saat dilimine bağımlı olmamak için biçimlendirme `Intl` üzerinden
 * AÇIKÇA Europe/Istanbul ile yapılır; `TZ` ne olursa olsun sonuç aynıdır.
 */

export const INVOICE_TIME_ZONE = "Europe/Istanbul";

/** yyyy-mm-dd / HH:mm:ss parçalarını Türkiye takviminde çöz. */
function istanbulParts(at: Date): Record<string, string> {
  // `en-CA` yerine parça bazlı okuma: yerelleştirme biçimi sürüme göre değişse
  // bile alan adları (year/month/day/hour/…) sabittir.
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: INVOICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const { type, value } of formatter.formatToParts(at)) {
    parts[type] = value;
  }
  return parts;
}

/** UBL `cbc:IssueDate` — yyyy-mm-dd, Türkiye takvimi. */
export function invoiceIssueDate(at: Date): string {
  const p = istanbulParts(at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** UBL `cbc:IssueTime` — HH:mm:ss, Türkiye saati. */
export function invoiceIssueTime(at: Date): string {
  const p = istanbulParts(at);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** Belge numarası sırasının yılı — belge tarihiyle AYNI takvimden. */
export function invoiceIssueYear(at: Date): number {
  return Number(istanbulParts(at).year);
}
