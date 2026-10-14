/** @format */

import { describe, expect, it } from "vitest";
import { headerSearchQueryFor, headerSearchQueryForHref } from "./searchSync";

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

describe("headerSearchQueryForHref", () => {
  it("keeps the submitted text for a free-text search (same query re-search)", () => {
    expect(headerSearchQueryForHref("/listings?search=skyline%20gt-r")).toBe(
      "skyline gt-r",
    );
  });

  it("clears the box when the search resolves to a filter or another page", () => {
    expect(headerSearchQueryForHref("/listings?brand=Porsche")).toBe("");
    expect(headerSearchQueryForHref("/listings/abc123")).toBe("");
  });
});
