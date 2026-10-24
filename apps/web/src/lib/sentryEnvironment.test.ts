import { describe, expect, it } from "vitest";

import { resolveSentryEnvironment } from "./sentryEnvironment";

describe("resolveSentryEnvironment", () => {
  it("prefers the explicit value, trimmed", () => {
    expect(
      resolveSentryEnvironment(" staging ", "https://tarodan.com.tr"),
    ).toBe("staging");
  });

  it("lower-cases the explicit value", () => {
    expect(resolveSentryEnvironment(" Production ", undefined)).toBe(
      "production",
    );
  });

  it.each([
    ["https://staging.tarodan.com.tr", "staging"],
    ["https://admin.staging.tarodan.com.tr", "staging"],
    ["https://admin-staging.tarodan.com.tr", "staging"],
    ["https://tarodan.com.tr", "production"],
    ["https://www.tarodan.com.tr", "production"],
    ["https://admin.tarodan.com.tr", "production"],
    ["HTTPS://WWW.TARODAN.COM.TR/", "production"],
    ["https://tarodan.com.tr.example.com", "unknown"],
    ["http://localhost:3000", "development"],
    ["http://127.0.0.1:3000", "development"],
    ["http://0.0.0.0:3000", "development"],
    ["http://[::1]:3000", "development"],
    ["http://web.localhost:3000", "development"],
    ["https://example.com", "unknown"],
    ["not a url", "unknown"],
    ["", "unknown"],
    [undefined, "unknown"],
  ])("derives from the app URL %s -> %s", (url, expected) => {
    expect(resolveSentryEnvironment(undefined, url)).toBe(expected);
    expect(resolveSentryEnvironment("  ", url)).toBe(expected);
  });
});
