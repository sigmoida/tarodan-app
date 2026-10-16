/** @format */

import { describe, expect, it } from "vitest";
import { getDetailBadges } from "./detailBadges";
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

  it("indirim: fiyatlardan hesaplanır, yoksa discountPercent; yuvarlanmış ≥ 1", () => {
    expect(getDetailBadges({ ...base, oldPrice: 200, price: 150 })).toEqual([
      { kind: "sale", percent: 25 },
    ]);
    // Fiyatlar varken API yüzdesi değil fiyatlar esastır.
    expect(
      getDetailBadges({
        ...base,
        oldPrice: 200,
        price: 150,
        discountPercent: 30,
      }),
    ).toEqual([{ kind: "sale", percent: 25 }]);
    // Fiyatlardan hesaplanamıyorsa discountPercent.
    expect(
      getDetailBadges({ ...base, isOnSale: true, discountPercent: 15 }),
    ).toEqual([{ kind: "sale", percent: 15 }]);
    // Hiç yüzde yok ya da yüzde 1'in altına yuvarlanıyor → rozet yok.
    expect(kinds({ isOnSale: true })).toEqual([]);
    expect(kinds({ oldPrice: 1000, price: 996 })).toEqual([]);
  });

  it("takas: ilan aktifken görünür, eski alanlara düşer", () => {
    expect(kinds({ tradeAvailable: true })).toEqual(["trade"]);
    expect(kinds({ trade_available: true })).toEqual(["trade"]);
    expect(kinds({ isTradeEnabled: true })).toEqual(["trade"]);
    expect(kinds({ tradeAvailable: false, trade_available: true })).toEqual([]);
  });

  it("sıra: %İndirim → Takas; Satıldı rozeti hiç yok", () => {
    expect(kinds({ oldPrice: 200, price: 150, tradeAvailable: true })).toEqual([
      "sale",
      "trade",
    ]);
    expect(
      kinds({
        status: "sold",
        oldPrice: 200,
        price: 150,
        tradeAvailable: true,
      }),
    ).toEqual(["sale"]);
    expect(kinds({ status: "sold" })).toEqual([]);
  });

  it("sold / reserved / stok 0 ilanda takas rozeti yok", () => {
    expect(kinds({ status: "sold", tradeAvailable: true })).toEqual([]);
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
