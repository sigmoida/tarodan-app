/** @format */

import { describe, expect, it } from "vitest";
import { isExternalAdHref, safeAdHref } from "./safeAdHref";

describe("safeAdHref", () => {
  it("http(s) ve site-içi yolu geçirir", () => {
    expect(safeAdHref("https://example.com/kampanya?a=1")).toBe(
      "https://example.com/kampanya?a=1",
    );
    expect(safeAdHref("http://example.com")).toBe("http://example.com");
    expect(safeAdHref("/listings?brand=x")).toBe("/listings?brand=x");
  });

  it("kenar boşluklarını kırpar", () => {
    expect(safeAdHref("  /listings  ")).toBe("/listings");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:x",
    "//evil.example.com",
    "/\\evil.example.com",
    "mailto:a@b.c",
    "listings",
    "ftp://example.com",
  ])("%s reddedilir", (url) => {
    expect(safeAdHref(url)).toBeNull();
  });

  it("boş değerlerde null döner", () => {
    expect(safeAdHref(null)).toBeNull();
    expect(safeAdHref(undefined)).toBeNull();
    expect(safeAdHref("   ")).toBeNull();
  });

  it("dış ve iç bağlantıyı ayırt eder", () => {
    expect(isExternalAdHref("https://example.com")).toBe(true);
    expect(isExternalAdHref("/listings")).toBe(false);
  });
});
