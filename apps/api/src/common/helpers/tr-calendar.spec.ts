import {
  TR_TIME_ZONE,
  istanbulDayEnd,
  istanbulDayStart,
  istanbulDayStartOf,
  istanbulMonthRange,
  istanbulRangeEdge,
  istanbulWallClock,
  istanbulYesterdayWindow,
  trCalendarDate,
  trCalendarTime,
  trCalendarYear,
  trMonthStart,
} from "./tr-calendar";

/**
 * Veritabanındaki tarihler UTC anlarıdır; iş anlamında "gün" ve "yıl" ise
 * Türkiye takvimine göredir. `Date` üzerindeki yerel yöntemler SÜRECİN saat
 * dilimine bakar — sunucu UTC koştuğunda gece yarısından sonraki her an bir
 * önceki güne, 31 Aralık gecesi de bir önceki YILA düşer.
 */
describe("Türkiye takvimi", () => {
  it("Europe/Istanbul kullanır", () => {
    expect(TR_TIME_ZONE).toBe("Europe/Istanbul");
  });

  it("gece yarısından sonraki an Türkiye gününe düşer", () => {
    const at = new Date("2026-08-04T22:30:00.000Z"); // 5 Ağustos 01:30 İstanbul
    expect(trCalendarDate(at)).toBe("2026-08-05");
    expect(trCalendarTime(at)).toBe("01:30:00");
  });

  it("yıl sınırında Türkiye yılını verir", () => {
    // 1978 model yılı, yerel gece yarısı Ocak 1 olarak yazılır.
    expect(trCalendarYear(new Date("1977-12-31T22:00:00.000Z"))).toBe(1978);
    expect(trCalendarYear(new Date("2026-12-31T21:30:00.000Z"))).toBe(2027);
  });

  it("ay başı Türkiye gece yarısıdır, UTC değil", () => {
    // 31 Ağustos 22:30Z = 1 Eylül 01:30 İstanbul → Eylül ayı (UTC hâlâ Ağustos).
    expect(
      trMonthStart(new Date("2026-08-31T22:30:00.000Z")).toISOString(),
    ).toBe("2026-08-31T21:00:00.000Z");
    expect(
      trMonthStart(new Date("2026-09-15T12:00:00.000Z")).toISOString(),
    ).toBe("2026-08-31T21:00:00.000Z");
  });

  it("süreç saat dilimi ne olursa olsun aynı sonucu verir", () => {
    // Intl'e saat dilimi AÇIKÇA verildiği için `TZ` sonucu değiştirmez.
    const at = new Date("2026-08-04T22:30:00.000Z");
    const previous = process.env.TZ;
    try {
      for (const tz of ["UTC", "Europe/Istanbul", "America/New_York"]) {
        process.env.TZ = tz;
        expect(trCalendarDate(at)).toBe("2026-08-05");
        expect(trCalendarYear(at)).toBe(2026);
      }
    } finally {
      process.env.TZ = previous;
    }
  });

  it("sabit genişlikte biçim üretir", () => {
    const at = new Date("2026-01-02T00:00:00.000Z");
    expect(trCalendarDate(at)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(trCalendarTime(at)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("günün bitişi 23:59:59.999 İstanbul'dur", () => {
    expect(istanbulDayEnd("2026-07-20").toISOString()).toBe(
      "2026-07-20T20:59:59.999Z",
    );
  });

  it("bir anın düştüğü Türkiye gününün başlangıcını verir", () => {
    // 2026-07-20T22:30Z = 21 Temmuz 01:30 İstanbul → 21 Temmuz günü.
    const at = new Date("2026-07-20T22:30:00.000Z");
    expect(istanbulDayStartOf(at)).toEqual(istanbulDayStart("2026-07-21"));
  });

  it("ay aralığı Türkiye gece yarısından Türkiye gece yarısınadır", () => {
    const { gte, lt } = istanbulMonthRange(2026, 9);
    expect(gte.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });

  it("aralık aralığında yıl devrilir", () => {
    const { gte, lt } = istanbulMonthRange(2026, 12);
    expect(gte.toISOString()).toBe("2026-11-30T21:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });

  it("yalnız tarih olan filtre ucu Türkiye gününün başı/sonudur", () => {
    expect(istanbulRangeEdge("2026-10-12", "start")).toEqual(
      istanbulDayStart("2026-10-12"),
    );
    // Bitiş seçilen günün TAMAMINI kapsar (UTC gece yarısı değil).
    expect(istanbulRangeEdge("2026-10-12", "end").toISOString()).toBe(
      "2026-10-12T20:59:59.999Z",
    );
  });

  it("saat taşıyan filtre ucu olduğu gibi kullanılır", () => {
    expect(
      istanbulRangeEdge("2026-10-12T10:00:00.000Z", "end").toISOString(),
    ).toBe("2026-10-12T10:00:00.000Z");
  });

  it("duvar saati UTC alanlarında İstanbul saatini taşır", () => {
    // 21:30Z = ertesi gün 00:30 İstanbul.
    expect(
      istanbulWallClock(new Date("2026-08-04T21:30:15.250Z")).toISOString(),
    ).toBe("2026-08-05T00:30:15.250Z");
  });

  it("dünün tam gününü verir — sunucu UTC koşarken bile", () => {
    // Yine 21 Temmuz 01:30 İstanbul: "dün" 20 Temmuz'dur, tam gün.
    const at = new Date("2026-07-20T22:30:00.000Z");
    const window = istanbulYesterdayWindow(at);
    expect(window.gte).toEqual(istanbulDayStart("2026-07-20"));
    expect(window.lte).toEqual(istanbulDayEnd("2026-07-20"));
  });
});
