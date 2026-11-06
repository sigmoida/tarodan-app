import { describe, expect, it } from "vitest";
import {
  endOfIstanbulDayIso,
  istanbulDateOf,
  istanbulDateTimeIso,
  istanbulDateTimeOf,
  startOfIstanbulDayIso,
} from "./istanbul-dates";

describe("ad dates — Istanbul calendar", () => {
  it("builds offset-aware ISO bounds for a day", () => {
    expect(startOfIstanbulDayIso("2026-07-01")).toBe(
      "2026-07-01T00:00:00.000+03:00",
    );
    expect(endOfIstanbulDayIso("2026-07-31")).toBe(
      "2026-07-31T23:59:59.999+03:00",
    );
  });

  it("maps the stored UTC instants back to the same calendar day", () => {
    expect(istanbulDateOf("2026-06-30T21:00:00.000Z")).toBe("2026-07-01");
    expect(istanbulDateOf("2026-07-31T20:59:59.999Z")).toBe("2026-07-31");
  });

  it("does not slice the UTC string (21:00Z is already the next Istanbul day)", () => {
    expect(istanbulDateOf("2026-07-31T21:00:00.000Z")).toBe("2026-08-01");
  });

  it("round-trips day -> iso -> day", () => {
    const iso = new Date(startOfIstanbulDayIso("2026-03-15")).toISOString();
    expect(istanbulDateOf(iso)).toBe("2026-03-15");
    const end = new Date(endOfIstanbulDayIso("2026-03-15")).toISOString();
    expect(istanbulDateOf(end)).toBe("2026-03-15");
  });

  it("returns empty for missing or invalid input", () => {
    expect(istanbulDateOf(null)).toBe("");
    expect(istanbulDateOf(undefined)).toBe("");
    expect(istanbulDateOf("not-a-date")).toBe("");
  });
});

describe("date-time picker values — Istanbul wall clock", () => {
  it("reads a stored instant as the Istanbul minute", () => {
    expect(istanbulDateTimeOf("2026-11-14T21:00:00.000Z")).toBe(
      "2026-11-15T00:00",
    );
    expect(istanbulDateTimeOf("2026-11-15T09:30:59.999Z")).toBe(
      "2026-11-15T12:30",
    );
  });

  it("writes a picker value with the Istanbul offset", () => {
    expect(istanbulDateTimeIso("2026-11-15T00:00")).toBe(
      "2026-11-15T00:00:00.000+03:00",
    );
    expect(
      new Date(istanbulDateTimeIso("2026-11-15T00:00")).toISOString(),
    ).toBe("2026-11-14T21:00:00.000Z");
  });

  it("round-trips picker value -> iso -> picker value", () => {
    const iso = istanbulDateTimeIso("2026-03-15T23:45");
    expect(istanbulDateTimeOf(new Date(iso).toISOString())).toBe(
      "2026-03-15T23:45",
    );
  });

  it("returns empty for missing or malformed input", () => {
    expect(istanbulDateTimeOf(null)).toBe("");
    expect(istanbulDateTimeOf("not-a-date")).toBe("");
    expect(istanbulDateTimeIso("")).toBe("");
    expect(istanbulDateTimeIso("2026-03-15")).toBe("");
  });
});
