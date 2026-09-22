import type { AnalyticsTab } from "@tarodan/types";
import type { ResolvedAnalyticsRange } from "./analytics-range.helper";

/**
 * Redis anahtarı + TTL — TEK yerde.
 *
 * Analitik sorguları dönemin tamamını tarar; aynı ekranın her sekme
 * değişiminde yeniden hesaplanması gerekmiyor.
 */

/** Şu ana kadar uzanan bir pencere büyümeye devam eder: kısa tutulur. */
export const ANALYTICS_LIVE_TTL_SECONDS = 5 * 60;

/**
 * Tamamen GEÇMİŞTE kalan aralık bir daha değişmez — yeni satır o pencereye
 * düşemez — bu yüzden çok daha uzun tutulabilir. (İade/hak ediş damgaları
 * geçmişe yazılmaz; hepsi olayın kendi anını taşır.)
 */
export const ANALYTICS_CLOSED_TTL_SECONDS = 24 * 60 * 60;

/** Anahtar şeması değiştiğinde artırılır; eski gövdeler kendiliğinden düşer. */
const VERSION = "v2"; // v2: sekmeler test şeridini dışlıyor

export const ANALYTICS_CACHE_PREFIX = `admin:analytics:${VERSION}:`;

/**
 * Anahtar ÖLÇÜLEN her şeyi taşımalı: sekme, pencere, kova boyu ve karşılaştırma
 * isteği. Biri eksik kalırsa iki farklı soru aynı satırı okur.
 *
 * Canlı pencerenin sonu "şimdi" olduğundan anahtar TTL boyutunda kovalara
 * yuvarlanır; aksi halde her istek yeni bir anahtar üretir ve önbellek hiç
 * tutmazdı.
 */
export function analyticsCacheKey(
  tab: AnalyticsTab,
  range: ResolvedAnalyticsRange,
  now: Date = new Date(),
): { key: string; ttl: number } {
  const from = range.current.gte.toISOString();
  const to = range.current.lte.toISOString();
  const shape = `${range.groupBy}:${range.previous ? "cmp" : "solo"}`;
  const closed = range.current.lte.getTime() < now.getTime();

  if (closed) {
    return {
      key: `${ANALYTICS_CACHE_PREFIX}${tab}:${shape}:${from}:${to}`,
      ttl: ANALYTICS_CLOSED_TTL_SECONDS,
    };
  }

  const bucket = Math.floor(
    now.getTime() / (ANALYTICS_LIVE_TTL_SECONDS * 1000),
  );
  return {
    key: `${ANALYTICS_CACHE_PREFIX}${tab}:${shape}:${from}:live:${bucket}`,
    ttl: ANALYTICS_LIVE_TTL_SECONDS,
  };
}
