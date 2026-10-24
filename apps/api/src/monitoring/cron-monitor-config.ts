import type * as Sentry from "@sentry/node";
import type { CronMonitorConfig } from "../workers/cron-catalog";

/** The monitor config `Sentry.captureCheckIn` upserts (not exported by @sentry/node). */
export type SentryMonitorConfig = NonNullable<
  Parameters<typeof Sentry.captureCheckIn>[1]
>;

/**
 * Bull cron expression -> the 5-field crontab Sentry accepts, or null.
 *
 * Bull also takes a 6-field form with a leading seconds field. "0 <5 fields>"
 * fires at second 0 of the same minutes, so dropping the seconds keeps the
 * schedule. Any other seconds value (every 10 seconds, ...) has no crontab
 * equivalent.
 */
export function toSentryCrontab(cron: string): string | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length === 5) return fields.join(" ");
  if (fields.length === 6 && fields[0] === "0")
    return fields.slice(1).join(" ");
  return null;
}

/**
 * The Sentry monitor config for one scheduled run: the schedule and time zone
 * come from the Bull repeatable itself (`job.opts.repeat`), so the monitor
 * cannot drift from what actually fires; the thresholds come from the cron
 * catalog. Null when the schedule has no crontab form.
 */
export function buildSentryMonitorConfig(
  schedule: string,
  timezone: string | undefined,
  monitor: CronMonitorConfig,
): SentryMonitorConfig | null {
  const crontab = toSentryCrontab(schedule);
  if (!crontab) return null;
  return {
    schedule: { type: "crontab", value: crontab },
    ...(timezone ? { timezone } : {}),
    checkinMargin: monitor.checkinMarginMinutes,
    maxRuntime: monitor.maxRuntimeMinutes,
    failureIssueThreshold: monitor.failureIssueThreshold,
    recoveryThreshold: monitor.recoveryThreshold,
  };
}
