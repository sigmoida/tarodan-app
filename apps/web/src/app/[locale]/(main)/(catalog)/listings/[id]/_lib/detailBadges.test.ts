/** @format */

import { describe, expect, it } from "vitest";
import { getDetailBadges, resolveTradeFlag } from "./detailBadges";
import type { Listing } from "./types";

const base: Listing = {
  id: "l1",
  title: "Camaro",
  description: "",
  price: 100,
  images: [],
  status: "active",
};

const kinds = (l: Partial<Listing>) =>
  getDetailBadges({ ...base, ...l }).map((b) => b.kind);

describe("getDetailBadges", () => {
  it("rozet gerektirmeyen sade ilanda boş döner", () => {
    expect(kinds({})).toEqual([]);
  });

  it("indirim: discountPercent ?? hesaplanan yüzde, N>0", () => {
    expect(getDetailBadges({ ...base, oldPrice: 200, price: 150 })).toEqual([
      { kind: "sale", percent: 25 },
    ]);
    expect(
      getDetailBadges({
        ...base,
        oldPrice: 200,
        price: 150,
        discountPercent: 30,
      }),
    ).toEqual([{ kind: "sale", percent: 30 }]);
    // Yüzde 1'in altına yuvarlanıyorsa rozet yok (%0 asla çizilmez).
    expect(kinds({ oldPrice: 1000, price: 996 })).toEqual([]);
    // %0 ise rozet yok.
    expect(kinds({ isOnSale: true })).toEqual([]);
    expect(kinds({ oldPrice: 200, price: 150, discountPercent: 0 })).toEqual(
      [],
    );
  });

  it("takas: ilan aktifken görünür, eski alanlara düşer", () => {
    expect(kinds({ tradeAvailable: true })).toEqual(["trade"]);
    expect(kinds({ trade_available: true })).toEqual(["trade"]);
    expect(kinds({ isTradeEnabled: true })).toEqual(["trade"]);
    expect(kinds({ tradeAvailable: false, trade_available: true })).toEqual([]);
  });

  it("sıra: Satıldı → %İndirim → Takas", () => {
    // Satıldı + takas birlikte olamaz (takas gizlenir); sıra ayrı ayrı doğrulanır.
    expect(
      kinds({
        status: "sold",
        oldPrice: 200,
        price: 150,
        tradeAvailable: true,
      }),
    ).toEqual(["sold", "sale"]);
    expect(kinds({ oldPrice: 200, price: 150, tradeAvailable: true })).toEqual([
      "sale",
      "trade",
    ]);
  });

  it("sold / reserved / stok 0 ilanda takas rozeti yok", () => {
    expect(kinds({ status: "sold", tradeAvailable: true })).toEqual(["sold"]);
    expect(kinds({ status: "reserved", tradeAvailable: true })).toEqual([]);
    expect(kinds({ availableQuantity: 0, tradeAvailable: true })).toEqual([]);
    expect(
      kinds({ quantity: 0, availableQuantity: null, tradeAvailable: true }),
    ).toEqual([]);
    expect(kinds({ availableQuantity: 2, tradeAvailable: true })).toEqual([
      "trade",
    ]);
  });
});

describe("resolveTradeFlag", () => {
  it("tradeAvailable varsa eski alanlara bakmaz", () => {
    expect(
      resolveTradeFlag({ tradeAvailable: false, isTradeEnabled: true }),
    ).toBe(false);
    expect(resolveTradeFlag(null)).toBe(false);
  });
});
