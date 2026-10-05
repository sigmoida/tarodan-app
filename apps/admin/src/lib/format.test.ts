import { describe, expect, it } from "vitest";
import {
  fmtDate,
  fmtDateTime,
  fmtFileSize,
  fmtPercent,
  fmtTime,
} from "./format";

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

describe("fmtPercent", () => {
  it("puts the sign first with no decimals by default", () => {
    expect(fmtPercent(12)).toBe("%12");
    expect(fmtPercent("12")).toBe("%12");
    expect(fmtPercent(0)).toBe("%0");
  });

  it("uses the tr-TR decimal comma for fraction digits", () => {
    expect(fmtPercent(12.5, 1)).toBe("%12,5");
    expect(fmtPercent(12, 1)).toBe("%12,0");
  });

  it("returns undefined for missing or non-numeric values", () => {
    expect(fmtPercent(null)).toBeUndefined();
    expect(fmtPercent(undefined)).toBeUndefined();
    expect(fmtPercent("")).toBeUndefined();
    expect(fmtPercent("abc")).toBeUndefined();
  });
});

describe("fmtFileSize", () => {
  it("renders bytes without decimals", () => {
    expect(fmtFileSize(0)).toBe("0 B");
    expect(fmtFileSize(512)).toBe("512 B");
  });

  it("scales by 1024 with one decimal and a decimal comma", () => {
    expect(fmtFileSize(1024)).toBe("1 KB");
    expect(fmtFileSize(1.2 * 1024 * 1024)).toBe("1,2 MB");
    expect(fmtFileSize(3 * 1024 ** 3)).toBe("3 GB");
  });

  it("returns undefined for missing or invalid sizes", () => {
    expect(fmtFileSize(null)).toBeUndefined();
    expect(fmtFileSize(undefined)).toBeUndefined();
    expect(fmtFileSize(-1)).toBeUndefined();
    expect(fmtFileSize(Number.NaN)).toBeUndefined();
  });
});
