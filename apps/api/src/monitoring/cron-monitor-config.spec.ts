import {
  buildSentryMonitorConfig,
  toSentryCrontab,
} from "./cron-monitor-config";

/**
 * Sentry cron monitors take a 5-field crontab; Bull also runs 6-field
 * expressions with a leading seconds field. The monitor must expect exactly
 * the slots Bull fires, or it raises "missed" for runs that happened.
 */
describe("toSentryCrontab", () => {
  it.each([
    ["*/15 * * * *", "*/15 * * * *"],
    ["  30 2  * * * ", "30 2 * * *"],
    ["0 */10 * * * *", "*/10 * * * *"],
    ["0 0 3 * * 1", "0 3 * * 1"],
  ])("maps %p to %p", (cron, crontab) => {
    expect(toSentryCrontab(cron)).toBe(crontab);
  });

  it.each([["*/10 * * * * *"], ["30 */5 * * * *"], ["* * * *"], [""]])(
    "has no crontab form for %p",
    (cron) => {
      expect(toSentryCrontab(cron)).toBeNull();
    },
  );
});

describe("buildSentryMonitorConfig", () => {
  const monitor = {
    checkinMarginMinutes: 10,
    maxRuntimeMinutes: 30,
    failureIssueThreshold: 2,
    recoveryThreshold: 1,
  };

  it("takes the schedule and time zone from the repeatable and the thresholds from the catalog", () => {
    expect(
      buildSentryMonitorConfig("0 */15 * * * *", "Europe/Istanbul", monitor),
    ).toEqual({
      schedule: { type: "crontab", value: "*/15 * * * *" },
      timezone: "Europe/Istanbul",
      checkinMargin: 10,
      maxRuntime: 30,
      failureIssueThreshold: 2,
      recoveryThreshold: 1,
    });
  });

  it("leaves the time zone out when the repeatable has none", () => {
    expect(
      buildSentryMonitorConfig("*/15 * * * *", undefined, monitor),
    ).not.toHaveProperty("timezone");
  });

  it("is null for a schedule with no crontab form", () => {
    expect(
      buildSentryMonitorConfig("*/10 * * * * *", "Europe/Istanbul", monitor),
    ).toBeNull();
  });
});
