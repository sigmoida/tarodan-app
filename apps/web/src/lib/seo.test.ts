/** @format */

import { describe, expect, it } from "vitest";
import {
  localeLanguages,
  localizedAlternates,
  localizedCanonical,
  localizedPath,
} from "./seo";

describe("localizedPath", () => {
  it("tr has no prefix, en lives under /en", () => {
    expect(localizedPath("tr", "/listings/x")).toBe("/listings/x");
    expect(localizedPath("en", "/listings/x")).toBe("/en/listings/x");
    expect(localizedPath("en", "/")).toBe("/en");
  });
});

describe("localeLanguages", () => {
  it("one URL per locale plus x-default on the default locale", () => {
    expect(localeLanguages("/listings/x")).toEqual({
      tr: "/listings/x",
      en: "/en/listings/x",
      "x-default": "/listings/x",
    });
  });
});

describe("localizedAlternates", () => {
  it("per-locale canonical plus the shared hreflang set", () => {
    expect(localizedAlternates("en", "/listings/x")).toEqual({
      ...localizedCanonical("en", "/listings/x"),
      languages: localeLanguages("/listings/x"),
    });
    expect(localizedAlternates("en", "/listings/x").canonical).toBe(
      "/en/listings/x",
    );
  });
});
