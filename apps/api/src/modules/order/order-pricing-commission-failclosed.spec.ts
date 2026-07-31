import { ServiceUnavailableException } from "@nestjs/common";
import { OrderPricingService } from "./order-pricing.service";
import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  CommissionTaxpayerType,
} from "@prisma/client";
import { testTaxPolicy } from "./testing/tax-policy-fixture";

/**
 * BLOCKER: `calculateCommission` fail-closed guard'ı `result.ruleId`'ye bakıyordu.
 * `ruleId = sellerMatch ?? buyerMatch` olduğu için, satıcı tarafında eşleşen kural
 * yokken yalnız global bir ALICI ücreti kuralı eşleşirse guard geçiyor ve sipariş
 * `sellerFeeAmount = 0` ile oluşuyordu → platform komisyon geliri sessizce sıfır.
 */
describe("OrderPricingService.calculateCommission — seller-side fail closed", () => {
  const seller = {
    sellerType: null,
    businessStatus: null,
    companyName: null,
    taxId: null,
    membership: null,
  };

  const makeService = (rules: any[]) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(seller) },
      commissionRule: { findMany: jest.fn().mockResolvedValue(rules) },
    };
    return new OrderPricingService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      testTaxPolicy(),
    );
  };

  const rule = (over: Partial<any> = {}): any => ({
    id: "r1",
    name: "Rule",
    ruleType: CommissionRuleType.default,
    appliesTo: CommissionAppliesTo.BOTH,
    categoryId: null,
    sellerType: CommissionSellerType.ALL,
    taxpayerType: CommissionTaxpayerType.all,
    minAmount: null,
    maxAmount: null,
    priority: 0,
    isActive: true,
    percentage: null,
    sellerRate: 10,
    buyerRate: 2,
    ...over,
  });

  it("yalnız alıcı-taraflı kural eşleşirse 503 ile fail-closed olur", async () => {
    const service = makeService([
      rule({ id: "buyer-only", appliesTo: CommissionAppliesTo.BUYER }),
    ]);

    await expect(service.calculateCommission(100, "s1", null)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("hiç kural eşleşmezse 503 ile fail-closed olur (mevcut davranış korunur)", async () => {
    const service = makeService([]);

    await expect(service.calculateCommission(100, "s1", null)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("satıcı tarafı eşleşirse komisyon hesaplanır", async () => {
    const service = makeService([rule()]);

    const result = await service.calculateCommission(100, "s1", null);

    expect(result.sellerFeeAmount).toBe(10);
    expect(result.buyerFeeAmount).toBe(2);
    expect(result.sellerRuleId).toBe("r1");
  });

  it("satıcı tarafı eşleşip oran 0 ise komisyonsuz geçer (açık yapılandırma)", async () => {
    // Promosyonel 0 komisyon, kuralın YOKLUĞU ile değil AÇIKÇA sıfır oranla ifade edilir.
    const service = makeService([rule({ sellerRate: 0 })]);

    const result = await service.calculateCommission(100, "s1", null);

    expect(result.sellerFeeAmount).toBe(0);
    expect(result.sellerRuleId).toBe("r1");
  });
});
