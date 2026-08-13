import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DiscountAudience, DiscountTarget } from "@prisma/client";
import {
  assertAudienceConsistent,
  assertBudgetForTarget,
  assertCodeAllowedForTarget,
  assertTargetAllowedForActor,
  audienceMatches,
} from "./discount-authorization";

describe("cep kuralı — kim neyi indirebilir", () => {
  it("platform ürün fiyatına dokunamaz", () => {
    expect(() =>
      assertTargetAllowedForActor(DiscountTarget.product_price, true),
    ).toThrow(ForbiddenException);
  });

  it("satıcı kendi ürün fiyatını indirebilir", () => {
    expect(() =>
      assertTargetAllowedForActor(DiscountTarget.product_price, false),
    ).not.toThrow();
  });

  it("satıcı komisyona/hizmet bedeline dokunamaz", () => {
    expect(() =>
      assertTargetAllowedForActor(DiscountTarget.buyer_commission, false),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertTargetAllowedForActor(DiscountTarget.seller_platform_fee, false),
    ).toThrow(ForbiddenException);
  });

  it("platform bedelleri indirebilir", () => {
    expect(() =>
      assertTargetAllowedForActor(DiscountTarget.buyer_shipping, true),
    ).not.toThrow();
  });
});

describe("kupon kodu yalnız alıcının ödediği kalemlere bağlanır", () => {
  it("satıcı tarafı bedeli koda bağlanamaz", () => {
    expect(() =>
      assertCodeAllowedForTarget(DiscountTarget.seller_commission, true),
    ).toThrow(BadRequestException);
  });

  it("alıcı tarafı bedeli ve ürün fiyatı koda bağlanabilir", () => {
    expect(() =>
      assertCodeAllowedForTarget(DiscountTarget.buyer_commission, true),
    ).not.toThrow();
    expect(() =>
      assertCodeAllowedForTarget(DiscountTarget.product_price, true),
    ).not.toThrow();
  });

  it("kodsuz kampanyada kural işlemez", () => {
    expect(() =>
      assertCodeAllowedForTarget(DiscountTarget.seller_commission, false),
    ).not.toThrow();
  });
});

describe("bütçe tavanı", () => {
  it("bedel indiriminde zorunludur", () => {
    expect(() =>
      assertBudgetForTarget(DiscountTarget.buyer_commission, null),
    ).toThrow(BadRequestException);
    expect(() =>
      assertBudgetForTarget(DiscountTarget.buyer_commission, 0),
    ).toThrow(BadRequestException);
    expect(() =>
      assertBudgetForTarget(DiscountTarget.buyer_commission, 5000),
    ).not.toThrow();
  });

  it("ürün fiyatı indiriminde zorunlu değildir (maliyeti satıcının)", () => {
    expect(() =>
      assertBudgetForTarget(DiscountTarget.product_price, null),
    ).not.toThrow();
  });
});

describe("hedef kitle tutarlılığı", () => {
  it("üyelik hedefinde katman listesi ister", () => {
    expect(() =>
      assertAudienceConsistent({
        audience: DiscountAudience.membership_tiers,
        target: DiscountTarget.buyer_commission,
        tierTypes: [],
      }),
    ).toThrow(BadRequestException);
  });

  it("kişiye özel hedefte kullanıcı listesi ister", () => {
    expect(() =>
      assertAudienceConsistent({
        audience: DiscountAudience.specific_buyers,
        target: DiscountTarget.buyer_commission,
        userIds: [],
      }),
    ).toThrow(BadRequestException);
  });

  it("satıcı bedeli alıcı kitlesine hedeflenemez", () => {
    expect(() =>
      assertAudienceConsistent({
        audience: DiscountAudience.all_buyers,
        target: DiscountTarget.seller_commission,
      }),
    ).toThrow(BadRequestException);
  });

  it("alıcı bedeli satıcı kitlesine hedeflenemez", () => {
    expect(() =>
      assertAudienceConsistent({
        audience: DiscountAudience.all_sellers,
        target: DiscountTarget.buyer_commission,
      }),
    ).toThrow(BadRequestException);
  });

  it("satıcı bedeli satıcı kitlesine hedeflenebilir", () => {
    expect(() =>
      assertAudienceConsistent({
        audience: DiscountAudience.all_sellers,
        target: DiscountTarget.seller_commission,
      }),
    ).not.toThrow();
  });
});

describe("hedef kitle eşleşmesi", () => {
  const base = {
    tierTypes: [] as string[],
    userIds: [] as string[],
    buyerId: "buyer-1",
    sellerId: "seller-1",
    buyerTier: "premium",
    sellerTier: "basic",
  };

  it("herkes hedefi her zaman eşleşir", () => {
    expect(
      audienceMatches({
        ...base,
        audience: DiscountAudience.everyone,
        target: DiscountTarget.buyer_commission,
      }),
    ).toBe(true);
  });

  it("üyelik hedefi kalemin tarafındaki kişinin katmanına bakar", () => {
    // Alıcı kalemi → alıcının katmanı (premium)
    expect(
      audienceMatches({
        ...base,
        audience: DiscountAudience.membership_tiers,
        target: DiscountTarget.buyer_commission,
        tierTypes: ["premium"],
      }),
    ).toBe(true);
    // Satıcı kalemi → satıcının katmanı (basic), premium listesiyle eşleşmez
    expect(
      audienceMatches({
        ...base,
        audience: DiscountAudience.membership_tiers,
        target: DiscountTarget.seller_commission,
        tierTypes: ["premium"],
      }),
    ).toBe(false);
  });

  it("misafirde üyelik hedefli kampanya uygulanmaz", () => {
    expect(
      audienceMatches({
        ...base,
        buyerTier: null,
        audience: DiscountAudience.membership_tiers,
        target: DiscountTarget.buyer_commission,
        tierTypes: ["premium"],
      }),
    ).toBe(false);
  });

  it("kişiye özel hedef kimliği eşler", () => {
    expect(
      audienceMatches({
        ...base,
        audience: DiscountAudience.specific_buyers,
        target: DiscountTarget.buyer_commission,
        userIds: ["buyer-1"],
      }),
    ).toBe(true);
    expect(
      audienceMatches({
        ...base,
        audience: DiscountAudience.specific_sellers,
        target: DiscountTarget.seller_commission,
        userIds: ["seller-9"],
      }),
    ).toBe(false);
  });

  it("tüm alıcılar hedefi satıcı kalemine uygulanmaz", () => {
    expect(
      audienceMatches({
        ...base,
        audience: DiscountAudience.all_buyers,
        target: DiscountTarget.seller_commission,
      }),
    ).toBe(false);
  });
});
