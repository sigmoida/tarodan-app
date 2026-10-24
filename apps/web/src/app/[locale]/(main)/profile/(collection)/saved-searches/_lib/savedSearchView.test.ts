/** @format */

import { describe, expect, it } from "vitest";
import type { SavedSearch } from "@tarodan/types";
import { parseListingsFilters } from "../../../../(catalog)/listings/_lib/params";
import { buildSavedSearchDraft } from "../../../../(catalog)/listings/_lib/savedSearch";
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

/** Save on /listings (URL -> filters -> draft), then run it (draft -> URL). */
const saveFromUrl = (url: string) => {
  const sp = new URLSearchParams(url);
  const filters = parseListingsFilters(sp);
  return buildSavedSearchDraft(filters, filters.categoryId || undefined);
};
const runAndSaveAgain = (draft: Pick<SavedSearch, "query" | "labels">) =>
  saveFromUrl(new URL(savedSearchRunHref(draft), "http://x").search);

describe("save -> run round trip", () => {
  it.each([
    [
      "every filter",
      "search=mustang&categoryId=c1&category=Diecast&brandId=b1&brand=Hot+Wheels" +
        "&carModelId=m1&carModel=Mustang&manufacturerId=f1&manufacturer=Mattel" +
        "&scale=1%3A64&material=resin&color=red,black&condition=new&minPrice=10" +
        "&maxPrice=500&tradeOnly=true&discountOnly=true&preOrder=true&limited=true" +
        "&set=true&attr.hw-rarity=th,sth&sortBy=price_asc",
    ],
    ["a brand typed as free text (sent as brand=)", "search=porsche"],
    ["a brand name without an id", "brand=Tomica&sortBy=view_count_desc"],
    ["a Turkish condition label", "condition=Yeni&search=gt"],
  ])("runs %s as the same GET /products query", (_name, url) => {
    const saved = saveFromUrl(url);
    expect(saved.isEmpty).toBe(false);
    const rerun = runAndSaveAgain(saved);
    expect(rerun.query).toEqual(saved.query);
    expect(rerun.labels).toEqual(saved.labels);
  });

  it("stores a detected brand as brand=, as the grid sends it", () => {
    expect(saveFromUrl("search=porsche").query).toEqual({ brand: "Porsche" });
  });
});

describe("savedSearchChips", () => {
  it("names materials and colours as the listings chips do", () => {
    const chips = savedSearchChips(
      { query: { material: "resin", color: "black,teal" }, labels: {} },
      t,
      "en",
      [{ slug: "black", label: "Siyah" }],
    );
    expect(chips).toEqual([
      "page.listings.listingstoolbar.resinRecine",
      "Siyah",
      "teal",
    ]);
  });

  it("shows names and flags, never ids", () => {
    const chips = savedSearchChips(saved, t, "en");
    expect(chips).toEqual([
      'common.search: "mustang"',
      "Diecast",
      "Hot Wheels",
      "black",
      "red",
      "10,00 TL - ∞",
      "product.tradeAvailable",
    ]);
  });
});
