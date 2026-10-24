import {
  applySentryBreadcrumbPolicy,
  applySentryEventPolicy,
  applySentryTransactionPolicy,
  buildSentryNodeOptions,
  resolveSentryEnvironment,
  resolveSentryRelease,
} from "./sentry-event";
import type { Breadcrumb, Event } from "@sentry/node";
import { runWithRequestId } from "../../common/context/request-context";

/**
 * Breadcrumb gate: Sentry's fetch integration records the URL of every
 * outbound call, and the Sürat contract carries its credentials in the query.
 * In production the password showed up in Sentry events as plain text; these
 * tests keep that leak closed.
 */
describe("applySentryBreadcrumbPolicy", () => {
  const suratUrl =
    "https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi?CariKodu=1561604773&Sifre=S3CR3T&WebSiparisKodu=PKG-2HGNFGEGTD";

  it("masks carrier credentials in outbound http breadcrumbs, keeps the reference", () => {
    const crumb = applySentryBreadcrumbPolicy({
      category: "http",
      data: {
        url: suratUrl,
        "http.query":
          "?CariKodu=1561604773&Sifre=S3CR3T&WebSiparisKodu=PKG-2HGNFGEGTD",
        method: "POST",
      },
    } satisfies Breadcrumb);
    const serialized = JSON.stringify(crumb);
    expect(serialized).not.toContain("S3CR3T");
    expect(serialized).not.toContain("1561604773");
    expect(crumb?.data?.url).toContain("Sifre=***");
    expect(crumb?.data?.url).toContain("CariKodu=***");
    expect(crumb?.data?.url).toContain("WebSiparisKodu=PKG-2HGNFGEGTD");
    expect(crumb?.data?.["http.query"]).toContain("Sifre=***");
    expect(crumb?.data?.method).toBe("POST");
  });

  it("drops health-check breadcrumbs", () => {
    expect(
      applySentryBreadcrumbPolicy({
        category: "http",
        data: { url: "https://api/x/health" },
      } satisfies Breadcrumb),
    ).toBeNull();
  });

  it("still redacts sensitive keys in breadcrumb data and masks urls in messages", () => {
    const crumb = applySentryBreadcrumbPolicy({
      category: "console",
      message: `Surat tracking API request failed for ${suratUrl}`,
      data: { password: "hunter2" },
    } satisfies Breadcrumb);
    expect(JSON.stringify(crumb)).not.toContain("hunter2");
    expect(crumb?.message).not.toContain("S3CR3T");
    expect(crumb?.message).toContain("Sifre=***");
  });

  it("passes breadcrumbs without data through untouched", () => {
    const crumb: Breadcrumb = { category: "navigation", message: "x" };
    expect(applySentryBreadcrumbPolicy(crumb)).toEqual(crumb);
  });
});

/**
 * Performance traces: the fetch integration creates an `http.client` span for
 * every outbound call and writes the full URL into the span data. With the
 * breadcrumb clean it would still leak through the span; this gate closes it.
 */
describe("applySentryTransactionPolicy", () => {
  const suratUrl =
    "https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi?CariKodu=1561604773&Sifre=S3CR3T&WebSiparisKodu=PKG-2HGNFGEGTD";

  it("masks credentials in outbound http spans, span descriptions and the trace context", () => {
    const tx = applySentryTransactionPolicy({
      type: "transaction",
      transaction: "cron sync-surat-tracking",
      contexts: {
        trace: {
          trace_id: "t",
          span_id: "s",
          op: "queue.process",
          data: { "url.full": suratUrl },
        },
      },
      spans: [
        {
          span_id: "s1",
          trace_id: "t",
          start_timestamp: 1,
          op: "http.client",
          description: `POST ${suratUrl}`,
          data: {
            "url.full": suratUrl,
            "http.url": suratUrl,
            "http.target":
              "/api/KargoTakipHareketDetayi?CariKodu=1561604773&Sifre=S3CR3T",
            "http.request.method": "POST",
            "http.response.status_code": 200,
          },
        },
      ],
    } satisfies Event);

    const serialized = JSON.stringify(tx);
    expect(serialized).not.toContain("S3CR3T");
    expect(serialized).not.toContain("1561604773");
    expect(tx?.spans?.[0]?.description).toContain("Sifre=***");
    expect(tx?.spans?.[0]?.data?.["url.full"]).toContain(
      "WebSiparisKodu=PKG-2HGNFGEGTD",
    );
    expect(tx?.spans?.[0]?.data?.["http.response.status_code"]).toBe(200);
    expect(tx?.contexts?.trace?.data?.["url.full"]).toContain("Sifre=***");
    expect(tx?.transaction).toBe("cron sync-surat-tracking");
  });

  it("drops health-check transactions and keeps ordinary ones", () => {
    expect(
      applySentryTransactionPolicy({
        type: "transaction",
        request: { url: "https://api/x/health" },
      } satisfies Event),
    ).toBeNull();
    const plain: Event = { type: "transaction", transaction: "GET /orders" };
    expect(applySentryTransactionPolicy(plain)).toMatchObject(plain);
  });
});

/**
 * The ONE gate every event passes on its way to Sentry. Three contracts:
 *  - health checks never go out (noise that runs every minute),
 *  - sensitive fields are redacted (no body or header leaks),
 *  - the correlation id becomes a TAG: `extra` cannot be searched, and the
 *    main use is typing the code a user gave into the Sentry search.
 */
describe("applySentryEventPolicy", () => {
  it("drops health-check events", () => {
    const event: Event = { request: { url: "https://api/x/health" } };
    expect(applySentryEventPolicy(event)).toBeNull();
  });

  it("adds the correlation id as a SEARCHABLE tag", () => {
    const event = runWithRequestId("req-abc", () =>
      applySentryEventPolicy<Event>({ message: "boom" }),
    );
    expect(event?.tags).toMatchObject({ requestId: "req-abc" });
  });

  it("adds no tag outside a request context (cron, worker)", () => {
    const event = applySentryEventPolicy<Event>({ message: "cron" });
    expect(event?.tags?.requestId).toBeUndefined();
  });

  it("keeps the existing tags", () => {
    const event = runWithRequestId("req-1", () =>
      applySentryEventPolicy({ tags: { area: "payment" } } satisfies Event),
    );
    expect(event?.tags).toMatchObject({ area: "payment", requestId: "req-1" });
  });

  it("redacts sensitive fields", () => {
    const event = applySentryEventPolicy({
      request: { url: "https://api/login", data: { password: "hunter2" } },
    } satisfies Event);
    expect(JSON.stringify(event)).not.toContain("hunter2");
  });

  it("redacts the JSON string body the SDK stores on the request", () => {
    const event = applySentryEventPolicy({
      request: {
        url: "https://api/auth/reauth",
        data: JSON.stringify({ password: "hunter2", code: "g-code" }),
      },
      extra: { code: "P2002" },
    } satisfies Event);

    expect(JSON.stringify(event)).not.toContain("hunter2");
    expect(JSON.stringify(event)).not.toContain("g-code");
    expect(event?.extra?.code).toBe("P2002");
  });

  it("redacts the step-up token header (X-Reauth-Token)", () => {
    const event = applySentryEventPolicy({
      request: {
        url: "https://api/users/me",
        method: "DELETE",
        headers: {
          "x-reauth-token": "opaque-step-up-token",
          "X-Reauth-Token": "opaque-step-up-token",
          accept: "application/json",
        },
      },
    } satisfies Event);

    expect(JSON.stringify(event)).not.toContain("opaque-step-up-token");
    expect(event?.request?.headers?.accept).toBe("application/json");
  });

  it("redacts the body before a card-number pass could break its JSON", () => {
    const event = applySentryEventPolicy({
      request: {
        url: "https://api/auth/login",
        data: '{"ref":4111111111111111,"password":"hunter2"}',
      },
    } satisfies Event);

    expect(JSON.stringify(event)).not.toContain("hunter2");
    expect(JSON.stringify(event)).not.toContain("4111111111111111");
  });
});

/**
 * Without a release tag "which deploy brought this error" has no answer, and
 * Sentry's regression tracking (alerting when a resolved issue reopens in a
 * new release) depends on the release too.
 */
describe("resolveSentryRelease", () => {
  it("an explicit SENTRY_RELEASE wins over everything", () => {
    expect(
      resolveSentryRelease({
        SENTRY_RELEASE: "v1.2.3",
        SOURCE_COMMIT: "abcdef1234567890",
      }),
    ).toBe("v1.2.3");
  });

  it("shortens Coolify's SOURCE_COMMIT to a short sha", () => {
    expect(resolveSentryRelease({ SOURCE_COMMIT: "abcdef1234567890" })).toBe(
      "abcdef1",
    );
  });

  it("GIT_COMMIT_SHA da kabul edilir", () => {
    expect(resolveSentryRelease({ GIT_COMMIT_SHA: "1234567abcdef" })).toBe(
      "1234567",
    );
  });

  it("returns undefined when none is set (the SDK guesses)", () => {
    expect(resolveSentryRelease({})).toBeUndefined();
  });
});

/**
 * The environment tag cannot come from `NODE_ENV`: all three Dockerfiles set
 * it to `production`, so staging and production would look the SAME in
 * Sentry and staging test errors would mix into production alerts. The tag
 * has its own key (SENTRY_ENVIRONMENT).
 */
describe("resolveSentryEnvironment", () => {
  it("SENTRY_ENVIRONMENT sets the environment (even with NODE_ENV production)", () => {
    expect(
      resolveSentryEnvironment({
        SENTRY_ENVIRONMENT: "staging",
        NODE_ENV: "production",
      }),
    ).toBe("staging");
  });

  it("falls back to NODE_ENV when unset (a single-environment setup keeps working)", () => {
    expect(resolveSentryEnvironment({ NODE_ENV: "production" })).toBe(
      "production",
    );
  });

  it("defaults to development when neither is set", () => {
    expect(resolveSentryEnvironment({})).toBe("development");
  });

  it("lower-cases the tag so alert rules on environment:production match", () => {
    expect(
      resolveSentryEnvironment({ SENTRY_ENVIRONMENT: " Production " }),
    ).toBe("production");
  });
});

/**
 * One `Sentry.init` configuration for both entry points (worker.ts and
 * SentryModule). The sample rates follow the environment TAG through the
 * shared table, not `NODE_ENV`: every Dockerfile sets `NODE_ENV=production`,
 * so staging used to sample at production rates.
 */
describe("buildSentryNodeOptions", () => {
  const DSN = "https://public@example.ingest.sentry.io/1";

  it("production: errors 1, traces 0.2, no dead profiling option", () => {
    const options = buildSentryNodeOptions(DSN, {
      SENTRY_ENVIRONMENT: "production",
      NODE_ENV: "production",
      SOURCE_COMMIT: "abcdef1234567890",
    });
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      release: "abcdef1",
      sampleRate: 1,
      tracesSampleRate: 0.2,
    });
    expect(options).not.toHaveProperty("profilesSampleRate");
  });

  it("staging samples 0.02 of traces although NODE_ENV is production", () => {
    const options = buildSentryNodeOptions(DSN, {
      SENTRY_ENVIRONMENT: "staging",
      NODE_ENV: "production",
    });
    expect(options.environment).toBe("staging");
    expect(options.sampleRate).toBe(1);
    expect(options.tracesSampleRate).toBe(0.02);
  });

  it.each([
    ["development", { NODE_ENV: "development" }],
    ["unset", {}],
    ["unknown tag", { SENTRY_ENVIRONMENT: "preview", NODE_ENV: "production" }],
  ])("%s: errors only, no traces", (_label, env) => {
    const options = buildSentryNodeOptions(DSN, env);
    expect(options.sampleRate).toBe(1);
    expect(options.tracesSampleRate).toBe(0);
  });

  it("keeps every privacy gate (the worker runs the Sürat polls)", () => {
    const options = buildSentryNodeOptions(DSN, {});
    expect(options.beforeSend).toBe(applySentryEventPolicy);
    expect(options.beforeBreadcrumb).toBe(applySentryBreadcrumbPolicy);
    expect(options.beforeSendTransaction).toBe(applySentryTransactionPolicy);
  });
});
