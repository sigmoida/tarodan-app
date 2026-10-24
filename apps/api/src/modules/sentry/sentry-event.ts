import type { Breadcrumb, Event, NodeOptions } from "@sentry/node";
import { sentrySampling } from "@tarodan/logger";
import { getRequestId } from "../../common/context/request-context";
import {
  redactRequestBody,
  redactSensitive,
  redactUrlQuery,
} from "../../common/security/redact-sensitive";

/**
 * The one gate every event passes on its way to Sentry (Sentry.init ->
 * beforeSend).
 *
 * The correlation id is added as a TAG, not `extra`: extra fields cannot be
 * searched, and the main use is typing the code a user gave in a support
 * request into the Sentry search bar as `requestId:...`.
 */
export function applySentryEventPolicy<T extends Event>(event: T): T | null {
  // Health checks run every minute; they would flood the issue list.
  if (event.request?.url?.includes("/health")) return null;

  const requestId = getRequestId();
  if (requestId) {
    event.tags = { ...event.tags, requestId };
  }

  // The SDK stores the request body as a JSON string, out of reach of the
  // key-based pass (a failed login would carry its password). It is redacted
  // first, on the raw text: the generic pass below could break the JSON.
  if (event.request?.data !== undefined) {
    event.request.data = redactRequestBody(event.request.data);
  }
  return redactSensitive(event) as T;
}

/**
 * The one gate every Sentry breadcrumb passes (Sentry.init ->
 * beforeBreadcrumb); the API and worker processes must use the SAME function.
 *
 * Why a separate gate: Sentry's default fetch/undici integration records every
 * outbound call as an `http` breadcrumb with its URL. The Sürat tracking
 * contract carries its credentials (`CariKodu`/`Sifre`) in the query string,
 * so in production the password showed up in Sentry events as plain text.
 * `redactSensitive` looks at key names and does not parse URLs, so the `url`
 * and `http.query` fields also go through `redactUrlQuery`.
 */
export function applySentryBreadcrumbPolicy<T extends Breadcrumb>(
  breadcrumb: T,
): T | null {
  const url = breadcrumb.data?.url;
  // Health checks run every minute; they would flood the breadcrumb list.
  if (
    breadcrumb.category === "http" &&
    typeof url === "string" &&
    url.includes("/health")
  ) {
    return null;
  }

  const redacted = redactSensitive(breadcrumb) as T;
  if (redacted.data && typeof redacted.data === "object") {
    const data: Record<string, unknown> = { ...redacted.data };
    for (const field of ["url", "http.query"]) {
      const value = data[field];
      if (typeof value === "string") data[field] = redactUrlQuery(value);
    }
    redacted.data = data;
  }
  if (typeof redacted.message === "string") {
    redacted.message = redactUrlQuery(redacted.message);
  }
  return redacted;
}

/** Masks the URL query in every string value of a span or trace data map. */
function redactSpanData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return data;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === "string" ? redactUrlQuery(value) : value,
    ]),
  );
}

/**
 * The one gate every performance trace (transaction) passes (Sentry.init ->
 * beforeSendTransaction); the API and worker must use the SAME function.
 *
 * The breadcrumb gate is not enough: the same fetch integration also creates
 * an `http.client` span for every outbound call and writes the full URL into
 * the span data (`url.full`, `http.url`, `http.target`) and its description.
 * Whenever `tracesSampleRate` is above zero these traces reach Sentry, so the
 * Sürat password would keep leaking through spans even with the breadcrumb
 * clean. Instead of trusting key names, EVERY string value in a span goes
 * through the query redaction.
 */
export function applySentryTransactionPolicy<T extends Event>(
  event: T,
): T | null {
  const base = applySentryEventPolicy(event);
  if (!base) return null;

  if (typeof base.transaction === "string") {
    base.transaction = redactUrlQuery(base.transaction);
  }
  if (base.spans) {
    base.spans = base.spans.map((span) => ({
      ...span,
      description:
        typeof span.description === "string"
          ? redactUrlQuery(span.description)
          : span.description,
      data: redactSpanData(span.data),
    }));
  }
  const trace = base.contexts?.trace;
  if (trace) {
    base.contexts = {
      ...base.contexts,
      trace: { ...trace, data: redactSpanData(trace.data) },
    };
  }
  return base;
}

/**
 * The deploy release: an explicit `SENTRY_RELEASE`, else Coolify's
 * `SOURCE_COMMIT`, else the generic `GIT_COMMIT_SHA`. With none of them it is
 * undefined and the SDK guesses; the Docker image has no `.git`, so the
 * release then stays untagged (nothing breaks).
 */
export function resolveSentryRelease(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const explicit = env.SENTRY_RELEASE?.trim();
  if (explicit) return explicit;

  const sha = (env.SOURCE_COMMIT ?? env.GIT_COMMIT_SHA)?.trim();
  return sha ? sha.slice(0, 7) : undefined;
}

/**
 * The Sentry environment tag. It cannot come from `NODE_ENV`: every
 * Dockerfile sets that to `production`, so staging and production would look
 * the same and staging test errors would mix into production alerts. The tag
 * has its own key; without it the old behaviour (`NODE_ENV`) is kept.
 *
 * Lower-cased, as web and admin do: Sentry environments are case-sensitive,
 * so a `Production` tag would miss every `environment:production` alert rule
 * and filter while still being sampled as production.
 */
export function resolveSentryEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const tag = env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV?.trim();
  return tag ? tag.toLowerCase() : "development";
}

/**
 * The one `Sentry.init` configuration for the API process, used by both
 * entry points: `worker.ts` (before Nest boots) and `SentryModule` (web and
 * `all` roles). The sample rates come from the shared table by environment
 * tag (`@tarodan/logger` `sentrySampling`), never from `NODE_ENV`, which is
 * `production` on staging too. The privacy gates are not optional: the
 * default fetch instrumentation records every outbound URL, and the Sürat
 * tracking contract carries credentials in the query string.
 */
export function buildSentryNodeOptions(
  dsn: string,
  env: NodeJS.ProcessEnv = process.env,
): NodeOptions {
  const environment = resolveSentryEnvironment(env);
  const { sampleRate, tracesSampleRate } = sentrySampling(environment);
  return {
    dsn,
    environment,
    // Answers "which deploy brought this error" and drives Sentry's
    // regression tracking (a resolved issue reopening in a new release).
    release: resolveSentryRelease(env),
    sampleRate,
    tracesSampleRate,
    beforeSend: applySentryEventPolicy,
    beforeBreadcrumb: applySentryBreadcrumbPolicy,
    beforeSendTransaction: applySentryTransactionPolicy,
  };
}
