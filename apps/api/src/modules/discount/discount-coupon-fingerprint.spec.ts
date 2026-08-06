import { ConflictException } from "@nestjs/common";
import { DiscountFundedBy, DiscountScope, DiscountType } from "@prisma/client";
import { DiscountService } from "./discount.service";
import { DiscountScopeService } from "./discount-scope.service";
import { testPriceResolver } from "./testing/price-resolver-fixture";

/**
 * Regresyon: `pricingHash` kuponu BİLEREK dışarıda bırakır (kullanıcıya bağlı,
 * quote ucu @Public). Bu yüzden kuponun oranı, sabit tutarı, tavanı, kapsamı
 * ya da finansman tipi quote ile create arasında değişirse create sessizce
 * YENİ tutarla — ve yeni komisyonla — devam edebiliyordu. Alıcı onaylamadığı
 * bir tahsilatla karşılaşıyordu.
 */
describe("kupon parmak izi (quote → create onayı)", () => {
  const product = {
    id: "product-1",
    price: 100,
    sellerId: "seller-1",
    categoryId: "category-1",
  };

  const makeService = (coupon: Record<string, unknown> = {}) => {
    const prisma = {
      discount: {
        findUnique: jest.fn().mockResolvedValue({
          id: "coupon-1",
          code: "SAVE20",
          name: "20 TL",
          type: DiscountType.fixed_amount,
          value: 20,
          scope: DiscountScope.global,
          sellerId: null,
          categoryId: null,
          targetProductIds: [],
          minCartValue: null,
          maxDiscountAmount: null,
          usageLimitTotal: null,
          usageLimitPerUser: null,
          usedCount: 0,
          isActive: true,
          startDate: new Date("2020-01-01"),
          endDate: new Date("2100-01-01"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          fundedBy: DiscountFundedBy.seller,
          platformFundedRatio: null,
          ...coupon,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      discountCode: { findUnique: jest.fn().mockResolvedValue(null) },
      discountUsage: { count: jest.fn().mockResolvedValue(0) },
      couponReservation: { count: jest.fn().mockResolvedValue(0) },
      product: { findMany: jest.fn().mockResolvedValue([product]) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    return new DiscountService(
      prisma,
      { delPattern: jest.fn() } as any,
      { syncProduct: jest.fn() } as any,
      testPriceResolver(),
      new DiscountScopeService(prisma),
    );
  };

  const lines = [{ productId: "product-1", quantity: 1, lineSubtotal: 100 }];
  const allocate = (overrides: Record<string, unknown> = {}) =>
    makeService(overrides).allocateCoupon("SAVE20", lines, "buyer-1");

  it("kupon değişmediyse checkout devam eder", async () => {
    const quoted = await allocate();
    const atCreate = await allocate();

    expect(() =>
      makeService().assertCouponUnchanged(
        atCreate.coupon,
        quoted.coupon!.fingerprint,
      ),
    ).not.toThrow();
  });

  const expectRejected = async (overrides: Record<string, unknown>) => {
    const quoted = await allocate();
    const atCreate = await allocate(overrides);

    expect(() =>
      makeService().assertCouponUnchanged(
        atCreate.coupon,
        quoted.coupon!.fingerprint,
      ),
    ).toThrow(ConflictException);
  };

  it("sabit tutar değişirse reddedilir", () =>
    expectRejected({ value: 40, updatedAt: new Date("2026-02-01") }));

  it("yüzdeye çevrilirse reddedilir", () =>
    expectRejected({
      type: DiscountType.percentage,
      value: 20,
      updatedAt: new Date("2026-02-01"),
    }));

  it("maksimum indirim tavanı değişirse reddedilir", () =>
    expectRejected({
      type: DiscountType.percentage,
      value: 50,
      maxDiscountAmount: 5,
      updatedAt: new Date("2026-02-01"),
    }));

  it("finansman seller → platform değişirse reddedilir", () =>
    expectRejected({
      fundedBy: DiscountFundedBy.platform,
      updatedAt: new Date("2026-02-01"),
    }));

  it("kapsam değişirse reddedilir", () =>
    expectRejected({
      scope: DiscountScope.seller,
      sellerId: "seller-1",
      updatedAt: new Date("2026-02-01"),
    }));

  it("yalnız updatedAt değişse bile reddedilir (görünmeyen düzenleme)", () =>
    expectRejected({ updatedAt: new Date("2026-03-03") }));

  it("kupon uygulanıyorsa parmak izi ZORUNLUDUR", async () => {
    const { coupon } = await allocate();

    expect(() =>
      makeService().assertCouponUnchanged(coupon, undefined),
    ).toThrow(ConflictException);
  });

  it("kupon uygulanmıyorsa doğrulanacak bir şey yoktur", () => {
    expect(() =>
      makeService().assertCouponUnchanged(null, undefined),
    ).not.toThrow();
  });

  it("hata gövdesi PRICING_CHANGED kodunu taşır", async () => {
    const { coupon } = await allocate();

    try {
      makeService().assertCouponUnchanged(coupon, "stale");
      throw new Error("beklenen hata atılmadı");
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: "PRICING_CHANGED",
      });
    }
  });
});
