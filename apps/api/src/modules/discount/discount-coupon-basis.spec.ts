import { DiscountScope, DiscountType } from "@prisma/client";
import { DiscountService } from "./discount.service";
import { DiscountScopeService } from "./discount-scope.service";
import { testPriceResolver } from "./testing/price-resolver-fixture";

/**
 * Kuponun matrahı, ÇAĞIRANIN tahsil edeceği satır tutarıdır.
 *
 * Regresyon: allocateCoupon doğrulamayı katalog/kampanya fiyatı üzerinden
 * yaptırıyordu. Kabul edilmiş teklifle alınan bir üründe tahsil edilen tutar
 * teklif bedeliyken (20 TL), kupon 100 TL'lik katalog fiyatı üzerinden
 * hesaplanıyor ve indirim tahsil edilen bedeli aşabiliyordu. Platform-fonlu
 * kuponda bu, satıcıya teklif tutarından FAZLA hakediş demekti.
 */
describe("DiscountService.allocateCoupon — matrah", () => {
  const product = {
    id: "product-1",
    price: 100,
    sellerId: "seller-1",
    categoryId: "category-1",
  };

  const makeService = (coupon: Record<string, unknown>) => {
    const prisma = {
      discount: {
        findUnique: jest.fn().mockResolvedValue({
          id: "coupon-1",
          code: "SAVE50",
          name: "50 TL indirim",
          type: DiscountType.fixed_amount,
          value: 50,
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
          fundedBy: "seller",
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

  const offerLine = [{ productId: "product-1", quantity: 1, lineSubtotal: 20 }];

  it("sabit kupon KATALOG fiyatına değil, çağıranın satır tutarına kırpılır", async () => {
    const { coupon } = await makeService({}).allocateCoupon(
      "SAVE50",
      offerLine,
      "buyer-1",
    );

    // 100 TL katalog değil, 20 TL teklif tutarı esas alınır.
    expect(coupon?.total).toBe(20);
    expect(coupon?.shares).toEqual([20]);
  });

  it("yüzde kupon da teklif tutarı üzerinden hesaplanır", async () => {
    const { coupon } = await makeService({
      type: DiscountType.percentage,
      value: 25,
    }).allocateCoupon("SAVE50", offerLine, "buyer-1");

    // 20 TL'nin %25'i = 5 TL (100 TL'nin %25'i = 25 TL DEĞİL).
    expect(coupon?.total).toBe(5);
  });

  it("platform payı hiçbir zaman tahsil edilen tutarı aşamaz", async () => {
    const { coupon } = await makeService({
      fundedBy: "platform",
    }).allocateCoupon("SAVE50", offerLine, "buyer-1");

    const platformFunded =
      (coupon?.total ?? 0) * (coupon?.platformFundedShare ?? 0);
    expect(coupon?.platformFundedShare).toBe(1);
    expect(platformFunded).toBeLessThanOrEqual(20);
  });

  it("shared kuponda platform payı oranı korunur ve taban aşılmaz", async () => {
    const { coupon } = await makeService({
      fundedBy: "shared",
      platformFundedRatio: 0.3,
    }).allocateCoupon("SAVE50", offerLine, "buyer-1");

    expect(coupon?.platformFundedShare).toBe(0.3);
    expect((coupon?.total ?? 0) * 0.3).toBeCloseTo(6, 2);
  });

  it("minimum sepet tutarı da yetkili tutarla karşılaştırılır", async () => {
    // Katalog 100 TL eşiği geçerdi; tahsil edilen 20 TL geçmez.
    const { coupon, error } = await makeService({
      minCartValue: 50,
    }).allocateCoupon("SAVE50", offerLine, "buyer-1");

    expect(coupon).toBeNull();
    expect(error).toContain("Minimum sepet tutarı");
  });

  it("katalog fiyatından alışverişte davranış değişmez", async () => {
    const { coupon } = await makeService({}).allocateCoupon(
      "SAVE50",
      [{ productId: "product-1", quantity: 1, lineSubtotal: 100 }],
      "buyer-1",
    );

    expect(coupon?.total).toBe(50);
  });

  it("aynı ürün birden çok satırdaysa matrah toplanır", async () => {
    const { coupon } = await makeService({ value: 30 }).allocateCoupon(
      "SAVE50",
      [
        { productId: "product-1", quantity: 1, lineSubtotal: 20 },
        { productId: "product-1", quantity: 1, lineSubtotal: 20 },
      ],
      "buyer-1",
    );

    expect(coupon?.total).toBe(30);
    expect(coupon?.shares).toEqual([15, 15]);
  });
});
