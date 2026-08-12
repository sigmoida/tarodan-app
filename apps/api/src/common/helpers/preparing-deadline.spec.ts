import { addDaysSkippingSundays } from "./preparing-deadline";

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
