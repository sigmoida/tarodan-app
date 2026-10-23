import { createHash } from "node:crypto";
import { EMAIL_PATTERN, URL_QUERY_PATTERN } from "./error-fingerprint";
import { extractIdentifiers, maskIdentifiers } from "./error-identifiers";

/**
 * How long an unchanged error stays reported: about once a day. A cron that
 * fails the same way every 30 minutes reaches Sentry ~once a day instead of
 * 48 times. Deliberately shorter than 24h: a DAILY alarm (ledger
 * reconciliation) runs a few seconds earlier or later each day, and with an
 * exact 24h window today's run could land just inside yesterday's window and
 * the alarm would reach the e-mail rule only every other day.
 *
 * Read by the Sentry throttle (`SentryReportThrottle`) and by the cron
 * tracker, which re-raises a failure that lasts once per window.
 */
export const SENTRY_REPEAT_WINDOW_SECONDS = 20 * 60 * 60;

/**
 * Repeat-report key for an error log line: "the same failure of the same
 * entity". Sentry receives one event per key per window
 * (`SentryReportThrottle`); the console still logs every occurrence.
 *
 * Why a second key next to the fingerprint: the fingerprint masks ids so one
 * KIND of failure is one Sentry issue, which is right for grouping but would
 * also silence invoice B while invoice A is throttled. This key keeps the
 * identifiers (see `error-identifiers.ts`) and drops only what changes
 * between runs of an unchanged failure: durations, counters, timestamps.
 *
 * - Same entity, same reason, new run -> same key (suppressed in the window).
 * - Another entity, another reason, another context or error class -> another
 *   key (reported at once). A cron summary that starts listing one more
 *   parcel is a new key, so a new failure is never hidden behind an old one.
 *
 * The key is a hash: it is stored in Redis and must not carry message text.
 */
export interface ErrorReportKeyInput {
  context: string;
  errorName?: string;
  message: string;
}

const DIGIT_RUN_PATTERN = /\d+/g;

/**
 * The message with identifiers masked and every number collapsed, so
 * "1 kayıt (12ms)" and "3 kayıt (40ms)" read the same. Identifiers are taken
 * out first: they are compared separately and must not lose their digits.
 */
export function errorMessageShape(message: string): string {
  return maskIdentifiers(message, "<id>")
    .replace(URL_QUERY_PATTERN, "$1?<query>")
    .replace(EMAIL_PATTERN, "<email>")
    .replace(DIGIT_RUN_PATTERN, "#")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildErrorReportKey(input: ErrorReportKeyInput): string {
  const parts = [
    input.context,
    input.errorName ?? "",
    errorMessageShape(input.message),
    ...extractIdentifiers(input.message),
  ];
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 32);
}

const REPORT_KEY = "__sentryReportKey";

interface ErrorWithReportKey extends Error {
  [REPORT_KEY]?: string;
}

/** Marks `error` as a throttled log-line report under `key`. */
export function attachReportKey(error: Error, key: string): void {
  (error as ErrorWithReportKey)[REPORT_KEY] = key;
}

/**
 * The key set by `attachReportKey`, removed from the error as it is read;
 * `undefined` means "always report".
 *
 * Read once because the key belongs to ONE log line, not to the error object:
 * a service may log the error it then throws, and the `SentryInterceptor`
 * captures that same object as an HTTP 5xx, which must never be throttled.
 * `SentryService` takes the key synchronously in the capture the log line
 * triggers, so the later capture finds none.
 */
export function takeReportKey(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const carrier = error as ErrorWithReportKey;
  const key = carrier[REPORT_KEY];
  delete carrier[REPORT_KEY];
  return key;
}
