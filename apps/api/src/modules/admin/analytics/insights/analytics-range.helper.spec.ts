import { BadRequestException } from "@nestjs/common";
import { ANALYTICS_MAX_RANGE_DAYS } from "@tarodan/types";
import {
  TR_TIME_ZONE,
  trCalendarDate,
} from "../../../../common/helpers/tr-calendar";
import {
  bucketOf,
  bucketsBetween,
  resolveAnalyticsRange,
  toAnalyticsRange,
} from "./analytics-range.helper";

/** Türkiye takviminde bir günün başlangıcı (UTC+03:00, DST yok). */
const trMidnight = (day: string) => new Date(`${day}T00:00:00+03:00`);

describe("resolveAnalyticsRange", () => {
  const now = new Date("2026-06-15T09:30:00.000Z");

  it("Türkiye gününün sınırlarını kullanır, sürecin saat dilimini değil", () => {
    const range = resolveAnalyticsRange({ from: "2026-06-01", to: "2026-06-30" });

    expect(range.current.gte).toEqual(trMidnight("2026-06-01"));
    // Kapsayıcı son: Türkiye gününün son milisaniyesi.
    expect(range.current.lte).toEqual(
      new Date(trMidnight("2026-07-01").getTime() - 1),
    );
    expect(range.timeZone).toBe(TR_TIME_ZONE);
  });

  it("aralık verilmediğinde son 30 Türkiye gününe açılır", () => {
    const range = resolveAnalyticsRange(undefined, now);

    // 2026-06-15 dahil 30 gün → 2026-05-17.
    expect(range.current.gte).toEqual(trMidnight("2026-05-17"));
    expect(range.buckets).toHaveLength(30);
    expect(range.buckets[0]).toBe("2026-05-17");
    expect(range.buckets.at(-1)).toBe("2026-06-15");
  });

  it("karşılaştırma istenmedikçe önceki pencereyi ÖLÇMEZ", () => {
    expect(resolveAnalyticsRange({ from: "2026-06-01", to: "2026-06-07" }).previous)
      .toBeNull();
  });

  it("karşılaştırmada dashboard'un trend penceresiyle aynı aritmetiği kullanır", () => {
    const range = resolveAnalyticsRange({
      from: "2026-06-08",
      to: "2026-06-14",
      compare: true,
    });

    expect(range.previous).not.toBeNull();
    // Eşit uzunlukta ve seçili pencerenin hemen öncesinde biter.
    expect(range.previous!.lte.getTime()).toBe(range.current.gte.getTime() - 1);
    expect(range.previous!.lte.getTime() - range.previous!.gte.getTime()).toBe(
      range.current.lte.getTime() - range.current.gte.getTime(),
    );
  });

  describe("aralık kuralı", () => {
    it("tek uç verilmiş aralığı reddeder", () => {
      expect(() => resolveAnalyticsRange({ from: "2026-06-01" })).toThrow(
        BadRequestException,
      );
    });

    it("ters aralığı reddeder", () => {
      expect(() =>
        resolveAnalyticsRange({ from: "2026-06-10", to: "2026-06-01" }),
      ).toThrow(BadRequestException);
    });

    it("üst sınırı aşan aralığı reddeder", () => {
      // Gün adımları Türkiye takviminde sayılır: `toISOString()` ile
      // biçimlendirmek TR gece yarısını üç saat geri alır ve bir gün eksik
      // aralık üretir — o aralık sınırın ALTINDA kalır, test de yeşile döner.
      const start = trMidnight("2025-01-01");
      const tooLate = trCalendarDate(
        new Date(start.getTime() + ANALYTICS_MAX_RANGE_DAYS * 86_400_000),
      );
      expect(() =>
        resolveAnalyticsRange({ from: "2025-01-01", to: tooLate }),
      ).toThrow(BadRequestException);
    });

    it("tam üst sınırdaki aralığı kabul eder", () => {
      expect(() =>
        resolveAnalyticsRange({ from: "2025-01-01", to: "2026-01-01" }),
      ).not.toThrow();
    });
  });
});

describe("bucketOf", () => {
  /** Postgres `date_trunc('week', …)` pazartesiye yuvarlar. */
  it("haftayı pazartesiye yuvarlar", () => {
    // 2026-06-15 pazartesi; 2026-06-21 pazar aynı haftadadır.
    expect(bucketOf("2026-06-15", "week")).toBe("2026-06-15");
    expect(bucketOf("2026-06-21", "week")).toBe("2026-06-15");
    expect(bucketOf("2026-06-22", "week")).toBe("2026-06-22");
  });

  it("ayı ayın ilk gününe yuvarlar", () => {
    expect(bucketOf("2026-06-30", "month")).toBe("2026-06-01");
  });

  it("günü olduğu gibi bırakır", () => {
    expect(bucketOf("2026-06-30", "day")).toBe("2026-06-30");
  });
});

describe("bucketsBetween", () => {
  /**
   * Seri BOŞ kovaları da taşımak zorunda: eski ekran satırı olmayan günü
   * atlıyordu ve grafik iki uzak nokta arasına düz bir çizgi çekip "ölçüm yok"
   * ile "satış yok"u aynı şeymiş gibi gösteriyordu.
   */
  it("aralıktaki HER günü verir", () => {
    expect(bucketsBetween("2026-06-01", "2026-06-05", "day")).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
  });

  it("hafta kovalarını tekrarlamadan verir", () => {
    expect(bucketsBetween("2026-06-15", "2026-06-24", "week")).toEqual([
      "2026-06-15",
      "2026-06-22",
    ]);
  });

  it("ay kovalarını tekrarlamadan verir", () => {
    expect(bucketsBetween("2026-05-20", "2026-07-02", "month")).toEqual([
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
    ]);
  });

  it("tek günlük aralıkta tek kova verir", () => {
    expect(bucketsBetween("2026-06-01", "2026-06-01", "day")).toEqual([
      "2026-06-01",
    ]);
  });
});

describe("toAnalyticsRange", () => {
  it("ölçülmemiş karşılaştırmayı SIFIR değil YOK olarak bildirir", () => {
    const solo = toAnalyticsRange(
      resolveAnalyticsRange({ from: "2026-06-01", to: "2026-06-07" }),
    );

    expect(solo.compared).toBe(false);
    expect(solo.previousFrom).toBeNull();
    expect(solo.previousTo).toBeNull();
    expect(solo.timeZone).toBe(TR_TIME_ZONE);
  });

  it("karşılaştırılan pencereyi geri bildirir", () => {
    const compared = toAnalyticsRange(
      resolveAnalyticsRange({
        from: "2026-06-01",
        to: "2026-06-07",
        compare: true,
      }),
    );

    expect(compared.compared).toBe(true);
    expect(compared.previousFrom).not.toBeNull();
    expect(compared.previousTo).not.toBeNull();
  });
});
