/**
 * Türkiye takvimi — tarih alanlarının TEK yorumu.
 *
 * Veritabanındaki tarihler UTC anlarıdır; ama iş anlamında "gün" ve "yıl"
 * Türkiye takvimine göredir. `Date#getFullYear()` gibi yerel yöntemler SÜRECİN
 * saat dilimine bakar: sunucu UTC koştuğunda (projede `TZ` tanımlı değil)
 * 1977-12-31T22:00Z olarak saklanmış bir "1978 model yılı" 1977 diye okunur ve
 * satıcı formu kaydettiğinde yıl kalıcı olarak bir geri kayar.
 *
 * Biçimlendirme `Intl` üzerinden AÇIKÇA Europe/Istanbul ile yapılır; `TZ` ne
 * olursa olsun sonuç aynıdır.
 */

export const TR_TIME_ZONE = "Europe/Istanbul";

/** yyyy-mm-dd / HH:mm:ss parçalarını Türkiye takviminde çöz. */
export function trCalendarParts(at: Date): Record<string, string> {
  // Parça bazlı okuma: yerelleştirme biçimi sürüme göre değişse bile alan
  // adları (year/month/day/hour/…) sabittir.
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TR_TIME_ZONE,
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

/** yyyy-mm-dd, Türkiye takvimi. */
export function trCalendarDate(at: Date): string {
  const p = trCalendarParts(at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** HH:mm:ss, Türkiye saati. */
export function trCalendarTime(at: Date): string {
  const p = trCalendarParts(at);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** "yyyy-mm-dd HH:mm:ss", Türkiye takvimi/saati — PayTR tarih aralığı parametreleri
 *  (rapor ve geri dönen transfer uçları) bu biçimi İstanbul saatiyle yorumlar. */
export function trCalendarDateTime(at: Date): string {
  const p = trCalendarParts(at);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Türkiye takviminde yıl. */
export function trCalendarYear(at: Date): number {
  return Number(trCalendarParts(at).year);
}

/**
 * Türkiye takviminde ayın ilk anı (UTC `Date`). `new Date(y, m, 1)` sürecin
 * saat dilimini kullanır — sunucu UTC koşarken ay sınırı Türkiye'ye göre üç
 * saat kayar. Türkiye 2016'dan beri sabit UTC+03:00'dadır.
 */
export function trMonthStart(at: Date): Date {
  const p = trCalendarParts(at);
  return new Date(`${p.year}-${p.month}-01T00:00:00+03:00`);
}
