import assert from "node:assert/strict";
import test from "node:test";
import {
  UnlockRateLimiter,
  internalComingSoonPath,
  isSiteLocked,
  resolvePublicOrigin,
} from "../src/lib/siteLockPolicy.mjs";

test("accepts every supported true value for the site lock", () => {
  for (const value of ["true", "TRUE", "1"]) {
    assert.equal(isSiteLocked(value), true);
  }
  for (const value of [undefined, "", "false", "0"]) {
    assert.equal(isSiteLocked(value), false);
  }
});

test("rewrites locked pages to the internal locale route", () => {
  assert.equal(internalComingSoonPath("tr"), "/tr/coming-soon");
  assert.equal(internalComingSoonPath("en"), "/en/coming-soon");
});

test("builds redirects from the configured public application origin", () => {
  assert.equal(
    resolvePublicOrigin("https://www.tarodan.com/path", "http://0.0.0.0:3000"),
    "https://www.tarodan.com",
  );
});

test("falls back to the request origin outside configured environments", () => {
  assert.equal(
    resolvePublicOrigin(undefined, "http://localhost:3000"),
    "http://localhost:3000",
  );
});

test("blocks repeated invalid unlock attempts and resets after the window", () => {
  let now = 1_000;
  const limiter = new UnlockRateLimiter({
    maxAttempts: 3,
    windowMs: 60_000,
    now: () => now,
  });

  assert.deepEqual(limiter.status("client"), {
    blocked: false,
    retryAfterSeconds: 0,
  });
  limiter.recordFailure("client");
  limiter.recordFailure("client");
  assert.equal(limiter.status("client").blocked, false);

  limiter.recordFailure("client");
  assert.equal(limiter.status("client").blocked, true);
  assert.equal(limiter.status("client").retryAfterSeconds, 60);

  now += 60_001;
  assert.equal(limiter.status("client").blocked, false);
});

test("clears failed attempts after a successful unlock", () => {
  const limiter = new UnlockRateLimiter({
    maxAttempts: 2,
    windowMs: 60_000,
  });

  limiter.recordFailure("client");
  limiter.clear("client");
  limiter.recordFailure("client");

  assert.equal(limiter.status("client").blocked, false);
});
