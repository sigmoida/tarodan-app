/** @format */

import { describe, expect, it } from "vitest";
import { headerSearchQueryFor } from "./searchSync";

describe("headerSearchQueryFor", () => {
  it("mirrors the URL ?search= on /listings", () => {
    expect(headerSearchQueryFor("/listings", "skyline")).toBe("skyline");
  });

  it("is empty on /listings without a search param", () => {
    expect(headerSearchQueryFor("/listings", null)).toBe("");
    expect(headerSearchQueryFor("/listings", "")).toBe("");
  });

  it("clears the query on every other page so it never goes stale", () => {
    expect(headerSearchQueryFor("/", "skyline")).toBe("");
    expect(headerSearchQueryFor("/collections", "skyline")).toBe("");
    expect(headerSearchQueryFor("/listings/abc", "skyline")).toBe("");
  });
});
