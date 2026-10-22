/** @format */

import { describe, expect, it } from "vitest";
import { SEARCH_PRICE_MAX } from "@tarodan/types";
import {
  buildListApiParams,
  buildListingsUrlParams,
  hasPriceFilter,
  mergeUrlFilters,
  PAGE_LIMIT,
  parseListingsFilters,
  priceFilterBound,
  priceFilterIssue,
  priceFilterIssueMessage,
  priceFilterParam,
  priceFilterText,
  priceRangeIssue,
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
    expect(priceFilterIssue(text)).toBeUndefined();
  });

  it.each(["", "  ", "0", "0,00", ","])(
    "%j sets no bound and is not refused",
    (text) => {
      expect(priceFilterBound(text)).toBeUndefined();
      expect(priceFilterIssue(text)).toBeUndefined();
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
    expect(priceFilterIssue(text)).toBe("refused");
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

describe("price bounds above the search max", () => {
  const above = [
    String(SEARCH_PRICE_MAX + 1),
    "10000000",
    "9999999,01",
    "9999999.01",
  ];

  it("takes the max itself as a bound", () => {
    expect(priceFilterBound(String(SEARCH_PRICE_MAX))).toBe(SEARCH_PRICE_MAX);
    expect(priceFilterIssue(String(SEARCH_PRICE_MAX))).toBeUndefined();
  });

  it.each(above)("%j sets no bound and is above the max", (text) => {
    expect(priceFilterBound(text)).toBeUndefined();
    expect(priceFilterParam(text)).toBe("");
    expect(priceFilterIssue(text)).toBe("aboveMax");
    expect(hasPriceFilter({ minPrice: text, maxPrice: "" })).toBe(false);
  });

  it("is never sent to GET /products (min or max)", () => {
    const params = buildListApiParams(
      parseListingsFilters(sp("minPrice=10000000&maxPrice=20000000")),
      undefined,
      1,
      PAGE_LIMIT,
    );
    expect(params).not.toHaveProperty("minPrice");
    expect(params).not.toHaveProperty("maxPrice");
  });

  it("reads a legacy URL or saved-search value as no bound and drops it from the next URL", () => {
    // Prefilled so the field shows why the bound is ignored.
    const filters = parseListingsFilters(sp("maxPrice=10000000&minPrice=500"));
    expect(filters.maxPrice).toBe("10000000");
    expect(buildListingsUrlParams(filters, 1).toString()).toBe("minPrice=500");
    expect(buildListApiParams(filters, undefined, 1, PAGE_LIMIT)).toMatchObject(
      { minPrice: 500 },
    );
  });

  it("ranks a refusal before a bound above the max (one message for both fields)", () => {
    expect(priceRangeIssue({ minPrice: "", maxPrice: "" })).toBeUndefined();
    expect(
      priceRangeIssue({ minPrice: "100", maxPrice: "500" }),
    ).toBeUndefined();
    expect(priceRangeIssue({ minPrice: "", maxPrice: "10000000" })).toBe(
      "aboveMax",
    );
    expect(priceRangeIssue({ minPrice: "10000000", maxPrice: "1.000" })).toBe(
      "refused",
    );
  });

  it("names the max as money in the message", () => {
    const t = ((key: string, values?: { max?: string }) =>
      values?.max ? `${key}|${values.max}` : key) as unknown as Parameters<
      typeof priceFilterIssueMessage
    >[1];
    expect(priceFilterIssueMessage("aboveMax", t)).toBe(
      "validation.maxValue|9.999.999,00 TL",
    );
    expect(priceFilterIssueMessage("refused", t)).toBe(
      "validation.amountFormatRefused",
    );
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

describe("price field prefill from the URL", () => {
  it("prefills a bound with a decimal comma (tlAmountInputValue)", () => {
    expect(priceFilterText("1250.5")).toBe("1250,50");
    expect(priceFilterText("1250.50")).toBe("1250,50");
    expect(priceFilterText("1000")).toBe("1000");
    expect(
      parseListingsFilters(sp("minPrice=99.99&maxPrice=500")),
    ).toMatchObject({ minPrice: "99,99", maxPrice: "500" });
  });

  it("keeps refused text so the field shows the refusal", () => {
    expect(priceFilterText("1.000")).toBe("1.000");
    expect(priceFilterText(" -5 ")).toBe("-5");
  });

  it("empty and zero prefill nothing", () => {
    expect(priceFilterText("")).toBe("");
    expect(priceFilterText("0")).toBe("");
  });
});
