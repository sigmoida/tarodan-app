import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import {
  CommissionRuleSetStatus,
  CommissionSellerType,
  MembershipTierType,
  SellerType,
} from "@prisma/client";
import { OrderPricingService } from "./order-pricing.service";

const seller = {
  sellerType: SellerType.individual,
  businessStatus: null,
  companyName: null,
  taxId: null,
  membership: {
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 86400000),
    tier: { type: MembershipTierType.free, isActive: true },
  },
};

const strictRule = {
  id: "rule-1",
  ruleSetId: "set-1",
  name: "Strict",
  categoryId: "cat-1",
  sellerType: CommissionSellerType.FREE,
  minAmount: 0,
  maxAmount: null,
  buyerCommissionRate: 0,
  buyerServiceFeeRate: 0,
  sellerCommissionRate: 5,
  sellerPlatformFeeRate: 0,
  shippingBuyerShare: 100,
  shippingShares: [],
};

function service(rules: any[], hasActiveSet = true) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(seller) },
    commissionRuleSet: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          hasActiveSet
            ? { id: "set-1", status: CommissionRuleSetStatus.ACTIVE }
            : null,
        ),
    },
    commissionRule: { findMany: jest.fn().mockResolvedValue(rules) },
  };
  return new OrderPricingService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe("OrderPricingService strict fail-closed", () => {
  it("fails without an active set", async () => {
    await expect(
      service([], false).calculateCommission(100, "seller-1", "cat-1"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("fails when the exact rule is missing", async () => {
    await expect(
      service([]).calculateCommission(100, "seller-1", "cat-1"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("returns one rule for both buyer and seller", async () => {
    const result = await service([strictRule]).calculateCommission(
      100,
      "seller-1",
      "cat-1",
    );
    expect(result.ruleId).toBe("rule-1");
    expect(result.sellerRuleId).toBe("rule-1");
    expect(result.buyerRuleId).toBe("rule-1");
  });

  it("returns a business conflict when an approved corporate seller's BUSINESS term expired", async () => {
    const instance = service([strictRule]) as any;
    instance.prisma.user.findUnique.mockResolvedValue({
      sellerType: SellerType.verified,
      businessStatus: "approved",
      companyName: "ACME",
      taxId: "123",
      membership: {
        status: "active",
        currentPeriodEnd: new Date(Date.now() - 1000),
        tier: { type: MembershipTierType.business, isActive: true },
      },
    });
    await expect(
      instance.calculateCommission(100, "seller-1", "cat-1"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SELLER_SALES_SUSPENDED" }),
    });
    await expect(
      instance.calculateCommission(100, "seller-1", "cat-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects checkout when the quote's commission set was replaced", async () => {
    const instance = service([strictRule]);
    await expect(
      instance.resolveCommissionRuleSetSnapshot("old-set", 1, true),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
