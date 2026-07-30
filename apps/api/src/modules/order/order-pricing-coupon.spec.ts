import { BadRequestException } from "@nestjs/common";
import { ProductStatus } from "@prisma/client";
import { OrderPricingService } from "./order-pricing.service";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";

describe("OrderPricingService.getCheckoutQuote coupon contract", () => {
  const product = {
    id: "product-1",
    title: "Test product",
    price: 100,
    sellerId: "seller-1",
    categoryId: null,
    status: ProductStatus.active,
    seller: { businessStatus: "pending", taxId: null },
  };

  function makeService(validation: Record<string, unknown>) {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
      },
    } as any;
    const discountService = {
      getEffectiveDisplayPrice: jest.fn().mockResolvedValue(null),
      validateCoupon: jest.fn().mockResolvedValue(validation),
    } as any;
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
            outboundPackageFee: 0,
            freeShippingEnabled: true,
            freeShippingThreshold: 0,
            packageTiers: flatPackageTiers(0),
          },
        }),
      } as any,
      discountService,
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

    expect(discountService.validateCoupon).toHaveBeenCalledWith(
      {
        code: "SAVE20",
        cartItems: [{ productId: product.id, quantity: 1 }],
      },
      "buyer-1",
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
