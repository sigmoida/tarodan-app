import {
  TR_TIME_ZONE,
  trCalendarDate,
  trCalendarTime,
  trCalendarYear,
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
});
