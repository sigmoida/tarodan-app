import type * as Sentry from "@sentry/node";
import type { CronMonitorConfig } from "../workers/cron-catalog";

/** The monitor config `Sentry.captureCheckIn` upserts (not exported by @sentry/node). */
export type SentryMonitorConfig = NonNullable<
  Parameters<typeof Sentry.captureCheckIn>[1]
>;

/** A plain crontab field: numbers, `*`, lists, ranges and steps. */
const PLAIN_FIELD = /^[\d*,/-]+$/;

/**
 * Bull cron expression -> the 5-field crontab Sentry accepts, or undefined.
 *
 * Bull also takes a 6-field form with a leading seconds field. "0 <5 fields>"
 * fires at second 0 of the same minutes, so dropping the seconds keeps the
 * schedule. Any other seconds value (every 10 seconds, ...) has no crontab
 * equivalent. Fields beyond plain crontab syntax (cron-parser's `L`, `W`,
 * `#`, `?`, names, `@daily`) are refused too: Sentry could reject the config
 * and drop every check-in silently.
 */
export function toSentryCrontab(cron: string): string | undefined {
  const fields = cron.trim().split(/\s+/);
  const minuteFields =
    fields.length === 6 && fields[0] === "0" ? fields.slice(1) : fields;
  if (minuteFields.length !== 5) return undefined;
  if (!minuteFields.every((field) => PLAIN_FIELD.test(field))) return undefined;
  return minuteFields.join(" ");
}

/**
 * The Sentry monitor config for one scheduled run: the schedule and time zone
 * come from the Bull repeatable itself (`job.opts.repeat`), so the monitor
 * cannot drift from what actually fires; the thresholds come from the cron
 * catalog. Undefined when the schedule has no crontab form.
 */
export function buildSentryMonitorConfig(
  schedule: string,
  timezone: string | undefined,
  monitor: CronMonitorConfig,
): SentryMonitorConfig | undefined {
  const crontab = toSentryCrontab(schedule);
  if (!crontab) return undefined;
  return {
    schedule: { type: "crontab", value: crontab },
    ...(timezone ? { timezone } : {}),
    checkinMargin: monitor.checkinMarginMinutes,
    maxRuntime: monitor.maxRuntimeMinutes,
    failureIssueThreshold: monitor.failureIssueThreshold,
    recoveryThreshold: monitor.recoveryThreshold,
  };
}
