const test = require("node:test");
const assert = require("node:assert/strict");

const {
  defaultLocale,
  isLocale,
  locales,
  normalizeLocale,
} = require("@tarodan/i18n/locale");

test("publishes the supported locale contract", () => {
  assert.deepEqual(locales, ["tr", "en"]);
  assert.equal(defaultLocale, "tr");
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("de"), false);
});

test("normalizes regional locale tags and falls back to Turkish", () => {
  assert.equal(normalizeLocale("EN-us"), "en");
  assert.equal(normalizeLocale("tr_TR"), "tr");
  assert.equal(normalizeLocale("de-DE"), "tr");
  assert.equal(normalizeLocale(undefined), "tr");
});
