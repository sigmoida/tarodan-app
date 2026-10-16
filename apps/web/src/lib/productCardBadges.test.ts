/** @format */

import { describe, expect, it } from "vitest";
import type { Product } from "@/types/product";
import {
  isProductTradeEnabled,
  selectProductCardBadges,
} from "./productCardBadges";

const base: Product = { id: "p1", title: "Camaro", price: 100 };
const sale: Partial<Product> = { oldPrice: 150, discountPercent: 33 };
const kinds = (p: Product) => selectProductCardBadges(p).map((b) => b.kind);

describe("selectProductCardBadges", () => {
  it("uygun rozet yoksa boş döner", () => {
    expect(selectProductCardBadges(base)).toEqual([]);
  });

  it("tek rozeti olduğu gibi döner", () => {
    expect(kinds({ ...base, isBoosted: true })).toEqual(["sponsored"]);
    expect(kinds({ ...base, tradeAvailable: true })).toEqual(["trade"]);
    expect(kinds({ ...base, feeCampaigns: ["Komisyonsuz"] })).toEqual([
      "campaign",
    ]);
  });

  it("indirim varsa her zaman ilktir ve yüzdeyi taşır", () => {
    const p = { ...base, ...sale, isBoosted: true, tradeAvailable: true };
    expect(selectProductCardBadges(p)[0]).toEqual({
      kind: "sale",
      percent: 33,
    });
  });

  it("indirim yüzdesi yoksa %0 yazar (eski davranış)", () => {
    expect(selectProductCardBadges({ ...base, oldPrice: 150 })[0]).toEqual({
      kind: "sale",
      percent: 0,
    });
  });

  it("sıra: indirim → sponsorlu → takas → kampanya; ilk 2 ile sınırlı", () => {
    const all = {
      ...base,
      ...sale,
      isBoosted: true,
      tradeAvailable: true,
      feeCampaigns: ["Komisyonsuz"],
    };
    expect(kinds(all)).toEqual(["sale", "sponsored"]);
    expect(kinds({ ...all, isBoosted: false })).toEqual(["sale", "trade"]);
    expect(kinds({ ...all, isBoosted: false, tradeAvailable: false })).toEqual([
      "sale",
      "campaign",
    ]);
    expect(kinds({ ...all, oldPrice: null })).toEqual(["sponsored", "trade"]);
    expect(kinds({ ...all, oldPrice: null, isBoosted: false })).toEqual([
      "trade",
      "campaign",
    ]);
  });

  it("yalnız ilk kampanya adı alınır, boş adlar atlanır", () => {
    expect(
      selectProductCardBadges({ ...base, feeCampaigns: ["", "A", "B"] }),
    ).toEqual([{ kind: "campaign", label: "A" }]);
  });
});

describe("isProductTradeEnabled", () => {
  it("tradeAvailable eski alanlara baskındır", () => {
    expect(
      isProductTradeEnabled({ tradeAvailable: false, isTradeEnabled: true }),
    ).toBe(false);
    expect(isProductTradeEnabled({ trade_available: true })).toBe(true);
    expect(isProductTradeEnabled({})).toBe(false);
  });
});
