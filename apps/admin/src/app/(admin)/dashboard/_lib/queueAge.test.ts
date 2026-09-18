import { describe, expect, it } from "vitest";
import { queueAge } from "./queueAge";

const NOW = new Date("2026-09-18T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("queueAge", () => {
  it("says nothing when nothing is waiting", () => {
    expect(queueAge(null, NOW)).toBeNull();
    expect(queueAge(undefined, NOW)).toBeNull();
  });

  it("reads days once the wait passes a day", () => {
    expect(queueAge(ago(3.5 * 24 * 60 * 60 * 1000), NOW)).toEqual({
      unitKey: "admin.dashboard.age.days",
      count: 3,
    });
  });

  it("reads hours below a day", () => {
    expect(queueAge(ago(5 * 60 * 60 * 1000), NOW)).toEqual({
      unitKey: "admin.dashboard.age.hours",
      count: 5,
    });
  });

  it("never reports a zero-minute wait — it would say nothing", () => {
    expect(queueAge(ago(2_000), NOW)).toEqual({
      unitKey: "admin.dashboard.age.minutes",
      count: 1,
    });
  });

  it("ignores a stamp from the future rather than printing a negative age", () => {
    expect(
      queueAge(new Date(NOW.getTime() + 60_000).toISOString(), NOW),
    ).toBeNull();
    expect(queueAge("not a date", NOW)).toBeNull();
  });
});
