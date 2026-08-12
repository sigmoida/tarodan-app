import { DiscountTarget, DiscountType } from "@prisma/client";
import { OrderFeeDiscountService } from "./order-fee-discount.service";

/**
 * Bedel indirimi sipariş kalemlerine uygulanırken TÜRETİLMİŞ toplamlar da
 * yeniden kurulmalıdır: `buyerFeeAmount` alıcı toplamının, `sellerFeeAmount`
 * payout'un girdisidir. Kırılım inip toplam eski kalırsa alıcıdan indirimsiz
 * tahsil edilir ya da satıcıya eksik ödenir.
 */
describe("OrderFeeDiscountService.apply", () => {
  const commission = {
    buyerFeeAmount: 60,
    sellerFeeAmount: 100,
    commissionAmount: 160,
    buyerCommissionAmount: 40,
    buyerServiceFeeAmount: 20,
    sellerCommissionAmount: 80,
    sellerPlatformFeeAmount: 20,
    shippingBuyerShare: 100,
    shippingBuyerShares: {} as any,
    ruleSetId: "rs-1",
    ruleId: "r-1",
    ruleName: "kural",
    matchedCategoryId: "c1",
    matchedSellerType: "FREE" as any,
    matchedAmount: 1000,
    sellerRuleId: "r-1",
    buyerRuleId: "r-1",
    appliedRate: 0,
    wasMinApplied: false,
    wasMaxApplied: false,
    effectiveMembershipTier: "basic" as any,
  };

  const makeService = (candidates: any[]) => {
    const resolver = {
      loadActive: jest.fn().mockResolvedValue([]),
      selectFor: jest.fn().mockReturnValue(candidates),
    };
    return new OrderFeeDiscountService(resolver as any, undefined as any);
  };

  const context = {
    productId: "p1",
    categoryId: "c1",
    sellerId: "s1",
    buyerId: "b1",
  };

  it("alıcı komisyonu indirimi alıcı toplamlarını düşürür, satıcıya dokunmaz", async () => {
    const service = makeService([
      {
        id: "d1",
        name: "Komisyonsuz",
        target: DiscountTarget.buyer_commission,
        type: DiscountType.percentage,
        value: 100,
      },
    ]);

    const result = await service.apply({
      context,
      commission: commission as any,
      buyerShippingAmount: 100,
      sellerShippingAmount: 0,
    });

    expect(result.commission.buyerCommissionAmount).toBe(0);
    expect(result.commission.buyerFeeAmount).toBe(20);
    expect(result.commission.sellerFeeAmount).toBe(100);
    expect(result.commission.commissionAmount).toBe(120);
    expect(result.buyerTotal).toBe(40);
    expect(result.sellerTotal).toBe(0);
  });

  it("satıcı komisyonu indirimi payout tabanını yükseltir, alıcıya dokunmaz", async () => {
    const service = makeService([
      {
        id: "d2",
        name: "Premium satıcı",
        target: DiscountTarget.seller_commission,
        type: DiscountType.percentage,
        value: 25,
      },
    ]);

    const result = await service.apply({
      context,
      commission: commission as any,
      buyerShippingAmount: 100,
      sellerShippingAmount: 0,
    });

    expect(result.commission.sellerCommissionAmount).toBe(60);
    expect(result.commission.sellerFeeAmount).toBe(80);
    expect(result.commission.buyerFeeAmount).toBe(60);
    expect(result.sellerTotal).toBe(20);
    expect(result.buyerTotal).toBe(0);
  });

  it("kargo indirimi kargo payından iner", async () => {
    const service = makeService([
      {
        id: "d3",
        name: "Kargo bedava",
        target: DiscountTarget.buyer_shipping,
        type: DiscountType.percentage,
        value: 100,
      },
    ]);

    const result = await service.apply({
      context,
      commission: commission as any,
      buyerShippingAmount: 100,
      sellerShippingAmount: 0,
    });

    expect(result.buyerShippingAmount).toBe(0);
    expect(result.buyerTotal).toBe(100);
  });

  it("aday yoksa hiçbir tutar değişmez", async () => {
    const service = makeService([]);

    const result = await service.apply({
      context,
      commission: commission as any,
      buyerShippingAmount: 100,
      sellerShippingAmount: 0,
    });

    expect(result.commission).toBe(commission);
    expect(result.applied).toHaveLength(0);
    expect(result.buyerShippingAmount).toBe(100);
  });

  it("kampanya çözülemezse sipariş indirimsiz akar", async () => {
    const resolver = {
      loadActive: jest.fn().mockRejectedValue(new Error("db down")),
      selectFor: jest.fn(),
    };
    const service = new OrderFeeDiscountService(
      resolver as any,
      undefined as any,
    );

    const result = await service.apply({
      context,
      commission: commission as any,
      buyerShippingAmount: 100,
      sellerShippingAmount: 0,
    });

    expect(result.applied).toHaveLength(0);
    expect(result.commission.buyerFeeAmount).toBe(60);
  });

  it("satıcının katmanı komisyon sonucundan okunur (ek sorgu yok)", async () => {
    const resolver = {
      loadActive: jest.fn().mockResolvedValue([]),
      selectFor: jest.fn().mockReturnValue([]),
    };
    const service = new OrderFeeDiscountService(
      resolver as any,
      undefined as any,
    );

    await service.apply({
      context,
      commission: commission as any,
      buyerShippingAmount: 0,
      sellerShippingAmount: 0,
    });

    expect(resolver.selectFor).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ sellerTier: "basic" }),
    );
  });
});
