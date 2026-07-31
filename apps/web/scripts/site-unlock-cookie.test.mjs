import assert from "node:assert/strict";
import test from "node:test";
import {
  UNLOCK_COOKIE_MAX_AGE_SECONDS,
  signUnlockCookie,
  verifyUnlockCookie,
} from "../src/lib/siteUnlockCookie.mjs";

const SECRET = "test-secret-at-least-32-characters-long!";
const NOW = 1_800_000_000;

test("exposes a 10-day cookie lifetime", () => {
  assert.equal(UNLOCK_COOKIE_MAX_AGE_SECONDS, 10 * 24 * 60 * 60);
});

test("sign/verify round-trip succeeds before expiry", async () => {
  const value = await signUnlockCookie(SECRET, NOW + 600);
  assert.match(value, /^v2\.\d+\.[0-9a-f]{64}$/);
  assert.equal(await verifyUnlockCookie(SECRET, value, NOW), true);
});

test("rejects an expired cookie", async () => {
  const value = await signUnlockCookie(SECRET, NOW - 1);
  assert.equal(await verifyUnlockCookie(SECRET, value, NOW), false);
});

test("rejects a cookie expiring exactly now", async () => {
  const value = await signUnlockCookie(SECRET, NOW);
  assert.equal(await verifyUnlockCookie(SECRET, value, NOW), false);
});

test("rejects a tampered signature", async () => {
  const value = await signUnlockCookie(SECRET, NOW + 600);
  const tampered = value.slice(0, -1) + (value.endsWith("0") ? "1" : "0");
  assert.equal(await verifyUnlockCookie(SECRET, tampered, NOW), false);
});

test("rejects a tampered expiry", async () => {
  const value = await signUnlockCookie(SECRET, NOW + 600);
  const [version, exp, sig] = value.split(".");
  const extended = [version, String(Number(exp) + 86_400), sig].join(".");
  assert.equal(await verifyUnlockCookie(SECRET, extended, NOW), false);
});

test("rejects the wrong secret", async () => {
  const value = await signUnlockCookie(SECRET, NOW + 600);
  assert.equal(
    await verifyUnlockCookie("another-secret-also-32-characters!!", value, NOW),
    false,
  );
});

test("rejects malformed values", async () => {
  for (const bad of [
    "",
    "v2",
    "v2.123",
    "v1.9999999999.deadbeef",
    "v2.notanumber.deadbeef",
    "v2.123.deadbeef.extra",
    `v2.${"9".repeat(13)}.deadbeef`,
    null,
    undefined,
    42,
  ]) {
    assert.equal(await verifyUnlockCookie(SECRET, bad, NOW), false);
  }
});
