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
 * "yyyy-mm-dd" Türkiye gününün BAŞLANGIÇ anı (UTC Date). TR 2016'dan beri sabit
 * UTC+3 (DST yok); PayTR rapor günleri bu takvimdedir. `new Date("yyyy-mm-dd")`
 * UTC gece yarısı verirdi — 3 saat geç.
 */
export function istanbulDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "yyyy-mm-dd" Türkiye gününün BİTİŞ anı — o günün son milisaniyesi
 * (23:59:59.999 Europe/Istanbul), UTC `Date`. Türkiye'nin DST'si olmadığı
 * için gün her zaman tam 24 saattir; ay sonu/başı gibi köşe durumlar da
 * dahil `istanbulDayStart` ile aynı aritmetik kullanılır.
 */
export function istanbulDayEnd(day: string): Date {
  return new Date(istanbulDayStart(day).getTime() + DAY_MS - 1);
}

/**
 * Takvim ayının (1–12) Türkiye'deki aralığı: ayın ilk anı dahil, sonraki
 * ayın ilk anı HARİÇ. `Date.UTC(y, m - 1, 1)` ay sınırını üç saat kaydırırdı:
 * ayın son gecesi 21:00'den sonra silinen kayıt yanlış aya düşerdi.
 */
export function istanbulMonthRange(
  year: number,
  month: number,
): { gte: Date; lt: Date } {
  const monthStart = (y: number, m: number) =>
    new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+03:00`);
  return {
    gte: monthStart(year, month),
    lt: month === 12 ? monthStart(year + 1, 1) : monthStart(year, month + 1),
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Liste filtresindeki bir tarih ucunu ana çevirir. Yalnız tarih ("yyyy-mm-dd",
 * panelin tarih seçicisi) Türkiye gününün başı ya da SONU olur: bitiş
 * `new Date("2026-10-12")` olsaydı UTC gece yarısı olurdu ve seçilen günün
 * tamamı dışarıda kalırdı. Saat taşıyan bir ISO değeri olduğu gibi kullanılır.
 */
export function istanbulRangeEdge(value: string, edge: "start" | "end"): Date {
  if (DATE_ONLY.test(value)) {
    return edge === "start" ? istanbulDayStart(value) : istanbulDayEnd(value);
  }
  return new Date(value);
}

/**
 * Bir anın Türkiye'deki DUVAR SAATİNİ UTC alanlarında taşıyan `Date`.
 * Elektronik tablo tarihleri saat dilimsizdir ve yazıcı (ExcelJS) `Date`'i UTC
 * alanlarından yazar: 21:30Z'de oluşan sipariş, dosyada ertesi günün 00:30'u
 * olarak görünmeli — ekranla aynı gün.
 */
export function istanbulWallClock(at: Date): Date {
  const p = trCalendarParts(at);
  return new Date(
    Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
      at.getUTCMilliseconds(),
    ),
  );
}

/** `at`'in düştüğü Türkiye GÜNÜNÜN BAŞLANGIÇ anı ("bugün, gece yarısı"). */
export function istanbulDayStartOf(at: Date): Date {
  return istanbulDayStart(trCalendarDate(at));
}

/**
 * DÜNÜN (Türkiye takvimi) TAM günü — 00:00:00.000'dan 23:59:59.999'a. Eşit
 * uzunlukta bir "önceki 24 saat" DEĞİL: takvim günü, saat kaçta bakılırsa
 * bakılsın aynı sınırları verir.
 */
export function istanbulYesterdayWindow(at: Date): { gte: Date; lte: Date } {
  const todayStart = istanbulDayStartOf(at);
  return {
    gte: new Date(todayStart.getTime() - DAY_MS),
    lte: new Date(todayStart.getTime() - 1),
  };
}
