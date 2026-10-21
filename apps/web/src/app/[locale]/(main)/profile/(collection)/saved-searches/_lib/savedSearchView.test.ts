/** @format */

import { describe, expect, it } from "vitest";
import type { SavedSearch } from "@tarodan/types";
import { parseListingsFilters } from "../../../../(catalog)/listings/_lib/params";
import { savedSearchChips } from "./chips";
import { savedSearchRunHref } from "./runHref";

const t = ((k: string) => k) as never;

const saved: Pick<SavedSearch, "query" | "labels"> = {
  query: {
    categoryId: "c1",
    brandId: "b1",
    color: "black,red",
    attrGroups: '{"hw-rarity":["a","b"]}',
    search: "mustang",
    tradeOnly: true,
    minPrice: 10,
    sortBy: "price_asc",
  },
  labels: { categoryId: "Diecast", brandId: "Hot Wheels" },
};

describe("savedSearchRunHref", () => {
  it("uses the names /listings reads (search, tradeOnly), not q / tradeAvailable", () => {
    const href = savedSearchRunHref(saved);
    const sp = new URL(href, "http://x").searchParams;
    expect(href.startsWith("/listings?")).toBe(true);
    expect(sp.get("search")).toBe("mustang");
    expect(sp.get("tradeOnly")).toBe("true");
    expect(sp.has("q")).toBe(false);
    expect(sp.has("tradeAvailable")).toBe(false);
  });

  it("parses back into the saved filters, category chip name included", () => {
    const sp = new URL(savedSearchRunHref(saved), "http://x").searchParams;
    expect(parseListingsFilters(sp)).toMatchObject({
      search: "mustang",
      categoryId: "c1",
      category: "Diecast",
      brandId: "b1",
      brand: "Hot Wheels",
      colors: ["black", "red"],
      customAttributes: { "hw-rarity": ["a", "b"] },
      tradeOnly: true,
      minPrice: "10",
      sortBy: "price_asc",
    });
  });
});

describe("savedSearchChips", () => {
  it("shows names and flags, never ids", () => {
    const chips = savedSearchChips(saved, t, "en");
    expect(chips).toEqual([
      'common.search: "mustang"',
      "Diecast",
      "Hot Wheels",
      "black",
      "red",
      "₺10 - ₺∞",
      "product.tradeAvailable",
    ]);
  });
});
