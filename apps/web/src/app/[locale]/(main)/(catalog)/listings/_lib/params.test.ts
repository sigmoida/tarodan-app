/** @format */

import { describe, expect, it } from "vitest";
import { mergeUrlFilters, parseListingsFilters } from "./params";

const sp = (query: string) => new URLSearchParams(query);

describe("mergeUrlFilters", () => {
  it("resets sortBy to relevance when the URL drops it (popular -> all listings)", () => {
    const prev = parseListingsFilters(sp("sortBy=view_count_desc"));
    const next = mergeUrlFilters(prev, sp(""));
    expect(next.sortBy).toBe("relevance");
  });

  it("does not keep a scale filter once the URL no longer has it", () => {
    const prev = parseListingsFilters(sp("scale=1%3A18"));
    expect(prev.scale).toBe("1:18");
    expect(mergeUrlFilters(prev, sp("discountOnly=true"))).toMatchObject({
      scale: "",
      discountOnly: true,
    });
  });

  it("promotes a known-brand search to a brand filter, like the initial parse", () => {
    const prev = parseListingsFilters(sp(""));
    expect(mergeUrlFilters(prev, sp("search=porsche"))).toMatchObject({
      search: "",
      brand: "Porsche",
    });
  });

  it("keeps colors and custom attributes from state", () => {
    const prev = {
      ...parseListingsFilters(sp("")),
      colors: ["red"],
      customAttributes: { "hw-rarity": ["treasure-hunt"] },
    };
    const next = mergeUrlFilters(prev, sp("tradeOnly=true"));
    expect(next.colors).toBe(prev.colors);
    expect(next.customAttributes).toBe(prev.customAttributes);
    expect(next.tradeOnly).toBe(true);
  });

  it("returns the same object when nothing changed", () => {
    const prev = parseListingsFilters(sp("scale=1%3A64&sortBy=price_asc"));
    expect(mergeUrlFilters(prev, sp("sortBy=price_asc&scale=1%3A64"))).toBe(
      prev,
    );
  });
});
