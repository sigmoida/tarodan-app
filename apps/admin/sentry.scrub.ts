/**
 * PII scrubbing shared by client/server/edge Sentry configs. The previous
 * `beforeSend` only redacted `password`/`token` inside `event.request.data`
 * — it missed everything else an event can carry a raw value in (extra
 * context, breadcrumb data attached by fetch/XHR instrumentation, request
 * headers/cookies) and every other sensitive field this app handles (IBAN,
 * TC Kimlik No, card data, auth headers).
 */

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|apikey|authorization|cookie|iban|kimlik|identitynumber|nationalid|taxid|cardnumber|cvv/i;

function redact(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Mutates and returns a Sentry event with sensitive fields redacted from
 * every place a value can end up: request body/headers/cookies, extra
 * context, tags/contexts, and breadcrumb data.
 */
export function scrubEvent<
  T extends {
    request?: {
      data?: unknown;
      headers?: Record<string, string>;
      cookies?: unknown;
    };
    extra?: Record<string, unknown>;
    contexts?: Record<string, unknown>;
    breadcrumbs?: Array<{ data?: Record<string, unknown> }> | null;
  },
>(event: T): T {
  if (event.request?.data !== undefined) {
    event.request.data = redact(event.request.data);
  }
  if (event.request?.headers) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(event.request.headers)) {
      headers[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : value;
    }
    event.request.headers = headers;
  }
  if (event.request?.cookies !== undefined) {
    event.request.cookies = "[REDACTED]";
  }
  if (event.extra) {
    event.extra = redact(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = redact(event.contexts) as Record<string, unknown>;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) =>
      b.data ? { ...b, data: redact(b.data) as Record<string, unknown> } : b,
    );
  }
  return event;
}
