import { DiscountScope, DiscountType } from "@prisma/client";
import { DiscountService } from "../discount.service";
import { DiscountUsageService } from "../discount-usage.service";
import { DiscountCrudService } from "../discount-crud.service";

/**
 * Kupon fiyat tabanı: kodsuz ürün-fiyatı kampanyaları KALDIRILDI — vitrin
 * fiyatını yalnız ürünün kendi indirimli satış fiyatı düşürür. Kupon matematiği
 * bu yüzden ürünün fiyatından hesaplanır; eski (legacy) kodsuz kampanya kaydı
 * aktif kalsa bile tabanı DEĞİŞTİRMEZ ve platform-fonlu eski ürün-fiyatı
 * kuponu doğrulamadan geçemez.
 */
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
  // Eski (artık tanımlanamayan) kodsuz %50 kampanyası — tabanı ETKİLEMEMELİ.
  const legacyAutomaticCampaign = {
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
        findMany: jest.fn().mockResolvedValue([legacyAutomaticCampaign]),
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
    const cache = { delPattern: jest.fn() } as any;
    const search = { syncProduct: jest.fn() } as any;
    return new DiscountService(
      prisma,
      cache,
      search,
      new DiscountUsageService(prisma),
      new DiscountCrudService(prisma, cache, search),
    );
  }

  it("legacy kodsuz kampanya kupon tabanını DEĞİŞTİRMEZ — taban ürün fiyatıdır", async () => {
    const result = await makeService().validateCoupon(
      {
        code: coupon.code,
        cartItems: [{ productId: product.id, quantity: 1 }],
      },
      "buyer-1",
    );

    expect(result.isValid).toBe(true);
    // 80 TL sabit kupon 100 TL tabana uygulanır; eski %50 kampanyası yok sayılır.
    expect(result.discount?.estimatedDiscount).toBe(80);
  });

  it("minimum sepet tutarı ürün fiyatı tabanından denetlenir", async () => {
    const result = await makeService({ minCartValue: 75 }).validateCoupon(
      {
        code: coupon.code,
        cartItems: [{ productId: product.id, quantity: 1 }],
      },
      "buyer-1",
    );

    // Taban 100 TL ≥ 75 TL: eski kampanya tabanı düşürüp reddettiremez.
    expect(result.isValid).toBe(true);
  });

  it("eski platform-fonlu ürün-fiyatı kuponu doğrulamadan GEÇEMEZ (cep kuralı)", async () => {
    const result = await makeService({ fundedBy: "platform" }).validateCoupon(
      {
        code: coupon.code,
        cartItems: [{ productId: product.id, quantity: 1 }],
      },
      "buyer-1",
    );

    expect(result).toEqual({
      isValid: false,
      error: "Bu kupon artık geçerli değil",
    });
  });

  it("paylaşımlı fonlu eski kupon da reddedilir", async () => {
    const result = await makeService({
      fundedBy: "shared",
      platformFundedRatio: 0.5,
    }).validateCoupon(
      {
        code: coupon.code,
        cartItems: [{ productId: product.id, quantity: 1 }],
      },
      "buyer-1",
    );

    expect(result.isValid).toBe(false);
  });

  describe("sepete uygunluk", () => {
    it("sepetteki hiçbir ürün kapsamda değilse kupon REDDEDİLİR", async () => {
      // Kupon aktif ve süresi geçerli ama yalnız başka bir kategoriye ait.
      // Eskiden isValid=true, indirim 0 dönüyordu: kupon "uygulandı" görünüp
      // hiçbir şey indirmiyor, kullanıcı sebebini göremiyordu.
      const service = makeService({
        scope: DiscountScope.category,
        categoryId: "baska-kategori",
      });

      const result = await service.validateCoupon(
        {
          code: coupon.code,
          cartItems: [{ productId: product.id, quantity: 1 }],
        },
        "buyer-1",
      );

      expect(result).toEqual({
        isValid: false,
        error: "Bu kupon sepetinizdeki ürünler için geçerli değil",
      });
    });

    it("en az bir ürün kapsamdaysa kupon geçerlidir", async () => {
      const service = makeService({
        scope: DiscountScope.category,
        categoryId: product.categoryId,
      });

      const result = await service.validateCoupon(
        {
          code: coupon.code,
          cartItems: [{ productId: product.id, quantity: 1 }],
        },
        "buyer-1",
      );

      expect(result.isValid).toBe(true);
      expect(result.discount?.eligibleProductIds).toEqual([product.id]);
    });
  });
});
