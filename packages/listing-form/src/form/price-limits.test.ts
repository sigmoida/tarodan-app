import { describe, expect, it } from "vitest";
import { buildEditListingSchema, emptyEditValues } from "../edit/schema";
import {
  NO_PRICE_LIMITS,
  checkListingPrice,
  isOfferImpossible,
  isStoredPrice,
  maxOfferAmount,
  offerPriceFloor,
  parsePriceLimits,
  priceLimitMessages,
  priceLimitViolation,
  salePriceLimitMessage,
  type ListingPriceRules,
} from "./price-limits";
import { createEmptySaleData } from "./sale-data";

describe("parsePriceLimits", () => {
  it("genel ayar yanıtından sayıları okur", () => {
    expect(
      parsePriceLimits({
        max_message_length: 1000,
        min_product_price: 250,
        max_product_price: 100000,
      }),
    ).toEqual({ minPrice: 250, maxPrice: 100000 });
  });

  it("anahtar yoksa kural yoktur", () => {
    expect(parsePriceLimits({ max_message_length: 1000 })).toEqual(
      NO_PRICE_LIMITS,
    );
    expect(parsePriceLimits(undefined)).toEqual(NO_PRICE_LIMITS);
    expect(parsePriceLimits(null)).toEqual(NO_PRICE_LIMITS);
  });

  it("boş / sayısal olmayan değerler kural yok sayılır (0'a dönmez)", () => {
    expect(
      parsePriceLimits({ min_product_price: "", max_product_price: "abc" }),
    ).toEqual(NO_PRICE_LIMITS);
    expect(
      parsePriceLimits({ min_product_price: null, max_product_price: true }),
    ).toEqual(NO_PRICE_LIMITS);
  });
});

describe("priceLimitViolation / checkListingPrice", () => {
  const limits = { minPrice: 250, maxPrice: 1000 };

  it("sınır içi ve sınırdaki fiyat geçer", () => {
    expect(priceLimitViolation(250, limits)).toBeNull();
    expect(priceLimitViolation(1000, limits)).toBeNull();
  });

  it("alt ve üst sınır ihlallerini bildirir", () => {
    expect(priceLimitViolation(249.99, limits)).toEqual({
      type: "minimum",
      limit: 250,
    });
    expect(priceLimitViolation(1000.01, limits)).toEqual({
      type: "maximum",
      limit: 1000,
    });
  });

  it("sınır yoksa her fiyat geçer", () => {
    expect(priceLimitViolation(1, NO_PRICE_LIMITS)).toBeNull();
  });

  it("kayıtlı fiyatla aynı kalan fiyat denetlenmez (geriye dönük işlemez)", () => {
    expect(checkListingPrice(200, limits, [200, null])).toBeNull();
    expect(checkListingPrice(220, limits, [200, null])?.type).toBe("minimum");
  });

  it("isStoredPrice kuruş hassasiyetiyle karşılaştırır", () => {
    expect(isStoredPrice(250.1, [250.1])).toBe(true);
    expect(isStoredPrice(250.1, [250.2, null, undefined])).toBe(false);
  });
});

describe("offerPriceFloor", () => {
  it("ilan fiyatı alt sınıra eşit/üstteyse taban alt sınırdır", () => {
    expect(offerPriceFloor(250, 1000)).toBe(250);
    expect(offerPriceFloor(250, 250)).toBe(250);
  });

  it("ilan sınırın altındaysa (eski ilan) taban yoktur", () => {
    expect(offerPriceFloor(250, 200)).toBeNull();
  });

  it("ayar boşsa kural yoktur", () => {
    expect(offerPriceFloor(null, 1000)).toBeNull();
  });
});

describe("buildEditListingSchema — fiyat sınırı", () => {
  const filled = {
    ...emptyEditValues,
    title: "Hot Wheels Porsche 911",
    description: "Kutusunda, temiz durumda koleksiyonluk model araç.",
    categoryId: "category-1",
    condition: "new",
    brandId: "brand-1",
    colors: ["red"],
    scale: "1:64",
    material: "diecast",
    manufacturerId: "manufacturer-1",
    isBoxed: "boxed" as const,
    quantity: "1",
    price: "1000",
  };
  const rules =
    (overrides: Partial<ListingPriceRules> = {}) =>
    () => ({ limits: { minPrice: 250, maxPrice: 5000 }, ...overrides });
  const issues = (price: string, getRules = rules()) => {
    const result = buildEditListingSchema(() => [], getRules).safeParse({
      ...filled,
      price,
    });
    return result.success
      ? []
      : result.error.issues.map((i) => ({ path: i.path, message: i.message }));
  };

  it("alt sınırın altındaki fiyatı fiyat alanına bağlı hatayla reddeder", () => {
    const [issue] = issues("200");
    expect(issue.path).toEqual(["price"]);
    expect(issue.message).toBe("Ürün fiyatı minimum 250 TL olmalıdır.");
  });

  it("üst sınırın üstündeki fiyatı reddeder", () => {
    const [issue] = issues("6000");
    expect(issue.message).toBe("Ürün fiyatı maksimum 5000 TL olabilir.");
  });

  it("sınır içindeki fiyat geçer", () => {
    expect(issues("250")).toEqual([]);
    expect(issues("1000")).toEqual([]);
  });

  it("sınırın altındaki eski ilan, fiyat DEĞİŞMEDEN geçer", () => {
    expect(issues("200", rules({ storedPrices: [200, null, null] }))).toEqual(
      [],
    );
  });

  it("eski ilanda fiyat başka bir düşük değere çekilirse reddedilir", () => {
    expect(
      issues("220", rules({ storedPrices: [200, null, null] })),
    ).toHaveLength(1);
  });

  it("sınırlar yüklenemediyse (kural yok) form engellenmez", () => {
    expect(issues("1", () => ({ limits: NO_PRICE_LIMITS }))).toEqual([]);
  });

  it("getter verilmezse (yönetici düzenlemesi) kural yoktur", () => {
    const result = buildEditListingSchema(() => []).safeParse({
      ...filled,
      price: "1",
    });
    expect(result.success).toBe(true);
  });
});

describe("salePriceLimitMessage", () => {
  const msg = priceLimitMessages("tr");
  const rules: ListingPriceRules = {
    limits: { minPrice: 250, maxPrice: null },
  };
  const sale = (salePrice: string, originalPrice = "") => ({
    ...createEmptySaleData(),
    salePrice,
    originalPrice,
  });

  it("alt sınırın altındaki indirimli fiyat için hata verir", () => {
    expect(salePriceLimitMessage(sale("200"), 1000, rules, msg)).toBe(
      "İndirimli fiyat en az 250 TL olmalıdır.",
    );
  });

  it("sınır ve üstü geçer", () => {
    expect(salePriceLimitMessage(sale("250"), 1000, rules, msg)).toBeNull();
  });

  it("uygulanmayan indirim (boş ya da fiyattan büyük) denetlenmez", () => {
    expect(salePriceLimitMessage(sale(""), 1000, rules, msg)).toBeNull();
    expect(salePriceLimitMessage(sale("1200"), 1000, rules, msg)).toBeNull();
  });

  it("düzenlemede kayıtlı indirimli fiyat aynen kalırsa hata yok", () => {
    expect(
      salePriceLimitMessage(
        sale("200", "400"),
        400,
        { ...rules, storedPrices: [200, 400, null] },
        msg,
      ),
    ).toBeNull();
  });

  it("sınır yoksa hata yok", () => {
    expect(
      salePriceLimitMessage(sale("1"), 1000, { limits: NO_PRICE_LIMITS }, msg),
    ).toBeNull();
  });
});

describe("maxOfferAmount / isOfferImpossible", () => {
  it("tavan, ilan fiyatının hemen altındaki tam tutardır", () => {
    expect(maxOfferAmount(1000)).toBe(999);
    expect(maxOfferAmount(250.4)).toBe(249);
    expect(maxOfferAmount(0)).toBe(0);
  });

  it("taban tavanı aşıyorsa teklif imkânsızdır", () => {
    // İlan tam alt sınırda: taban fiyata eşit, teklif fiyatın altında olmalı.
    expect(isOfferImpossible(250, 250)).toBe(true);
    // Fiyat tam sayıya yuvarlanınca tavan 249 olur.
    expect(isOfferImpossible(250, 250.4)).toBe(true);
  });

  it("taban tavanı aşmıyorsa teklif mümkündür", () => {
    expect(isOfferImpossible(250, 251)).toBe(false);
    expect(isOfferImpossible(250, 1000)).toBe(false);
    // Tavan yuvarlama sınırı: 250,5 → 251 → tavan 250 (taban 250 geçerli).
    expect(isOfferImpossible(250, 250.5)).toBe(false);
  });

  it("taban yoksa (kural yok / eski ilan) teklif engellenmez", () => {
    expect(isOfferImpossible(null, 250)).toBe(false);
  });
});
