/** @format */

import { describe, expect, it } from "vitest";
import type { Translate } from "@/types/i18n";
import { getListingsTitle, POPULAR_SORT } from "./title";

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as Translate;

const base = {
  tradeOnly: false,
  discountOnly: false,
  sortBy: "relevance",
  brand: "",
  category: "",
  manufacturer: "",
};

describe("getListingsTitle", () => {
  it("falls back to all listings when no preset or name filter is active", () => {
    expect(getListingsTitle(t, "", base)).toBe("seller.allListings");
  });

  it("uses the search query first, over every preset", () => {
    expect(
      getListingsTitle(t, "skyline", {
        ...base,
        tradeOnly: true,
        discountOnly: true,
        sortBy: POPULAR_SORT,
        brand: "Porsche",
      }),
    ).toBe('product.searchResultsFor:{"query":"skyline"}');
  });

  it("shows the trade showcase title for tradeOnly", () => {
    expect(
      getListingsTitle(t, "", { ...base, tradeOnly: true, discountOnly: true }),
    ).toBe("nav.tradeShowcase");
  });

  it("shows the on-sale title for discountOnly", () => {
    expect(
      getListingsTitle(t, "", {
        ...base,
        discountOnly: true,
        sortBy: POPULAR_SORT,
      }),
    ).toBe("product.onSale");
  });

  it("shows the popular listings title for the view-count sort", () => {
    expect(
      getListingsTitle(t, "", { ...base, sortBy: POPULAR_SORT, brand: "BMW" }),
    ).toBe("home.popularListings");
  });

  it("does not treat other sorts as a preset", () => {
    expect(getListingsTitle(t, "", { ...base, sortBy: "price_asc" })).toBe(
      "seller.allListings",
    );
  });

  it("uses brand, then category, then manufacturer name", () => {
    expect(
      getListingsTitle(t, "", {
        ...base,
        brand: "Ferrari",
        category: "Otomobil",
        manufacturer: "Bburago",
      }),
    ).toBe("Ferrari");
    expect(
      getListingsTitle(t, "", {
        ...base,
        category: "Otomobil",
        manufacturer: "Bburago",
      }),
    ).toBe("Otomobil");
    expect(getListingsTitle(t, "", { ...base, manufacturer: "Bburago" })).toBe(
      "Bburago",
    );
  });

  it("returns to all listings once the preset chip is removed", () => {
    const withChip = { ...base, discountOnly: true };
    expect(getListingsTitle(t, "", withChip)).toBe("product.onSale");
    expect(getListingsTitle(t, "", { ...withChip, discountOnly: false })).toBe(
      "seller.allListings",
    );
  });
});
