import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime, fmtNumber, fmtTime, fmtTry } from "./format";

describe("fmtTry", () => {
  it("formats a number as TRY with two decimals", () => {
    expect(fmtTry(1234.5)).toBe("₺1.234,50");
  });

  it("accepts a numeric string", () => {
    expect(fmtTry("99")).toBe("₺99,00");
  });

  it("returns undefined for null/undefined/empty string", () => {
    expect(fmtTry(null)).toBeUndefined();
    expect(fmtTry(undefined)).toBeUndefined();
    expect(fmtTry("")).toBeUndefined();
  });

  it("returns undefined for a non-numeric string", () => {
    expect(fmtTry("not-a-number")).toBeUndefined();
  });
});

describe("fmtNumber", () => {
  it("formats a plain number with tr-TR grouping", () => {
    expect(fmtNumber(1234)).toBe("1.234");
  });

  it("returns undefined for null/undefined/empty string", () => {
    expect(fmtNumber(null)).toBeUndefined();
    expect(fmtNumber(undefined)).toBeUndefined();
    expect(fmtNumber("")).toBeUndefined();
  });

  it("returns undefined for a non-numeric string", () => {
    expect(fmtNumber("nope")).toBeUndefined();
  });
});

// Noon UTC — stays on the same calendar day across any realistic local
// timezone offset, so these assertions don't flake based on where they run.
const NOON_UTC = "2026-07-03T12:00:00Z";

describe("fmtDate", () => {
  it("formats a date as dd.MM.yyyy", () => {
    expect(fmtDate(NOON_UTC)).toBe("03.07.2026");
  });

  it("accepts a Date instance", () => {
    expect(fmtDate(new Date(NOON_UTC))).toBe("03.07.2026");
  });

  it("returns undefined for falsy input", () => {
    expect(fmtDate(null)).toBeUndefined();
    expect(fmtDate(undefined)).toBeUndefined();
    expect(fmtDate("")).toBeUndefined();
  });

  it("returns undefined for an invalid date string", () => {
    expect(fmtDate("not-a-date")).toBeUndefined();
  });
});

describe("fmtDateTime", () => {
  it("formats a date with hours and minutes", () => {
    expect(fmtDateTime(NOON_UTC)).toMatch(/^03\.07\.2026 \d{2}:\d{2}$/);
  });

  it("returns undefined for falsy or invalid input", () => {
    expect(fmtDateTime(null)).toBeUndefined();
    expect(fmtDateTime("garbage")).toBeUndefined();
  });
});

describe("fmtTime", () => {
  it("formats only the clock", () => {
    expect(fmtTime(NOON_UTC)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("agrees with the time half of fmtDateTime", () => {
    expect(fmtDateTime(NOON_UTC)).toBe(`03.07.2026 ${fmtTime(NOON_UTC)}`);
  });

  it("returns undefined for falsy or invalid input", () => {
    expect(fmtTime(null)).toBeUndefined();
    expect(fmtTime(undefined)).toBeUndefined();
    expect(fmtTime("garbage")).toBeUndefined();
  });
});
