import { BadRequestException } from "@nestjs/common";
import {
  previousWindow,
  resolveDashboardRange,
  resolveThisMonthWindow,
  resolveYesterdayWindow,
} from "./dashboard-period.helper";
import {
  istanbulDayEnd,
  istanbulDayStart,
} from "../../../common/helpers/tr-calendar";

describe("resolveDashboardRange", () => {
  // 2026-07-20T22:30Z is already 21 Jul, 01:30 in Istanbul (UTC+3) — every
  // window below must land on the ISTANBUL day, not the UTC one. A server
  // running UTC (production) would otherwise start "today" three hours late.
  const now = new Date("2026-07-20T22:30:00.000Z");

  it("defaults to today's window, Istanbul midnight to now", () => {
    const range = resolveDashboardRange(undefined, now);

    expect(range.type).toBe("daily");
    expect(range.current.gte).toEqual(istanbulDayStart("2026-07-21"));
    expect(range.current.lte).toEqual(now);
  });

  it("measures the month to date for the monthly period, Istanbul month start", () => {
    const range = resolveDashboardRange({ period: "monthly" }, now);

    expect(range.current.gte).toEqual(istanbulDayStart("2026-07-01"));
    expect(range.current.lte).toEqual(now);
  });

  it("still opens on today at the Istanbul/UTC day boundary itself", () => {
    // 21:00Z is still 00:00 Istanbul the SAME calendar day, not the next one.
    const atBoundary = new Date("2026-07-20T21:00:00.000Z");
    const range = resolveDashboardRange(undefined, atBoundary);

    expect(range.current.gte).toEqual(istanbulDayStart("2026-07-21"));

    const justBefore = new Date("2026-07-20T20:59:59.999Z");
    const beforeRange = resolveDashboardRange(undefined, justBefore);
    expect(beforeRange.current.gte).toEqual(istanbulDayStart("2026-07-20"));
  });

  it("covers both custom days in full, Istanbul bounds", () => {
    const range = resolveDashboardRange(
      { period: "custom", from: "2026-06-01", to: "2026-06-03" },
      now,
    );

    expect(range.type).toBe("custom");
    expect(range.current.gte).toEqual(istanbulDayStart("2026-06-01"));
    expect(range.current.lte).toEqual(istanbulDayEnd("2026-06-03"));
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

    expect(range.current.gte).toEqual(istanbulDayStart("2026-07-21"));
  });
});

describe("resolveYesterdayWindow", () => {
  it("is the full Istanbul calendar day before today, not an equal-length window", () => {
    // 01:30 Istanbul on the 21st → "yesterday" is the WHOLE 20th, not the
    // last ~25.5 hours.
    const now = new Date("2026-07-20T22:30:00.000Z");
    const window = resolveYesterdayWindow(now);

    expect(window.gte).toEqual(istanbulDayStart("2026-07-20"));
    expect(window.lte).toEqual(istanbulDayEnd("2026-07-20"));
  });

  it("never moves with the time of day", () => {
    const earlyMorning = resolveYesterdayWindow(
      new Date("2026-07-20T21:00:01.000Z"), // 00:00:01 Istanbul, 21 Jul
    );
    const lateNight = resolveYesterdayWindow(
      new Date("2026-07-21T20:59:59.000Z"), // 23:59:59 Istanbul, 21 Jul
    );

    expect(earlyMorning).toEqual(lateNight);
  });
});

describe("resolveThisMonthWindow", () => {
  it("runs from the Istanbul month start to now", () => {
    const now = new Date("2026-07-20T22:30:00.000Z"); // 21 Jul Istanbul
    const window = resolveThisMonthWindow(now);

    expect(window.gte).toEqual(istanbulDayStart("2026-07-01"));
    expect(window.lte).toEqual(now);
  });

  it("rolls to the new month right at the Istanbul boundary", () => {
    // 31 Aug 22:30Z = 1 Sep 01:30 Istanbul — already September.
    const now = new Date("2026-08-31T22:30:00.000Z");
    const window = resolveThisMonthWindow(now);

    expect(window.gte).toEqual(istanbulDayStart("2026-09-01"));
  });
});

describe("previousWindow", () => {
  it("returns the window of equal length ending right before the given one", () => {
    const current = {
      gte: istanbulDayStart("2026-07-20"),
      lte: new Date("2026-07-20T22:30:00.000Z"),
    };

    const previous = previousWindow(current);

    const length = current.lte.getTime() - current.gte.getTime();
    expect(previous.lte.getTime()).toBe(current.gte.getTime() - 1);
    expect(previous.lte.getTime() - previous.gte.getTime()).toBe(length);
  });
});
