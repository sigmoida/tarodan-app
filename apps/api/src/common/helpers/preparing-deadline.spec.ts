import {
  addDaysSkippingSundays,
  extendedPreparingDeadline,
  isPreparingDeadlinePassed,
  preparingDeadlineApproachingWhere,
  shouldExtendPreparingDeadline,
} from "./preparing-deadline";

describe("addDaysSkippingSundays", () => {
  // 2026-08-14 bir CUMA (getDay=5).
  const friday = new Date("2026-08-14T10:00:00.000Z");

  it("cuma + 3 gün = çarşamba DEĞİL salı olur (pazar sayılmaz)", () => {
    // Cmt(1) → Paz(atla) → Pzt(2) → Sal(3)
    const result = addDaysSkippingSundays(friday, 3);
    expect(result.getDay()).toBe(2); // Salı
    expect(result.getDate()).toBe(18);
  });

  it("perşembe + 3 gün pazartesiye düşer", () => {
    const thursday = new Date("2026-08-13T10:00:00.000Z");
    // Cum(1) → Cmt(2) → Paz(atla) → Pzt(3)
    const result = addDaysSkippingSundays(thursday, 3);
    expect(result.getDay()).toBe(1); // Pazartesi
    expect(result.getDate()).toBe(17);
  });

  it("pazar araya girmeyen aralıkta düz takvimle aynıdır", () => {
    const monday = new Date("2026-08-10T10:00:00.000Z");
    const result = addDaysSkippingSundays(monday, 3);
    expect(result.getDay()).toBe(4); // Perşembe
    expect(result.getDate()).toBe(13);
  });

  it("sonuç asla pazara denk gelmez", () => {
    for (let offset = 0; offset < 7; offset++) {
      const start = new Date("2026-08-10T10:00:00.000Z");
      start.setDate(start.getDate() + offset);
      for (let days = 1; days <= 5; days++) {
        expect(addDaysSkippingSundays(start, days).getDay()).not.toBe(0);
      }
    }
  });

  it("saat bileşenini korur ve girdiyi mutasyona uğratmaz", () => {
    const input = new Date("2026-08-14T10:30:00.000Z");
    const before = input.toISOString();
    const result = addDaysSkippingSundays(input, 3);
    expect(input.toISOString()).toBe(before);
    expect(result.getHours()).toBe(input.getHours());
  });
});

describe("preparingDeadlineApproachingWhere", () => {
  const NOW = new Date("2026-10-05T12:00:00.000Z");

  it("yalnız hazırlanan, son tarihi şimdiden sonra ve süre içinde olanlar", () => {
    const where = preparingDeadlineApproachingWhere(NOW, 24);
    expect(where).toEqual({
      status: "preparing",
      preparingDeadline: {
        gt: NOW,
        lte: new Date("2026-10-06T12:00:00.000Z"),
      },
    });
  });

  it("pencere uyarı süresiyle birlikte hareket eder", () => {
    const where = preparingDeadlineApproachingWhere(NOW, 6);
    const window = where.preparingDeadline as { gt: Date; lte: Date };
    expect(window.lte.getTime() - NOW.getTime()).toBe(6 * 60 * 60 * 1000);
  });
});

describe("isPreparingDeadlinePassed", () => {
  const NOW = new Date("2026-10-05T12:00:00.000Z");

  it("süre dolumu sorgusuyla aynı sınır: yalnız kesin geçmiş", () => {
    expect(isPreparingDeadlinePassed(new Date(NOW.getTime() - 1), NOW)).toBe(
      true,
    );
    expect(isPreparingDeadlinePassed(NOW, NOW)).toBe(false);
    expect(isPreparingDeadlinePassed(new Date(NOW.getTime() + 1), NOW)).toBe(
      false,
    );
  });

  it("son tarihi olmayan sipariş süresi dolmuş sayılmaz", () => {
    expect(isPreparingDeadlinePassed(null, NOW)).toBe(false);
  });
});

describe("shouldExtendPreparingDeadline", () => {
  it("varsayılan eylemde (iptal + iade) asla uzatmaz", () => {
    expect(
      shouldExtendPreparingDeadline("cancel_and_refund", {
        preparingExtendedAt: null,
      }),
    ).toBe(false);
  });

  it("extend_once seçiliyse ilk dolumda uzatır", () => {
    expect(
      shouldExtendPreparingDeadline("extend_once", {
        preparingExtendedAt: null,
      }),
    ).toBe(true);
  });

  it("bir kez uzatılmış siparişi ikinci kez uzatmaz", () => {
    expect(
      shouldExtendPreparingDeadline("extend_once", {
        preparingExtendedAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });
});

describe("extendedPreparingDeadline", () => {
  it("uzatma anından tam bir hazırlık süresi, pazar sayılmadan", () => {
    // 2026-08-14 cuma → 3 iş günü (pazar hariç) = salı.
    const friday = new Date("2026-08-14T10:00:00.000Z");
    expect(extendedPreparingDeadline(friday, 3)).toEqual(
      addDaysSkippingSundays(friday, 3),
    );
    expect(extendedPreparingDeadline(friday, 3).getDay()).toBe(2);
  });
});
