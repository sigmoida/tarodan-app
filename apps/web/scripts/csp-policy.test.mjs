import assert from "node:assert/strict";
import test from "node:test";
import {
  CSP_ENFORCE_HEADER,
  CSP_REPORT_ONLY_HEADER,
  buildContentSecurityPolicy,
  cspHeaderName,
  isPaymentPath,
  safeOrigin,
  sentryIngestOrigin,
  sentryReportUri,
} from "../src/lib/cspPolicy.mjs";

/** Parse a policy string into { directive: [values] } for readable assertions. */
function directives(policy) {
  return Object.fromEntries(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values];
      }),
  );
}

test("recognises the payment route with and without a locale prefix", () => {
  for (const path of [
    "/payment/abc",
    "/payment/abc/",
    "/en/payment/abc",
    "/tr/payment/abc",
  ]) {
    assert.equal(isPaymentPath(path), true, path);
  }
});

test("does not mistake neighbouring routes for the payment page", () => {
  for (const path of [
    "/",
    "/payments",
    "/profile/payment-methods",
    "/en/checkout",
    "/paymentsomething",
  ]) {
    assert.equal(isPaymentPath(path), false, path);
  }
});

test("enforces on the payment page and only reports elsewhere", () => {
  assert.equal(cspHeaderName(true), CSP_ENFORCE_HEADER);
  assert.equal(cspHeaderName(false), CSP_REPORT_ONLY_HEADER);
});

test("locks down the payment page: no inline scripts, only the nonce", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "abc123",
    isPayment: true,
    isProduction: true,
  });
  const d = directives(policy);

  assert.deepEqual(d["script-src"], ["'self'", "'nonce-abc123'"]);
  assert.ok(!policy.includes("'unsafe-inline' 'nonce"));
  assert.ok(!policy.includes("'unsafe-eval'"));
  // Kart alanları PayTR'ye POST edilir — form hedefi bu iki origin'le SINIRLI.
  assert.deepEqual(d["form-action"], ["'self'", "https://www.paytr.com"]);
  // <base> enjeksiyonu göreli script URL'lerini kaçırabilir; tamamen kapalı.
  assert.deepEqual(d["base-uri"], ["'none'"]);
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["default-src"], ["'self'"]);
});

test("keeps third-party auth scripts OUT of the payment page", () => {
  const payment = buildContentSecurityPolicy({
    nonce: "n",
    isPayment: true,
    isProduction: true,
  });
  const other = buildContentSecurityPolicy({
    nonce: "n",
    isPayment: false,
    isProduction: true,
  });

  assert.ok(!payment.includes("appleid.cdn-apple.com"));
  assert.ok(other.includes("appleid.cdn-apple.com"));
});

test("allows the configured API, websocket and Sentry origins to be reached", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "n",
    isPayment: false,
    isProduction: true,
    apiOrigin: "https://api.tarodan.com.tr",
    wsOrigin: "wss://api.tarodan.com.tr",
    sentryOrigin: "https://o1.ingest.sentry.io",
  });
  const connect = directives(policy)["connect-src"];

  assert.ok(connect.includes("'self'"));
  assert.ok(connect.includes("https://api.tarodan.com.tr"));
  assert.ok(connect.includes("wss://api.tarodan.com.tr"));
  assert.ok(connect.includes("https://o1.ingest.sentry.io"));
});

/**
 * Ödeme profili YALNIZ üçüncü taraf script yüzeyini daraltır (PCI 6.4.3'ün
 * konusu budur). Kendi altyapımız — API, socket.io, görsel CDN'i — aynen açık
 * kalır: ödeme sayfası storefront chrome'unun (Header/Footer/RealtimeProvider)
 * içinde render edilir, bunları kesmek CSP'yi güvenlik değil arıza kaynağı yapardı.
 */
test("payment page keeps our own API and socket reachable", () => {
  const connect = directives(
    buildContentSecurityPolicy({
      nonce: "n",
      isPayment: true,
      isProduction: true,
      apiOrigin: "https://api.tarodan.com.tr",
      wsOrigin: "wss://api.tarodan.com.tr",
      sentryOrigin: "https://o1.ingest.sentry.io",
    }),
  )["connect-src"];

  assert.deepEqual(connect, [
    "'self'",
    "https://o1.ingest.sentry.io",
    "https://api.tarodan.com.tr",
    "wss://api.tarodan.com.tr",
  ]);
});

test("payment page still renders catalog imagery (chrome is shared)", () => {
  const img = directives(
    buildContentSecurityPolicy({
      nonce: "n",
      isPayment: true,
      isProduction: true,
    }),
  )["img-src"];

  // Görsel script çalıştıramaz; kısıtlamak koruma getirmez, chrome'u bozardı.
  assert.ok(img.includes("https://amzn-tarodan.s3.eu-west-1.amazonaws.com"));
});

test("permits the dev toolchain only outside production", () => {
  const dev = buildContentSecurityPolicy({
    nonce: "n",
    isPayment: false,
    isProduction: false,
  });
  const prod = buildContentSecurityPolicy({
    nonce: "n",
    isPayment: false,
    isProduction: true,
  });

  // React Fast Refresh eval kullanır; HMR ws üzerinden konuşur.
  assert.ok(directives(dev)["script-src"].includes("'unsafe-eval'"));
  assert.ok(directives(dev)["connect-src"].some((v) => v.startsWith("ws")));
  assert.ok(!prod.includes("'unsafe-eval'"));
  // Karışık içerik yükseltmesi yalnız canlıda anlamlı (localhost http'dir).
  assert.ok(prod.includes("upgrade-insecure-requests"));
  assert.ok(!dev.includes("upgrade-insecure-requests"));
});

test("routes violation reports to the Sentry security endpoint", () => {
  const uri = sentryReportUri(
    "https://public0key@o4507.ingest.sentry.io/1234567",
  );

  assert.equal(
    uri,
    "https://o4507.ingest.sentry.io/api/1234567/security/?sentry_key=public0key",
  );
});

test("survives a missing or malformed Sentry DSN", () => {
  assert.equal(sentryReportUri(undefined), null);
  assert.equal(sentryReportUri(""), null);
  assert.equal(sentryReportUri("not-a-dsn"), null);
  assert.equal(sentryReportUri("https://o4507.ingest.sentry.io/1234"), null);
});

test("attaches the report endpoint when one is configured", () => {
  const withReporting = buildContentSecurityPolicy({
    nonce: "n",
    isPayment: true,
    isProduction: true,
    reportUri: "https://o1.ingest.sentry.io/api/2/security/?sentry_key=k",
  });
  const without = buildContentSecurityPolicy({
    nonce: "n",
    isPayment: true,
    isProduction: true,
  });

  assert.ok(
    withReporting.includes(
      "report-uri https://o1.ingest.sentry.io/api/2/security/?sentry_key=k",
    ),
  );
  assert.ok(!without.includes("report-uri"));
});

test("reduces configured URLs to bare origins", () => {
  // Politikada yol/sorgu taşımak direktifi gereksiz daraltır; origin yeterli.
  assert.equal(
    safeOrigin("https://api.tarodan.com.tr/api/v1?x=1"),
    "https://api.tarodan.com.tr",
  );
  assert.equal(safeOrigin("wss://api.tarodan.com.tr"), "wss://api.tarodan.com.tr");
  for (const bad of [undefined, "", "   ", "nonsense"]) {
    assert.equal(safeOrigin(bad), null, String(bad));
  }
});

test("derives the Sentry ingest origin from the DSN", () => {
  assert.equal(
    sentryIngestOrigin("https://key@o4507.ingest.sentry.io/1234567"),
    "https://o4507.ingest.sentry.io",
  );
  assert.equal(sentryIngestOrigin(undefined), null);
  assert.equal(sentryIngestOrigin("not-a-dsn"), null);
});

test("refuses to build a policy without a nonce (silent downgrade guard)", () => {
  assert.throws(
    () => buildContentSecurityPolicy({ isPayment: true, isProduction: true }),
    /nonce/i,
  );
});
