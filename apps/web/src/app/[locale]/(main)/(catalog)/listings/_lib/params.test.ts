/** @format */

import { describe, expect, it } from "vitest";
import {
  buildListApiParams,
  buildListingsUrlParams,
  hasPriceFilter,
  isPriceFilterRefused,
  mergeUrlFilters,
  PAGE_LIMIT,
  parseListingsFilters,
  priceFilterBound,
  priceFilterParam,
} from "./params";

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

describe("price filter bounds", () => {
  it.each([
    ["1000", 1000],
    ["1250.5", 1250.5],
    ["1250,5", 1250.5],
    ["1250,50", 1250.5],
    ["0,57", 0.57],
    [" 500 ", 500],
    ["12,", 12],
  ])("%j is the bound %d", (text, bound) => {
    expect(priceFilterBound(text)).toBe(bound);
    expect(isPriceFilterRefused(text)).toBe(false);
  });

  it.each(["", "  ", "0", "0,00", ","])(
    "%j sets no bound and is not refused",
    (text) => {
      expect(priceFilterBound(text)).toBeUndefined();
      expect(isPriceFilterRefused(text)).toBe(false);
      expect(priceFilterParam(text)).toBe("");
    },
  );

  // "1.000" is one thousand to a Turkish user: refused, never 1 TL.
  it.each([
    "1.000",
    "1.250,50",
    "1,000.50",
    "10.000",
    "1e3",
    "-5",
    "abc",
    "1 000",
  ])("%j is refused and sets no bound", (text) => {
    expect(isPriceFilterRefused(text)).toBe(true);
    expect(priceFilterBound(text)).toBeUndefined();
    expect(priceFilterParam(text)).toBe("");
  });

  it("writes the canonical URL value: a plain number with a dot", () => {
    expect(priceFilterParam("1000")).toBe("1000");
    expect(priceFilterParam("1250,5")).toBe("1250.5");
    expect(priceFilterParam("1250,50")).toBe("1250.5");
    expect(priceFilterParam("100,00")).toBe("100");
  });

  it("counts as a filter only when a bound is set", () => {
    expect(hasPriceFilter({ minPrice: "100", maxPrice: "" })).toBe(true);
    expect(hasPriceFilter({ minPrice: "", maxPrice: "1,5" })).toBe(true);
    expect(hasPriceFilter({ minPrice: "1.000", maxPrice: "" })).toBe(false);
    expect(hasPriceFilter({ minPrice: "0", maxPrice: "" })).toBe(false);
  });
});

describe("price bounds in the API params", () => {
  const api = (query: string) =>
    buildListApiParams(
      parseListingsFilters(sp(query)),
      undefined,
      1,
      PAGE_LIMIT,
    );

  it("sends the parsed bounds as numbers", () => {
    expect(api("minPrice=1000&maxPrice=1250.5")).toMatchObject({
      minPrice: 1000,
      maxPrice: 1250.5,
    });
  });

  it("never reads a legacy grouped value as 1 TL: the bound is ignored", () => {
    const params = api("minPrice=1.000&maxPrice=10.000");
    expect(params).not.toHaveProperty("minPrice");
    expect(params).not.toHaveProperty("maxPrice");
  });

  it("drops zero bounds (zero = no bound)", () => {
    const params = api("minPrice=0&maxPrice=0");
    expect(params).not.toHaveProperty("minPrice");
    expect(params).not.toHaveProperty("maxPrice");
  });

  it("keeps a min above the max as it is (existing behaviour: no swap)", () => {
    expect(api("minPrice=500&maxPrice=100")).toMatchObject({
      minPrice: 500,
      maxPrice: 100,
    });
  });
});

describe("listings URL round trip", () => {
  it("writes what it parses (canonical price bounds unchanged)", () => {
    const query =
      "search=mustang&color=black%2Cred&condition=new&minPrice=1000&maxPrice=1250.5&tradeOnly=true&sortBy=price_asc&attr.hw-rarity=a%2Cb";
    const written = buildListingsUrlParams(parseListingsFilters(sp(query)), 1);
    expect(written.get("minPrice")).toBe("1000");
    expect(written.get("maxPrice")).toBe("1250.5");
    expect(parseListingsFilters(written)).toEqual(
      parseListingsFilters(sp(query)),
    );
  });

  it("writes typed text as the canonical bound, never as typed", () => {
    const filters = {
      ...parseListingsFilters(sp("")),
      minPrice: "1250,50",
      maxPrice: "2000",
    };
    const written = buildListingsUrlParams(filters, 2);
    expect(written.toString()).toBe("minPrice=1250.5&maxPrice=2000&page=2");
  });

  it("does not write refused or zero text", () => {
    const filters = {
      ...parseListingsFilters(sp("")),
      minPrice: "1.000",
      maxPrice: "0",
    };
    expect(buildListingsUrlParams(filters, 1).toString()).toBe("");
  });

  it("keeps a legacy grouped value as field text so its refusal shows", () => {
    // An old URL may carry "1.000"; it is shown in the field (refused, with
    // the refusal copy) and dropped from the search and the next URL write.
    const filters = parseListingsFilters(sp("minPrice=1.000&maxPrice=500"));
    expect(filters.minPrice).toBe("1.000");
    expect(buildListingsUrlParams(filters, 1).toString()).toBe("maxPrice=500");
  });
});
