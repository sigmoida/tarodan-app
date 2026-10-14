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

  it("drops colors and custom attributes once the URL no longer has them", () => {
    const prev = parseListingsFilters(
      sp("color=red,black&attr.hw-rarity=treasure-hunt"),
    );
    expect(prev.colors).toEqual(["red", "black"]);
    expect(prev.customAttributes).toEqual({ "hw-rarity": ["treasure-hunt"] });
    const next = mergeUrlFilters(prev, sp(""));
    expect(next.colors).toEqual([]);
    expect(next.customAttributes).toEqual({});
  });

  it("reads colors and custom attributes the way the page writes them", () => {
    const prev = parseListingsFilters(sp(""));
    expect(
      mergeUrlFilters(prev, sp("color=blue&attr.hw-segment=mainline,premium")),
    ).toMatchObject({
      colors: ["blue"],
      customAttributes: { "hw-segment": ["mainline", "premium"] },
    });
  });

  it("treats equal colors / attributes as unchanged (empty groups and key order ignored)", () => {
    const prev = {
      ...parseListingsFilters(sp("color=red")),
      customAttributes: { b: ["2"], a: ["1"], empty: [] },
    };
    expect(mergeUrlFilters(prev, sp("color=red&attr.a=1&attr.b=2"))).toBe(prev);
  });

  it("returns the same object when nothing changed", () => {
    const prev = parseListingsFilters(sp("scale=1%3A64&sortBy=price_asc"));
    expect(mergeUrlFilters(prev, sp("sortBy=price_asc&scale=1%3A64"))).toBe(
      prev,
    );
  });
});
