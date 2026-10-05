import { earlyReleaseDays, isReleasedEarly } from "@tarodan/types";

const DAY = 86_400_000;
const PLANNED = new Date("2026-10-12T09:00:00.000Z");
const at = (offsetMs: number) => new Date(PLANNED.getTime() + offsetMs);

describe("earlyReleaseDays", () => {
  it("is null when released at exactly the planned moment", () => {
    expect(earlyReleaseDays(PLANNED, PLANNED)).toBeNull();
  });

  it("counts a release a few hours before the plan as 1 day early", () => {
    expect(earlyReleaseDays(PLANNED, at(-3 * 60 * 60 * 1000))).toBe(1);
  });

  it("counts a release one millisecond early as 1 day early", () => {
    expect(earlyReleaseDays(PLANNED, at(-1))).toBe(1);
  });

  it("returns exactly N for N whole days early", () => {
    expect(earlyReleaseDays(PLANNED, at(-5 * DAY))).toBe(5);
  });

  it("rounds a partial day up (N days and a bit => N + 1)", () => {
    expect(earlyReleaseDays(PLANNED, at(-5 * DAY - 60_000))).toBe(6);
  });

  it("is null for a late release", () => {
    expect(earlyReleaseDays(PLANNED, at(2 * DAY))).toBeNull();
  });

  it("is null when either date is missing or invalid", () => {
    expect(earlyReleaseDays(null, PLANNED)).toBeNull();
    expect(earlyReleaseDays(PLANNED, null)).toBeNull();
    expect(earlyReleaseDays(undefined, undefined)).toBeNull();
    expect(earlyReleaseDays("not-a-date", PLANNED)).toBeNull();
  });

  it("accepts ISO strings as returned by the API", () => {
    expect(
      earlyReleaseDays("2026-10-12T09:00:00.000Z", "2026-10-07T09:00:00.000Z"),
    ).toBe(5);
  });
});

describe("isReleasedEarly", () => {
  it("agrees with earlyReleaseDays (>= 1 day <=> strictly before the plan)", () => {
    expect(isReleasedEarly(PLANNED, at(-1))).toBe(true);
    expect(isReleasedEarly(PLANNED, PLANNED)).toBe(false);
    expect(isReleasedEarly(PLANNED, at(DAY))).toBe(false);
    expect(isReleasedEarly(null, PLANNED)).toBe(false);
  });
});
