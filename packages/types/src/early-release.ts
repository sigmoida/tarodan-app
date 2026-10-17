/**
 * Erken serbest bırakma farkı — TEK hesap noktası.
 *
 * Escrow bir ödeme planlanan tarihinden (`releaseAt`: PaymentHold.releaseAt /
 * TradeCashPayment.holdReleaseAt) önce bırakıldığında ("Erken Serbest Bırak"),
 * gerçek tarih (`releasedAt`) planlananın ÖNCESİNDE kalır. Admin listesi,
 * erken bırakma diyaloğu, dosya/takas detayı ve CSV dışa aktarımı "kaç gün
 * erken" bilgisini buradan okur; her yüzeyin kendi gün hesabını yapması farklı
 * rakamlar göstermesine yol açardı.
 *
 * Kural: erken = `releasedAt < releaseAt` (kesin küçüktür). Gün farkı YUKARI
 * yuvarlanır — birkaç saat erken bırakılan ödeme de "1 gün erken" sayılır; böylece
 * "erken" ile "0 gün" asla birlikte görünmez ve sunucudaki `releasedAt < releaseAt`
 * süzgeciyle (erken bırakılanlar) birebir aynı kümeyi verir.
 *
 * `@tarodan/types` içinde durur: API (CSV) de admin de çalışma zamanında kullanır.
 */

const DAY_MS = 86_400_000;

type DateInput = string | number | Date | null | undefined;

function toTime(value: DateInput): number | null {
  if (value == null || value === "") return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Planlanan tarihe göre kaç gün ERKEN bırakıldı. Erken değilse (aynı an, geç
 * bırakılmış) ya da tarihlerden biri yoksa/geçersizse `null`. Erkense >= 1.
 */
export function earlyReleaseDays(
  releaseAt: DateInput,
  releasedAt: DateInput,
): number | null {
  const planned = toTime(releaseAt);
  const actual = toTime(releasedAt);
  if (planned === null || actual === null || actual >= planned) return null;
  return Math.ceil((planned - actual) / DAY_MS);
}

/** `earlyReleaseDays` null değilse: ödeme planlanandan önce bırakılmış. */
export function isReleasedEarly(
  releaseAt: DateInput,
  releasedAt: DateInput,
): boolean {
  return earlyReleaseDays(releaseAt, releasedAt) !== null;
}
