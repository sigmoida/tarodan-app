import { DiscountScope, DiscountType } from "@prisma/client";
import { DiscountService } from "./discount.service";

describe("DiscountService coupon pricing base", () => {
  const now = new Date();
  const product = {
    id: "product-1",
    price: 100,
    sellerId: "seller-1",
    categoryId: "category-1",
  };
  const coupon = {
    id: "coupon-1",
    code: "SAVE80",
    name: "Save 80",
    type: DiscountType.fixed_amount,
    value: 80,
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
    startDate: new Date(now.getTime() - 60_000),
    endDate: new Date(now.getTime() + 60_000),
    fundedBy: "seller",
    platformFundedRatio: null,
  };
  const automaticCampaign = {
    ...coupon,
    id: "campaign-1",
    code: null,
    name: "Half price",
    type: DiscountType.percentage,
    value: 50,
    priority: 1,
  };

  function makeService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      discount: {
        findUnique: jest.fn().mockResolvedValue({ ...coupon, ...overrides }),
        findMany: jest.fn().mockResolvedValue([automaticCampaign]),
      },
      discountCode: {
        findUnique: jest.fn(),
      },
      discountUsage: {
        count: jest.fn().mockResolvedValue(0),
      },
      couponReservation: {
        count: jest.fn().mockResolvedValue(0),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([product]),
      },
    } as any;
    return new DiscountService(
      prisma,
      { delPattern: jest.fn() } as any,
      { syncProduct: jest.fn() } as any,
    );
  }

  it("caps a coupon to the effective campaign price, not the base product price", async () => {
    const result = await makeService().validateCoupon(
      {
        code: coupon.code,
        cartItems: [{ productId: product.id, quantity: 1 }],
      },
      "buyer-1",
    );

    expect(result.isValid).toBe(true);
    expect(result.discount?.estimatedDiscount).toBe(50);
  });

  it("checks minimum cart value against the effective campaign total", async () => {
    const result = await makeService({ minCartValue: 75 }).validateCoupon(
      {
        code: coupon.code,
        cartItems: [{ productId: product.id, quantity: 1 }],
      },
      "buyer-1",
    );

    expect(result).toEqual({
      isValid: false,
      error: "Minimum sepet tutarı: 75.00 TL",
    });
  });
});
