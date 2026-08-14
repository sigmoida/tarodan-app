import {
  DiscountAudience,
  DiscountScope,
  DiscountTarget,
  DiscountType,
} from "@prisma/client";
import { DiscountService } from "./discount.service";
import { DiscountUsageService } from "./discount-usage.service";
import { DiscountCrudService } from "./discount-crud.service";
import { DiscountPricingService } from "./discount-pricing.service";
import { DiscountCouponService } from "./discount-coupon.service";
import { DiscountTradeFeeService } from "./discount-trade-fee.service";

/**
 * Kupon tarafındaki üç yeni kural:
 *  1. Hedef kitle kupon için de bağlayıcıdır (üyelik / kişiye özel).
 *  2. Kampanya bütçesi dolduysa kupon kabul edilmez.
 *  3. Bedel hedefli kupon ürün tabanına DOKUNMAZ; tutarı fiyat hattında,
 *     bedeller hesaplandıktan sonra belli olur.
 */
describe("validateCoupon — hedef kitle, bütçe ve hedef kalem", () => {
  const product = {
    id: "p1",
    sellerId: "s1",
    categoryId: "c1",
    price: 1000,
    oldPrice: null,
    saleStartDate: null,
    saleEndDate: null,
  };

  const baseCoupon = {
    id: "d1",
    code: "TEST10",
    name: "Kupon",
    type: DiscountType.percentage,
    value: 10,
    scope: DiscountScope.global,
    sellerId: null,
    categoryId: null,
    targetProductIds: [],
    isActive: true,
    startDate: new Date("2020-01-01"),
    endDate: new Date("2999-01-01"),
    usageLimitTotal: null,
    usageLimitPerUser: null,
    usedCount: 0,
    minCartValue: null,
    maxDiscountAmount: null,
    fundedBy: "seller",
    platformFundedRatio: null,
    target: DiscountTarget.product_price,
    audience: DiscountAudience.everyone,
    budgetLimit: null,
    budgetSpent: 0,
    budgetStoppedAt: null,
    targetTiers: [],
    targetUsers: [],
  };

  const makeService = (
    overrides: Record<string, unknown> = {},
    tier: string | null = null,
  ) => {
    const prisma = {
      discount: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...baseCoupon, ...overrides }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      discountCode: { findUnique: jest.fn() },
      discountUsage: { count: jest.fn().mockResolvedValue(0) },
      couponReservation: { count: jest.fn().mockResolvedValue(0) },
      product: { findMany: jest.fn().mockResolvedValue([product]) },
      userMembership: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            tier ? { status: "active", tier: { type: tier } } : null,
          ),
      },
    } as any;
    const cache = { delPattern: jest.fn() } as any;
    const search = { syncProduct: jest.fn() } as any;
    const pricing = new DiscountPricingService(prisma);
    return new DiscountService(
      prisma,
      new DiscountUsageService(prisma),
      new DiscountCrudService(prisma, cache, search),
      pricing,
      new DiscountCouponService(prisma, pricing),
      new DiscountTradeFeeService(prisma),
    );
  };

  const validate = (service: DiscountService, userId: string | null) =>
    service.validateCoupon(
      { code: "TEST10", cartItems: [{ productId: "p1", quantity: 1 }] },
      userId,
    );

  it("üyelik hedefli kupon misafirde giriş ister", async () => {
    const service = makeService({
      audience: DiscountAudience.membership_tiers,
      targetTiers: [{ tierType: "premium" }],
    });

    const result = await validate(service, null);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("giriş");
  });

  it("üyelik hedefli kupon hedefteki üyeye geçerlidir", async () => {
    const service = makeService(
      {
        audience: DiscountAudience.membership_tiers,
        targetTiers: [{ tierType: "premium" }],
      },
      "premium",
    );

    const result = await validate(service, "buyer-1");

    expect(result.isValid).toBe(true);
    expect(result.discount?.estimatedDiscount).toBe(100);
  });

  it("üyelik hedefli kupon başka katmandaki üyede reddedilir", async () => {
    const service = makeService(
      {
        audience: DiscountAudience.membership_tiers,
        targetTiers: [{ tierType: "premium" }],
      },
      "basic",
    );

    const result = await validate(service, "buyer-1");

    expect(result.isValid).toBe(false);
    expect(result.error).toContain("hesabınız");
  });

  it("kişiye özel kupon yalnız hedef alıcıya geçerlidir", async () => {
    const service = makeService({
      audience: DiscountAudience.specific_buyers,
      targetUsers: [{ userId: "buyer-9" }],
    });

    expect((await validate(service, "buyer-1")).isValid).toBe(false);

    const owner = makeService({
      audience: DiscountAudience.specific_buyers,
      targetUsers: [{ userId: "buyer-1" }],
    });
    expect((await validate(owner, "buyer-1")).isValid).toBe(true);
  });

  it("bütçesi dolmuş kampanyanın kuponu kabul edilmez", async () => {
    const spent = makeService({ budgetLimit: 500, budgetSpent: 500 });
    expect((await validate(spent, "buyer-1")).isValid).toBe(false);

    const stopped = makeService({
      budgetLimit: 500,
      budgetSpent: 100,
      budgetStoppedAt: new Date(),
    });
    expect((await validate(stopped, "buyer-1")).isValid).toBe(false);
  });

  it("bedel hedefli kupon ürün tabanına dokunmaz, hedefini taşır", async () => {
    const service = makeService({
      target: DiscountTarget.buyer_commission,
      budgetLimit: 1000,
      budgetSpent: 250,
    });

    const result = await validate(service, "buyer-1");

    expect(result.isValid).toBe(true);
    // Tutar burada bilinemez: bedeller fiyat hattında hesaplanır.
    expect(result.discount?.estimatedDiscount).toBe(0);
    expect(result.discount?.target).toBe(DiscountTarget.buyer_commission);
    expect(result.discount?.budgetRemaining).toBe(750);
    // Bedel kuponunun maliyeti tanımı gereği platformundur.
    expect(result.discount?.platformFundedShare).toBe(1);
  });

  it("hedefi yazılmamış eski kupon ürün fiyatı kuponu sayılır", async () => {
    const service = makeService({ target: undefined });

    const result = await validate(service, "buyer-1");

    expect(result.discount?.estimatedDiscount).toBe(100);
    expect(result.discount?.target).toBe(DiscountTarget.product_price);
  });

  it("kişi-başı limitsiz + herkese açık kod M İ S A F İ R D E çalışır", async () => {
    // usageLimitPerUser=null: giriş şartı yok — misafirin kullanabildiği tek
    // kod türü budur (Ç3 kararı).
    const service = makeService({ usageLimitPerUser: null });

    const result = await validate(service, null);

    expect(result.isValid).toBe(true);
  });

  it("kişi-başı limitli kod misafirde giriş ister", async () => {
    const service = makeService({ usageLimitPerUser: 1 });

    const result = await validate(service, null);

    expect(result).toEqual({
      isValid: false,
      error: "Bu kupon için giriş yapmanız gerekir",
    });
  });
});
