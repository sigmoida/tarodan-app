import { BadRequestException } from "@nestjs/common";
import { resolveDashboardRange } from "./dashboard-period.helper";

describe("resolveDashboardRange", () => {
  const now = new Date(2026, 6, 20, 15, 30, 0); // 20 Jul 2026, 15:30 local

  it("defaults to today's window", () => {
    const range = resolveDashboardRange(undefined, now);

    expect(range.type).toBe("daily");
    expect(range.current.gte).toEqual(new Date(2026, 6, 20));
    expect(range.current.lte).toEqual(now);
  });

  it("measures the month to date for the monthly period", () => {
    const range = resolveDashboardRange({ period: "monthly" }, now);

    expect(range.current.gte).toEqual(new Date(2026, 6, 1));
    expect(range.current.lte).toEqual(now);
  });

  it("compares against the preceding window of the same length", () => {
    const range = resolveDashboardRange({ period: "daily" }, now);

    const length = range.current.lte.getTime() - range.current.gte.getTime();
    expect(range.previous.lte.getTime()).toBe(range.current.gte.getTime() - 1);
    expect(range.previous.lte.getTime() - range.previous.gte.getTime()).toBe(
      length,
    );
  });

  it("covers both custom days in full", () => {
    const range = resolveDashboardRange(
      { period: "custom", from: "2026-06-01", to: "2026-06-03" },
      now,
    );

    expect(range.type).toBe("custom");
    expect(range.current.gte).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(range.current.lte).toEqual(new Date(2026, 5, 3, 23, 59, 59, 999));
  });

  it("rejects a custom range that is missing an end", () => {
    expect(() =>
      resolveDashboardRange({ period: "custom", from: "2026-06-01" }, now),
    ).toThrow(BadRequestException);
  });

  it("rejects a reversed custom range", () => {
    expect(() =>
      resolveDashboardRange(
        { period: "custom", from: "2026-06-05", to: "2026-06-01" },
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it("ignores from/to outside the custom period", () => {
    const range = resolveDashboardRange(
      { period: "daily", from: "2026-06-05", to: "2026-06-01" },
      now,
    );

    expect(range.current.gte).toEqual(new Date(2026, 6, 20));
  });
});
