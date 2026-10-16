import type { Prisma } from "@prisma/client";
import {
  scheduleWindowWhere,
  withinScheduleWindow,
} from "../../../common/helpers/schedule-window";

/**
 * "Hero slaytı şu an yayında mı" — TEK kural. Vitrin okuması
 * (`GET /hero-slides`), tık/gösterim sayımı ve admin listesindeki `isLive`
 * bunu kullanır.
 *
 * Yayında = admin anahtarı açık + tarih penceresinin içinde (sınırlar dahil;
 * reklamla aynı pencere kuralı).
 */

export interface HeroLiveFields {
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
}

export function isHeroSlideLive(
  slide: HeroLiveFields,
  now: Date = new Date(),
): boolean {
  return (
    slide.isActive && withinScheduleWindow(now, slide.startDate, slide.endDate)
  );
}

/** `isHeroSlideLive`'ın veritabanı süzmesi — kural ile birebir aynı. */
export function heroSlideLiveWhere(now: Date): Prisma.HeroSlideWhereInput {
  return { isActive: true, AND: scheduleWindowWhere(now) };
}

export interface HeroWindow {
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * Pencerelerin ŞİMDİDEN itibaren aynı anda en çok kaçının açık olduğu.
 * Biten pencere sayılmaz, geçmişte başlamış pencere şimdi başlamış sayılır.
 * Sınırlar dahildir: biri tam bittiği anda öbürü başlıyorsa o an ikisi de
 * yayındadır.
 *
 * "En çok N yayında slayt" kuralı bunu kullanır: ileri tarihe zamanlanan bir
 * slayt, o gün diğerleriyle birlikte sınırı aşacaksa şimdiden reddedilir;
 * başka bir slaytın bitişinden sonraya zamanlanan ise kabul edilir.
 */
export function peakConcurrentWindows(
  windows: readonly HeroWindow[],
  now: Date,
): number {
  const nowMs = now.getTime();
  const events: Array<[number, 1 | -1]> = [];
  for (const window of windows) {
    const end = window.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (end < nowMs) continue;
    const start = Math.max(
      window.startDate?.getTime() ?? Number.NEGATIVE_INFINITY,
      nowMs,
    );
    if (end < start) continue;
    events.push([start, 1], [end, -1]);
  }
  // Aynı anda başlangıç bitişten önce işlenir (sınırlar dahil).
  events.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return b[1] - a[1];
  });

  let open = 0;
  let peak = 0;
  for (const [, delta] of events) {
    open += delta;
    peak = Math.max(peak, open);
  }
  return peak;
}

/**
 * Ardışık iki pencere arasında KESİNTİ sayılmayan en büyük boşluk. Admin formu
 * bitişi gün sonu (`T23:59:59.999`), başlangıcı gün başı (`T00:00:00.000`)
 * olarak gönderir; normal günlük devirde aradaki 1 ms'lik fark "boş liste"
 * sayılıp 409 üretmemeli. Bir dakikayı aşan boşluk gerçek kesintidir.
 */
export const HERO_COVERAGE_GAP_TOLERANCE_MS = 60_000;

/**
 * Pencerelerin birleşiminin ŞİMDİDEN itibaren kesintisiz örttüğü son an
 * (ms); hiç sonlanmıyorsa `Infinity`, şu an hiçbiri açık değilse `now`.
 *
 * Sınırlar dahildir ve ardışık iki pencere arasındaki en çok
 * `HERO_COVERAGE_GAP_TOLERANCE_MS` (1 dk) boşluk kesinti sayılmaz: biri gün
 * sonunda bitip öbürü ertesi gün başında başlıyorsa kesinti yoktur. Tolerans
 * "şimdi" anına UYGULANMAZ: şu an açık pencere yoksa örtü `now`dır. "Slider boş kalamaz" koruması bunu kullanır: bir değişiklik bu
 * anı ERKENE çekiyorsa slider ileride boş kalacaktır (ör. tek kalıcı slaytın
 * bitiş tarihi verilmesi ya da kalıcı slaytın silinip geriye bitiş tarihli bir
 * slaytın kalması).
 */
export function guaranteedCoverageUntil(
  windows: readonly HeroWindow[],
  now: Date,
): number {
  const nowMs = now.getTime();
  const open = windows
    .map((window) => ({
      start: Math.max(
        window.startDate?.getTime() ?? Number.NEGATIVE_INFINITY,
        nowMs,
      ),
      end: window.endDate?.getTime() ?? Number.POSITIVE_INFINITY,
    }))
    .filter((window) => window.end >= nowMs && window.end >= window.start)
    .sort((a, b) => a.start - b.start);

  let covered = nowMs;
  let coveringNow = false;
  for (const window of open) {
    // "Şimdi" anında TOLERANS YOK: ilk pencere şu an açık olmalı
    // (başlangıç <= now). Tolerans yalnız ARDIŞIK iki pencere arasındaki
    // boşluk içindir; 50 sn sonra başlayacak slayt şu an canlı sayılmaz.
    const tolerance = coveringNow ? HERO_COVERAGE_GAP_TOLERANCE_MS : 0;
    if (window.start - covered > tolerance) break;
    coveringNow = true;
    covered = Math.max(covered, window.end);
    if (covered === Number.POSITIVE_INFINITY) break;
  }
  return covered;
}
