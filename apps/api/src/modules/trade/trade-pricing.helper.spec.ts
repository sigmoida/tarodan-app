import {
  CommissionAppliesTo,
  CommissionSellerType,
  ShippingPackageTierCode,
} from "@prisma/client";
import { buildTradePricing, type TradeFeeRule } from "./trade-pricing.helper";

/**
 * TAKAS FİYATLAMA v2 — komisyon YOK, iki taraf da sabit ücret öder.
 *
 * Eski model: yalnız nakit farkı varsa, yalnız farkı ödeyen taraf, farkın
 * %5'ini komisyon olarak öderdi. Kafa kafaya takasta platform hiçbir şey
 * almıyordu ve dört kargo bacağının maliyeti tamamen platformdaydı.
 *
 * Yeni model — HER İKİ taraf öder:
 *   takas hizmet bedeli + 2 × kargo + (fark ödeyense fark)
 *
 * Hizmet bedeli ÜRÜN BAŞINA komisyon kuralından okunur ve toplanır: taraf,
 * KENDİ verdiği ürünlerin "satıcı" ücretini + KARŞIDAN aldığı ürünlerin "alıcı"
 * ücretini öder. Tutarlar admin'in girdiği KDV DAHİL sabitlerdir — burada hiçbir
 * oran/KDV hesabı yapılmaz (sipariş ücretlerinden bilinçli olarak farklı).
 */

const rule = (over: Partial<TradeFeeRule> = {}): TradeFeeRule => ({
  id: "rule-1",
  categoryId: null,
  sellerType: null,
  taxpayerType: null,
  minAmount: null,
  maxAmount: null,
  appliesTo: CommissionAppliesTo.BOTH,
  priority: 0,
  tradeFeeSellerAmount: 20,
  tradeFeeBuyerAmount: 15,
  ...over,
});

/** Üç kademeli tarife: küçük 30, orta 50, büyük 80. */
const TARIFF = {
  packageTiers: [
    {
      code: ShippingPackageTierCode.small,
      minDesi: 0,
      maxDesi: 5,
      amount: 30,
    },
    {
      code: ShippingPackageTierCode.medium,
      minDesi: 5,
      maxDesi: 15,
      amount: 50,
    },
    {
      code: ShippingPackageTierCode.large,
      minDesi: 15,
      maxDesi: null,
      amount: 80,
    },
  ],
};

const item = (
  over: Partial<Parameters<typeof buildTradePricing>[0]["items"][number]> = {},
) => ({
  productId: "p1",
  side: "initiator" as const,
  categoryId: "cat-1",
  value: 500,
  quantity: 1,
  shippingDesi: 1,
  ...over,
});

describe("buildTradePricing", () => {
  it("her iki taraftan da hizmet bedeli + 2 kargo alır (kafa kafaya takas)", () => {
    const pricing = buildTradePricing({
      items: [item(), item({ productId: "p2", side: "receiver" })],
      rules: [rule()],
      tariff: TARIFF,
    });

    // Her taraf: kendi ürününün satıcı ücreti (20) + aldığı ürünün alıcı ücreti (15).
    expect(pricing.initiator.serviceFee).toBe(35);
    expect(pricing.receiver.serviceFee).toBe(35);
    // Kargo taraf başına 2× kademe tutarı (1 desi → küçük → 30).
    expect(pricing.initiator.shipping).toBe(60);
    expect(pricing.receiver.shipping).toBe(60);
    // Fark yok → iki taraf da aynı toplamı öder.
    expect(pricing.initiator.total).toBe(95);
    expect(pricing.receiver.total).toBe(95);
  });

  it("ürün başına ücretleri TOPLAR (çok ürünlü taraf)", () => {
    const cheap = rule({
      id: "cheap",
      maxAmount: 400,
      tradeFeeSellerAmount: 10,
      tradeFeeBuyerAmount: 5,
    });
    const pricey = rule({
      id: "pricey",
      minAmount: 400.01,
      tradeFeeSellerAmount: 40,
      tradeFeeBuyerAmount: 30,
    });

    const pricing = buildTradePricing({
      items: [
        item({ productId: "a", value: 300 }), // ucuz kural
        item({ productId: "b", value: 900 }), // pahalı kural
        item({ productId: "c", side: "receiver", value: 900 }),
      ],
      rules: [cheap, pricey],
      tariff: TARIFF,
    });

    // initiator: kendi iki ürünü (10 + 40) + karşıdan aldığı ürün (30) = 80
    expect(pricing.initiator.serviceFee).toBe(80);
    // receiver: kendi ürünü (40) + karşıdan aldığı iki ürün (5 + 30) = 75
    expect(pricing.receiver.serviceFee).toBe(75);
  });

  it("kargo kademesini tarafın ürünlerinin BİRLEŞİK desisinden çözer", () => {
    const pricing = buildTradePricing({
      items: [
        // 3 + 3 = 6 desi → orta kademe (50), 2 bacak = 100
        item({ productId: "a", shippingDesi: 3 }),
        item({ productId: "b", shippingDesi: 3 }),
        // tek başına 1 desi → küçük kademe (30), 2 bacak = 60
        item({ productId: "c", side: "receiver", shippingDesi: 1 }),
      ],
      rules: [rule()],
      tariff: TARIFF,
    });

    expect(pricing.initiator.shipping).toBe(100);
    expect(pricing.receiver.shipping).toBe(60);
  });

  it("adet, desiyi çarpar (2 adet × 3 desi = 6 → orta kademe)", () => {
    const pricing = buildTradePricing({
      items: [
        item({ shippingDesi: 3, quantity: 2 }),
        item({ productId: "c", side: "receiver" }),
      ],
      rules: [rule()],
      tariff: TARIFF,
    });

    expect(pricing.initiator.shipping).toBe(100);
  });

  it("nakit farkını YALNIZ ödeyen tarafa ekler, komisyonsuz", () => {
    const pricing = buildTradePricing({
      items: [item(), item({ productId: "p2", side: "receiver" })],
      rules: [rule()],
      tariff: TARIFF,
      cash: { amount: 200, payerSide: "initiator" },
    });

    expect(pricing.initiator.cashDifference).toBe(200);
    expect(pricing.initiator.total).toBe(295); // 35 + 60 + 200
    expect(pricing.receiver.cashDifference).toBe(0);
    expect(pricing.receiver.total).toBe(95); // karşı taraf yine ödüyor
  });

  it("kuralda takas ücreti tanımlı değilse o kalem 0'dır (satır gizlenmez)", () => {
    const pricing = buildTradePricing({
      items: [item(), item({ productId: "p2", side: "receiver" })],
      rules: [rule({ tradeFeeSellerAmount: null, tradeFeeBuyerAmount: null })],
      tariff: TARIFF,
    });

    expect(pricing.initiator.serviceFee).toBe(0);
    expect(pricing.initiator.total).toBe(60); // yalnız kargo
  });

  it("hiçbir kural eşleşmezse ücret 0'dır (takas bloklanmaz)", () => {
    const pricing = buildTradePricing({
      items: [
        item({ categoryId: "other" }),
        item({ productId: "p2", side: "receiver", categoryId: "other" }),
      ],
      rules: [rule({ categoryId: "cat-1" })],
      tariff: TARIFF,
    });

    expect(pricing.initiator.serviceFee).toBe(0);
    expect(pricing.receiver.serviceFee).toBe(0);
  });

  it("kategoriye özel kural, joker kuralı yener (sipariş motoruyla aynı özgüllük)", () => {
    const wildcard = rule({
      id: "w",
      tradeFeeSellerAmount: 10,
      tradeFeeBuyerAmount: 10,
    });
    const specific = rule({
      id: "s",
      categoryId: "cat-1",
      tradeFeeSellerAmount: 25,
      tradeFeeBuyerAmount: 25,
    });

    const pricing = buildTradePricing({
      items: [
        item(),
        item({ productId: "p2", side: "receiver", categoryId: "other" }),
      ],
      rules: [wildcard, specific],
      tariff: TARIFF,
    });

    // initiator: kendi ürünü cat-1 (25) + karşıdan gelen "other" joker (10) = 35
    expect(pricing.initiator.serviceFee).toBe(35);
    // receiver: kendi "other" (10) + karşıdan gelen cat-1 (25) = 35
    expect(pricing.receiver.serviceFee).toBe(35);
  });

  it("satıcı tipine ÖZEL kurallar takasta uygulanmaz (takasta hesap tipi yok)", () => {
    // Takasta taraflar alıcı/satıcı hesabı değildir; yalnız joker kurallar geçerli.
    const pricing = buildTradePricing({
      items: [item(), item({ productId: "p2", side: "receiver" })],
      rules: [rule({ sellerType: CommissionSellerType.BUSINESS })],
      tariff: TARIFF,
    });

    expect(pricing.initiator.serviceFee).toBe(0);
  });

  it("kalem dökümünü de döner (ekranlar tek satır gösterse de denetlenebilir)", () => {
    const pricing = buildTradePricing({
      items: [item(), item({ productId: "p2", side: "receiver" })],
      rules: [rule()],
      tariff: TARIFF,
    });

    expect(pricing.initiator.feeLines).toEqual([
      { productId: "p1", role: "seller", amount: 20 },
      { productId: "p2", role: "buyer", amount: 15 },
    ]);
  });

  it("kuruşlu ücretleri kuruş hassasiyetinde toplar", () => {
    const pricing = buildTradePricing({
      items: [
        item({ productId: "a", value: 100 }),
        item({ productId: "b", value: 100 }),
        item({ productId: "c", side: "receiver", value: 100 }),
      ],
      rules: [rule({ tradeFeeSellerAmount: 10.33, tradeFeeBuyerAmount: 5.17 })],
      tariff: TARIFF,
    });

    expect(pricing.initiator.serviceFee).toBe(25.83); // 10.33 + 10.33 + 5.17
    expect(pricing.receiver.serviceFee).toBe(20.67); // 10.33 + 5.17 + 5.17
  });
});
