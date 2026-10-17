import {
  REDACTED,
  isSensitiveKey,
  redactSensitive,
  redactString,
  redactUrlQuery,
} from "./redact";

/**
 * The Sentry `beforeSend` / `beforeSendTransaction` gates shared by web and
 * admin (client, server and edge). This package imports no `@sentry/*`, so the
 * event is typed structurally: only the fields that can carry a raw value.
 *
 * Where values leak from, and how each is closed:
 *  - `request`: the Node SDK attaches headers, cookies, the query string and
 *    the body of the failing request. The session cookies (`web_at`, `web_rt`,
 *    `admin_at`, `admin_rt`) are bearer tokens, so cookies are dropped whole
 *    and sensitive headers are masked.
 *  - `user`: only the id survives ("ids only"); e-mail, username and IP go.
 *  - `extra`, `contexts`, `tags`, breadcrumbs, exception and log messages:
 *    redacted by key and by value shape (see `redact.ts`).
 *  - transactions: span descriptions and data carry full URLs (fetch spans),
 *    so they are redacted like any other value; trace and span ids are not.
 */

interface ScrubbableRequest {
  url?: string;
  data?: unknown;
  query_string?: unknown;
  headers?: Record<string, string>;
  cookies?: unknown;
}

interface ScrubbableBreadcrumb {
  message?: string;
  data?: Record<string, unknown>;
}

interface ScrubbableSpan {
  description?: string;
  data?: Record<string, unknown>;
}

export interface ScrubbableEvent {
  message?: string;
  transaction?: string;
  request?: ScrubbableRequest;
  user?: { id?: string | number };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  breadcrumbs?: ScrubbableBreadcrumb[];
  exception?: { values?: Array<{ value?: string }> };
  spans?: ScrubbableSpan[];
}

function redactRecord<T>(value: T): T {
  return redactSensitive(value) as T;
}

/** A body may arrive as a JSON string: redact its fields, not just its text. */
function redactBody(data: unknown): unknown {
  if (typeof data !== "string") return redactSensitive(data);
  try {
    return JSON.stringify(redactSensitive(JSON.parse(data)));
  } catch {
    return redactString(data);
  }
}

function scrubRequest(request: ScrubbableRequest): ScrubbableRequest {
  const out: ScrubbableRequest = { ...request };
  if (typeof out.url === "string") out.url = redactUrlQuery(out.url);
  if (out.data !== undefined) out.data = redactBody(out.data);
  if (out.query_string !== undefined) {
    out.query_string =
      typeof out.query_string === "string"
        ? redactUrlQuery(`?${out.query_string}`).slice(1)
        : redactSensitive(out.query_string);
  }
  if (out.headers) {
    out.headers = Object.fromEntries(
      Object.entries(out.headers).map(([key, value]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactString(String(value)),
      ]),
    );
  }
  if (out.cookies !== undefined) out.cookies = REDACTED;
  return out;
}

function scrubBreadcrumb(
  breadcrumb: ScrubbableBreadcrumb,
): ScrubbableBreadcrumb {
  return {
    ...breadcrumb,
    ...(typeof breadcrumb.message === "string"
      ? { message: redactString(breadcrumb.message) }
      : {}),
    ...(breadcrumb.data ? { data: redactRecord(breadcrumb.data) } : {}),
  };
}

/**
 * The trace context links an event to its trace. Its ids are random hex, and
 * a long digit run in one can pass the Luhn check of the card pass, so the
 * ids stay as they are; only the active span's `data` (URLs) is redacted.
 */
function scrubContexts(
  contexts: Record<string, unknown>,
): Record<string, unknown> {
  const { trace, ...rest } = contexts;
  const out = redactRecord(rest);
  if (trace && typeof trace === "object") {
    const { data } = trace as { data?: Record<string, unknown> };
    out.trace = data ? { ...trace, data: redactRecord(data) } : trace;
  }
  return out;
}

/**
 * `beforeSend` for every web/admin runtime. Returns a scrubbed copy of the
 * top-level fields it touches; everything else is passed through untouched
 * (stack frames, release, environment, sdk metadata).
 */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  // A mutable structural view; the caller gets its own event type back.
  const out: ScrubbableEvent = { ...event };
  if (typeof out.message === "string") out.message = redactString(out.message);
  if (out.request) out.request = scrubRequest(out.request);
  if (out.user) {
    out.user = out.user.id === undefined ? {} : { id: out.user.id };
  }
  if (out.extra) out.extra = redactRecord(out.extra);
  if (out.contexts) out.contexts = scrubContexts(out.contexts);
  if (out.tags) out.tags = redactRecord(out.tags);
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb);
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((value) =>
        typeof value.value === "string"
          ? { ...value, value: redactString(value.value) }
          : value,
      ),
    };
  }
  return out as T;
}

/**
 * `beforeSendTransaction`: the event gate plus the name and every span's
 * description and data (fetch spans carry full URLs). Span and trace ids are
 * top-level span fields and are left alone.
 */
export function scrubSentryTransaction<T extends ScrubbableEvent>(event: T): T {
  const out: ScrubbableEvent = scrubSentryEvent(event);
  if (typeof out.transaction === "string") {
    out.transaction = redactString(out.transaction);
  }
  if (out.spans) {
    out.spans = out.spans.map((span) => ({
      ...span,
      ...(typeof span.description === "string"
        ? { description: redactString(span.description) }
        : {}),
      ...(span.data ? { data: redactRecord(span.data) } : {}),
    }));
  }
  return out as T;
}
