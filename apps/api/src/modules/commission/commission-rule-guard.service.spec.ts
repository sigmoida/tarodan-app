import { ConflictException } from "@nestjs/common";
import { CommissionSellerType, CommissionRuleSetStatus } from "@prisma/client";
import { CommissionRuleGuardService } from "./commission-rule-guard.service";

describe("CommissionRuleGuardService", () => {
  const seller = {
    sellerType: "individual",
    businessStatus: null,
    companyName: null,
    taxId: null,
    membership: null,
  };
  const rule = {
    id: "rule-1",
    ruleSetId: "set-1",
    name: "Araba / Free / 0-1000",
    categoryId: "category-1",
    sellerType: CommissionSellerType.FREE,
    minAmount: 0,
    maxAmount: 1000,
  };

  const makeService = (rules: (typeof rule)[]) => {
    const prisma = {
      commissionRuleSet: {
        findFirst: jest.fn().mockResolvedValue({ id: "set-1" }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(seller) },
      commissionRule: { findMany: jest.fn().mockResolvedValue(rules) },
    };
    return {
      service: new CommissionRuleGuardService(prisma as never),
      prisma,
    };
  };

  it("accepts a listing only when exactly one active rule matches", async () => {
    const { service, prisma } = makeService([rule]);

    await expect(
      service.assertListingRuleExists({
        sellerId: "seller-1",
        categoryId: "category-1",
        amount: 999.99,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.commissionRuleSet.findFirst).toHaveBeenCalledWith({
      where: { status: CommissionRuleSetStatus.ACTIVE },
      select: { id: true },
    });
    expect(prisma.commissionRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ruleSetId: "set-1",
          categoryId: "category-1",
          sellerType: CommissionSellerType.FREE,
          minAmount: { lte: 999.99 },
        }),
      }),
    );
  });

  it.each([
    ["no match", []],
    ["multiple matches", [rule, { ...rule, id: "rule-2" }]],
  ])("rejects %s without a silent fallback", async (_label, rules) => {
    const { service } = makeService(rules as (typeof rule)[]);

    let thrown: unknown;
    try {
      await service.assertListingRuleExists({
        sellerId: "seller-1",
        categoryId: "category-1",
        amount: 500,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect((thrown as ConflictException).getResponse()).toEqual(
      expect.objectContaining({
        code: "LISTING_COMMISSION_RULE_UNAVAILABLE",
        details: expect.objectContaining({
          categoryId: "category-1",
          sellerType: CommissionSellerType.FREE,
          matchCount: rules.length,
        }),
      }),
    );
  });
});
