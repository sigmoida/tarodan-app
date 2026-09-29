import {
  ANALYTICS_CLOSED_TTL_SECONDS,
  ANALYTICS_LIVE_TTL_SECONDS,
  analyticsCacheKey,
} from "./analytics-cache.helper";
import { resolveAnalyticsRange } from "./analytics-range.helper";

const now = new Date("2026-06-15T09:30:00.000Z");

describe("analyticsCacheKey", () => {
  it("sekmeyi, pencereyi ve kova boyunu anahtara taşır", () => {
    const day = analyticsCacheKey(
      "sales",
      resolveAnalyticsRange({ from: "2026-06-01", to: "2026-06-07" }),
      now,
    ).key;
    const month = analyticsCacheKey(
      "sales",
      resolveAnalyticsRange({
        from: "2026-06-01",
        to: "2026-06-07",
        groupBy: "month",
      }),
      now,
    ).key;
    const other = analyticsCacheKey(
      "trade",
      resolveAnalyticsRange({ from: "2026-06-01", to: "2026-06-07" }),
      now,
    ).key;

    expect(day).not.toBe(month);
    expect(day).not.toBe(other);
  });

  /**
   * Karşılaştırmalı yanıt karşılaştırmasız olandan farklı bir gövdedir; aynı
   * anahtarı paylaşsalardı biri diğerinin cevabını görürdü.
   */
  it("karşılaştırma isteğini anahtara taşır", () => {
    const solo = analyticsCacheKey(
      "sales",
      resolveAnalyticsRange({ from: "2026-06-01", to: "2026-06-07" }),
      now,
    ).key;
    const compared = analyticsCacheKey(
      "sales",
      resolveAnalyticsRange({
        from: "2026-06-01",
        to: "2026-06-07",
        compare: true,
      }),
      now,
    ).key;

    expect(solo).not.toBe(compared);
  });

  /**
   * Tamamen geçmişte kalan aralığa yeni satır düşemez — her damga olayın kendi
   * anını taşıyor — bu yüzden çok daha uzun tutulabilir.
   */
  it("kapalı aralığı uzun süre, canlı pencereyi kısa süre tutar", () => {
    const closed = analyticsCacheKey(
      "sales",
      resolveAnalyticsRange({ from: "2026-05-01", to: "2026-05-31" }),
      now,
    );
    const live = analyticsCacheKey(
      "sales",
      resolveAnalyticsRange({ from: "2026-06-01", to: "2026-06-15" }, now),
      now,
    );

    expect(closed.ttl).toBe(ANALYTICS_CLOSED_TTL_SECONDS);
    expect(live.ttl).toBe(ANALYTICS_LIVE_TTL_SECONDS);
    expect(live.key).toContain(":live:");
  });

  /**
   * Canlı pencerenin sonu "şimdi"dir. Anahtar TTL boyutunda kovalara
   * yuvarlanmasaydı her istek yeni bir anahtar üretir ve önbellek hiç tutmazdı.
   */
  it("canlı anahtarı TTL kovasına yuvarlar", () => {
    const range = resolveAnalyticsRange(
      { from: "2026-06-01", to: "2026-06-15" },
      now,
    );
    const first = analyticsCacheKey("sales", range, now).key;
    const soon = analyticsCacheKey(
      "sales",
      range,
      new Date(now.getTime() + 1000),
    ).key;
    const later = analyticsCacheKey(
      "sales",
      range,
      new Date(now.getTime() + (ANALYTICS_LIVE_TTL_SECONDS + 1) * 1000),
    ).key;

    expect(soon).toBe(first);
    expect(later).not.toBe(first);
  });
});
