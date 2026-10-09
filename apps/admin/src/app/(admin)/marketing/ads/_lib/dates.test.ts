import { describe, expect, it } from "vitest";
import {
  endOfIstanbulDayIso,
  istanbulDateOf,
  startOfIstanbulDayIso,
} from "./dates";

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
