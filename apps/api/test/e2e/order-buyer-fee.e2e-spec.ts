import { PrismaService } from "../../src/prisma";
import { OrderService } from "../../src/modules/order/order.service";
import { OrderPricingService } from "../../src/modules/order/order-pricing.service";
import {
  disconnectPrisma,
  getPrisma,
  seedBaseline,
  truncateAll,
} from "../test-utils/db";
import { testTaxPolicy } from "../../src/modules/order/testing/tax-policy-fixture";

describe("strict order commission (E2E)", () => {
  let prisma: PrismaService;
  let sellerId: string;
  let categoryId: string;

  function orderService() {
    const pricing = new OrderPricingService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      testTaxPolicy(),
    );
    return new OrderService(pricing, {} as any, {} as any, {} as any);
  }

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;
  });
  afterAll(disconnectPrisma);

  beforeEach(async () => {
    await truncateAll();
    categoryId = (await seedBaseline()).categoryId;
    sellerId = (
      await prisma.user.create({
        data: {
          email: `seller-${Date.now()}-${Math.random()}@test.local`,
          passwordHash: "x",
          displayName: "Seller",
          isSeller: true,
          sellerType: "individual",
        },
      })
    ).id;
  });

  it("fails closed when the exact rule is missing", async () => {
    await prisma.commissionRule.delete({
      where: { id: "default-rule-FREE" },
    });
    await expect(
      orderService().calculateCommission(1000, sellerId, categoryId),
    ).rejects.toThrow();
  });

  it("one rule supplies both buyer and seller fees", async () => {
    await prisma.commissionRule.update({
      where: { id: "default-rule-FREE" },
      data: {
        buyerCommissionRate: 1,
        buyerServiceFeeRate: 2,
        sellerCommissionRate: 5,
        sellerPlatformFeeRate: 1,
      },
    });
    const result = await orderService().calculateCommission(
      1000,
      sellerId,
      categoryId,
    );
    expect(result.buyerFeeAmount).toBe(30);
    expect(result.sellerFeeAmount).toBe(60);
    expect(result.sellerRuleId).toBe(result.buyerRuleId);
  });

  it("applies buyer fee floor and cap", async () => {
    await prisma.commissionRule.update({
      where: { id: "default-rule-FREE" },
      data: {
        buyerServiceFeeRate: 3,
        buyerServiceFeeMin: 5,
        buyerServiceFeeMax: 50,
      },
    });
    expect(
      (await orderService().calculateCommission(100, sellerId, categoryId))
        .buyerServiceFeeAmount,
    ).toBe(5);
    expect(
      (await orderService().calculateCommission(10000, sellerId, categoryId))
        .buyerServiceFeeAmount,
    ).toBe(50);
  });

  it("accepts explicit zero commission without fallback", async () => {
    await prisma.commissionRule.update({
      where: { id: "default-rule-FREE" },
      data: { sellerCommissionRate: 0 },
    });
    const result = await orderService().calculateCommission(
      1000,
      sellerId,
      categoryId,
    );
    expect(result.commissionAmount).toBe(0);
    expect(result.ruleId).toBe("default-rule-FREE");
  });

  it("selects the upper band exactly at its lower bound", async () => {
    await prisma.commissionRule.delete({ where: { id: "default-rule-FREE" } });
    await prisma.commissionRule.createMany({
      data: [
        {
          id: "low",
          ruleSetId: "test-commission-set-v1",
          name: "Low",
          categoryId,
          sellerType: "FREE",
          minAmount: 0,
          maxAmount: 500,
          sellerCommissionRate: 1,
        },
        {
          id: "high",
          ruleSetId: "test-commission-set-v1",
          name: "High",
          categoryId,
          sellerType: "FREE",
          minAmount: 500,
          maxAmount: null,
          sellerCommissionRate: 10,
        },
      ],
    });
    const result = await orderService().calculateCommission(
      500,
      sellerId,
      categoryId,
    );
    expect(result.ruleId).toBe("high");
    expect(result.sellerFeeAmount).toBe(50);
  });
});
