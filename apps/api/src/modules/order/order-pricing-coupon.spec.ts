import { BadRequestException } from "@nestjs/common";
import { ProductKind, ProductStatus } from "@prisma/client";
import { OrderPricingService } from "./order-pricing.service";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";
import { testTaxPolicy } from "./testing/tax-policy-fixture";
import { testPriceResolver } from "../discount/testing/price-resolver-fixture";
import { DiscountService } from "../discount/discount.service";
import { DiscountScopeService } from "../discount/discount-scope.service";

describe("OrderPricingService.getCheckoutQuote coupon contract", () => {
  const product = {
    id: "product-1",
    title: "Test product",
    price: 100,
    sellerId: "seller-1",
    categoryId: "category-1",
    kind: ProductKind.listing,
    status: ProductStatus.active,
    seller: { businessStatus: null, taxId: null },
  };

  function makeService(validation: Record<string, unknown>) {
    const prisma = {
      commissionRuleSet: {
        findFirst: jest.fn().mockResolvedValue({ id: "set-1" }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([product]),
      },
    } as any;
    // GERÇEK DiscountService: quote'un çağırdığı `allocateCoupon` (doğrula +
    // uygun satırlara dağıt) gerçek koddan çalışsın, yalnız doğrulama sonucu
    // sabitlensin. Sahte bir allocateCoupon dağıtımı hiç ölçmezdi.
    const discountService = new DiscountService(
      prisma,
      { delPattern: jest.fn() } as any,
      { syncProduct: jest.fn() } as any,
      testPriceResolver(),
      new DiscountScopeService(prisma),
    );
    jest
      .spyOn(discountService, "validateCoupon")
      .mockResolvedValue(validation as any);
    const service = new OrderPricingService(
      prisma,
      {
        resolveTaxRate: jest.fn(),
        calculateTaxAmount: jest.fn(),
      } as any,
      {
        getActiveTariffSnapshot: jest.fn().mockResolvedValue({
          tariffId: "tariff-1",
          tariffVersion: 1,
          tariff: {
            freeShippingEnabled: true,
            freeShippingThreshold: 0,
            packageTiers: flatPackageTiers(0),
          },
        }),
      } as any,
      discountService,
      testPriceResolver(),
      testTaxPolicy(),
    );
    jest.spyOn(service, "calculateCommission").mockResolvedValue({
      buyerFeeAmount: 0,
      sellerFeeAmount: 0,
      shippingBuyerShare: 100,
      shippingBuyerShares: { small: 100, medium: 100, large: 100 },
    } as any);
    return { service, discountService };
  }

  it("validates an authenticated quote with the current user id", async () => {
    const { service, discountService } = makeService({
      isValid: true,
      discount: {
        id: "discount-1",
        estimatedDiscount: 20,
        eligibleProductIds: [product.id],
      },
    });

    const quote = await service.getCheckoutQuote(
      {
        items: [{ productId: product.id, quantity: 1 }],
        couponCode: "SAVE20",
      },
      "buyer-1",
    );

    // Üçüncü argüman: kuponun YETKİLİ matrahı (satırın tahsil edilecek tutarı).
    // Katalog fiyatı yerine bunun geçilmesi, teklif gibi fiyatı dışarıdan gelen
    // yollarda kuponun tahsil edilen bedeli aşmasını engelleyen sözleşmedir.
    expect(discountService.validateCoupon).toHaveBeenCalledWith(
      {
        code: "SAVE20",
        cartItems: [{ productId: product.id, quantity: 1 }],
      },
      "buyer-1",
      new Map([[product.id, 100]]),
    );
    expect(quote.couponDiscount).toBe(20);
    expect(quote.totalAmount).toBe(80);
  });

  it("rejects an explicitly supplied invalid coupon instead of quoting full price", async () => {
    const { service } = makeService({
      isValid: false,
      error: "Bu kuponu zaten kullandınız",
    });

    await expect(
      service.getCheckoutQuote(
        {
          items: [{ productId: product.id, quantity: 1 }],
          couponCode: "USED",
        },
        "buyer-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
