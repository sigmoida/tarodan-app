import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime, fmtTime } from "./format";

/**
 * Admin tarihleri İstanbul takvimindedir. PSP gün anahtarları UTC gece yarısı
 * olarak saklanır; tarayıcı saat dilimine göre biçimlenirse batıda bir gün
 * geri kayar. Biçimleyici `timeZone` verdiği için süreç/tarayıcı TZ'sinden
 * bağımsızdır.
 */
describe("format — Europe/Istanbul", () => {
  it("renders a UTC-midnight day key as that day", () => {
    expect(fmtDate("2026-07-31T00:00:00.000Z")).toBe("31.07.2026");
  });

  it("renders late-evening UTC instants on the next Istanbul day", () => {
    expect(fmtDate("2026-07-31T22:00:00.000Z")).toBe("01.08.2026");
    expect(fmtDateTime("2026-07-31T22:00:00.000Z")).toBe("01.08.2026 01:00");
    expect(fmtTime("2026-07-31T22:00:00.000Z")).toBe("01:00");
  });

  it("is independent of the process timezone", () => {
    const previous = process.env.TZ;
    try {
      for (const tz of ["UTC", "America/New_York", "Europe/Istanbul"]) {
        process.env.TZ = tz;
        expect(fmtDate("2026-07-31T22:00:00.000Z")).toBe("01.08.2026");
      }
    } finally {
      process.env.TZ = previous;
    }
  });
});
