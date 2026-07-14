const test = require("node:test");
const assert = require("node:assert/strict");

const { formatMessage, interpolate } = require("@tarodan/i18n/core");

test("formats ICU arguments", () => {
  assert.equal(
    interpolate("Merhaba {name}", { name: "Tarodan" }),
    "Merhaba Tarodan",
  );
});

test("formats ICU plurals for the selected locale", () => {
  const message = "{count, plural, one {# item} other {# items}}";

  assert.equal(formatMessage(message, { count: 1 }, "en"), "1 item");
  assert.equal(formatMessage(message, { count: 2 }, "en"), "2 items");
});
