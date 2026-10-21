/** @format */

import { describe, expect, it } from "vitest";
import type { Product } from "@/types/product";
import type { Translate } from "@/types/i18n";
import {
  describeProductBadges,
  isProductTradeBadgeVisible,
  isProductTradeEnabled,
  productBadgeLabels,
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
    expect(kinds({ ...base, isBoosted: true })).toEqual(["boosted"]);
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

  it("discountPercent 0/yoksa yüzde fiyatlardan hesaplanır (yuvarlanmış)", () => {
    // 150 → 100: %33,33 → 33
    expect(
      selectProductCardBadges({
        ...base,
        oldPrice: 150,
        discountPercent: 0,
      })[0],
    ).toEqual({ kind: "sale", percent: 33 });
    expect(selectProductCardBadges({ ...base, oldPrice: 150 })[0]).toEqual({
      kind: "sale",
      percent: 33,
    });
  });

  it("eski ve yeni fiyat varsa yüzde HER ZAMAN fiyatlardan hesaplanır", () => {
    expect(
      selectProductCardBadges({
        ...base,
        oldPrice: 150,
        discountPercent: 40,
      })[0],
    ).toEqual({ kind: "sale", percent: 33 });
  });

  it("fiyatlardan hesaplanamıyorsa discountPercent'e düşer", () => {
    expect(
      selectProductCardBadges({
        ...base,
        isOnSale: true,
        discountPercent: 20,
      })[0],
    ).toEqual({ kind: "sale", percent: 20 });
  });

  it("yüzde 1'in altındaysa indirim rozeti hiç yoktur (asla %0)", () => {
    // 1000 → 996: %0,4
    expect(
      selectProductCardBadges({ ...base, price: 996, oldPrice: 1000 }),
    ).toEqual([]);
    // isOnSale bayrağı var ama eski fiyat yok → hesaplanacak yüzde yok.
    expect(
      selectProductCardBadges({ ...base, isOnSale: true, discountPercent: 0 }),
    ).toEqual([]);
  });

  it("indirimde olmayan ürün discountPercent taşısa da rozet almaz", () => {
    expect(selectProductCardBadges({ ...base, discountPercent: 20 })).toEqual(
      [],
    );
  });

  it("sponsorlu yalnız isBoosted === true iken", () => {
    expect(kinds({ ...base, isBoosted: 1 as unknown as boolean })).toEqual([]);
  });

  it("sıra: indirim → sponsorlu → takas → kampanya; ilk 2 ile sınırlı", () => {
    const all = {
      ...base,
      ...sale,
      isBoosted: true,
      tradeAvailable: true,
      feeCampaigns: ["Komisyonsuz"],
    };
    expect(kinds(all)).toEqual(["sale", "boosted"]);
    expect(kinds({ ...all, isBoosted: false })).toEqual(["sale", "trade"]);
    expect(kinds({ ...all, isBoosted: false, tradeAvailable: false })).toEqual([
      "sale",
      "campaign",
    ]);
    expect(kinds({ ...all, oldPrice: null })).toEqual(["boosted", "trade"]);
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
  it("tradeAvailable eski alanlara baskındır; yoksa legacy alanlara düşer", () => {
    expect(isProductTradeEnabled({ isTradeEnabled: true })).toBe(true);
    expect(
      isProductTradeEnabled({ tradeAvailable: false, isTradeEnabled: true }),
    ).toBe(false);
    expect(isProductTradeEnabled({ trade_available: true })).toBe(true);
    expect(isProductTradeEnabled({})).toBe(false);
  });
});

describe("isProductTradeBadgeVisible", () => {
  const trade = { tradeAvailable: true };

  it("takas açık VE ilan satın alınabilirken true", () => {
    expect(isProductTradeBadgeVisible({ ...trade, status: "active" })).toBe(
      true,
    );
    expect(isProductTradeBadgeVisible(trade)).toBe(true);
    expect(isProductTradeBadgeVisible({ ...trade, availableQuantity: 2 })).toBe(
      true,
    );
  });

  it("takas kapalıysa false", () => {
    expect(isProductTradeBadgeVisible({ status: "active" })).toBe(false);
  });

  it("sold / reserved / stok 0 ilanda false (quantity yedeği dahil)", () => {
    expect(isProductTradeBadgeVisible({ ...trade, status: "sold" })).toBe(
      false,
    );
    expect(isProductTradeBadgeVisible({ ...trade, status: "reserved" })).toBe(
      false,
    );
    expect(isProductTradeBadgeVisible({ ...trade, availableQuantity: 0 })).toBe(
      false,
    );
    expect(isProductTradeBadgeVisible({ ...trade, quantity: 0 })).toBe(false);
  });

  it("kart yığını da aynı kuralı kullanır", () => {
    expect(kinds({ ...base, ...trade, status: "sold" })).toEqual([]);
  });
});

describe("describeProductBadges", () => {
  const labels = {
    discount: "indirim",
    boosted: "Öne Çıkan",
    boostedHint: "Satıcı bu ilanı ücretli olarak öne çıkardı",
    trade: "Takas",
  };

  it("joins the badges as 'percent discount, label'", () => {
    expect(
      describeProductBadges(
        [
          { kind: "sale", percent: 38 },
          { kind: "trade" },
          { kind: "campaign", label: "Komisyonsuz" },
        ],
        labels,
      ),
    ).toBe("%38 indirim, Takas, Komisyonsuz");
  });

  it("reads the paid-placement hint for the boosted badge", () => {
    expect(describeProductBadges([{ kind: "boosted" }], labels)).toBe(
      labels.boostedHint,
    );
  });
});

describe("productBadgeLabels", () => {
  it("takes the boosted badge copy, never the ads' 'Sponsorlu'", () => {
    const t = ((key: string) => key) as unknown as Translate;
    expect(productBadgeLabels(t)).toEqual({
      discount: "product.discount",
      boosted: "product.boostedBadge",
      boostedHint: "product.boostedBadgeHint",
      trade: "faq.trade",
    });
  });
});
