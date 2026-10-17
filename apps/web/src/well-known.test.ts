import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { wellKnownStagingRewrites } = require("../well-known-rewrites");

// Next `config.matcher`'ı statik okur (import edilemez) ve middleware.ts testte
// @tarodan/i18n build'i gerektirir; bu yüzden literal kaynaktan okunur.
const source = readFileSync(path.join(__dirname, "middleware.ts"), "utf8");
const literal = /matcher:\s*\["(.+)"\]/.exec(source)![1].replace(/\\\\/g, "\\");
const matcher = new RegExp(`^${literal}$`);

describe("/.well-known/** — middleware dışında", () => {
  it("matcher assetlinks ve AASA'yı yakalamaz (locale/kilit/auth uygulanmaz)", () => {
    expect(matcher.test("/.well-known/assetlinks.json")).toBe(false);
    expect(matcher.test("/.well-known/apple-app-site-association")).toBe(false);
    expect(matcher.test("/terms")).toBe(true);
  });
});

describe("staging host rewrite", () => {
  const find = (source: string) =>
    wellKnownStagingRewrites.find(
      (r: { source: string }) => r.source === source,
    );

  it("assetlinks staging host'ta staging dosyasına yazılır", () => {
    const r = find("/.well-known/assetlinks.json");
    expect(r.has).toEqual([{ type: "host", value: "staging.tarodan.com.tr" }]);
    expect(r.destination).toBe("/.well-known/assetlinks-staging.json");
  });

  it("AASA staging kuralı korunur", () => {
    expect(find("/.well-known/apple-app-site-association").destination).toBe(
      "/.well-known/apple-app-site-association-staging.json",
    );
  });

  it("prod dosyası com.tarodan.app, staging dosyası .staging paketi", () => {
    const prod = require("../public/.well-known/assetlinks.json");
    const stg = require("../public/.well-known/assetlinks-staging.json");
    expect(prod[0].target.package_name).toBe("com.tarodan.app");
    expect(stg[0].target.package_name).toBe("com.tarodan.app.staging");
  });
});
