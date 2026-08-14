import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { CommissionRuleSetStatus, CommissionSellerType } from "@prisma/client";
import { AdminCommissionService } from "./admin-commission.service";

const draft = {
  id: "draft-1",
  name: "Draft",
  version: 2,
  status: CommissionRuleSetStatus.DRAFT,
};

const dto = {
  name: "Cat Free",
  categoryId: "cat-1",
  sellerType: CommissionSellerType.FREE,
  minAmount: 0,
  maxAmount: null,
  buyerCommissionRate: 0,
  buyerServiceFeeRate: 0,
  sellerCommissionRate: 0,
  sellerPlatformFeeRate: 0,
  tradeFeeSellerAmount: 20,
  tradeFeeBuyerAmount: 15,
  shippingBuyerShare: 100,
};

function setup() {
  const prisma: any = {
    commissionRuleSet: {
      findFirst: jest.fn().mockResolvedValue(draft),
      findUnique: jest.fn().mockResolvedValue(draft),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ ...draft, status: "ACTIVE" }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    commissionRule: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: "rule-1",
        ...data,
        shippingShares: [],
        category: { id: "cat-1", name: "Category" },
        ruleSet: draft,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
    },
    category: {
      findMany: jest.fn().mockResolvedValue([{ id: "cat-1", name: "Cat" }]),
    },
  };
  prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
  const audit = { createRequiredAuditLog: jest.fn().mockResolvedValue(null) };
  return {
    service: new AdminCommissionService(prisma, audit as any),
    prisma,
  };
}

describe("AdminCommissionService strict sets", () => {
  it("loads an exact historical rule without resolving the current draft", async () => {
    const { service, prisma } = setup();
    prisma.commissionRule.findUnique.mockResolvedValue({
      id: "active-rule-1",
      ruleSetId: "active-1",
      ...dto,
      category: { id: "cat-1", name: "Category" },
      shippingShares: [],
      ruleSet: {
        id: "active-1",
        name: "Published v1",
        version: 1,
        status: CommissionRuleSetStatus.ACTIVE,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.getCommissionRule("active-rule-1");

    expect(prisma.commissionRule.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "active-rule-1" } }),
    );
    expect(result).toMatchObject({
      id: "active-rule-1",
      ruleSet: { id: "active-1", status: CommissionRuleSetStatus.ACTIVE },
    });
  });

  it("returns not found for a missing historical rule", async () => {
    const { service, prisma } = setup();
    prisma.commissionRule.findUnique.mockResolvedValue(null);

    await expect(service.getCommissionRule("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("allows an explicit all-zero rule in a draft", async () => {
    const { service, prisma } = setup();
    const result = await service.createCommissionRule("admin", dto);
    expect(result.ruleSetId).toBe("draft-1");
    expect(result.sellerCommissionRate).toBe(0);
    expect(prisma.commissionRule.create).toHaveBeenCalled();
  });

  it("rejects a non-increasing half-open interval", async () => {
    const { service } = setup();
    await expect(
      service.createCommissionRule("admin", {
        ...dto,
        minAmount: 5000,
        maxAmount: 5000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a positive floor when its percentage rate is zero", async () => {
    const { service } = setup();
    await expect(
      service.createCommissionRule("admin", {
        ...dto,
        buyerServiceFeeRate: 0,
        buyerServiceFeeMin: 25,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not allow editing an active rule set", async () => {
    const { service, prisma } = setup();
    prisma.commissionRule.findUnique.mockResolvedValue({
      id: "rule-1",
      ruleSetId: "active-1",
      ruleSet: { status: CommissionRuleSetStatus.ACTIVE },
      shippingShares: [],
      ...dto,
    });
    prisma.commissionRuleSet.findUnique.mockResolvedValue({
      id: "active-1",
      status: CommissionRuleSetStatus.ACTIVE,
    });
    await expect(
      service.updateCommissionRule("admin", "rule-1", { name: "new" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reports missing category/seller axes as publish blockers", async () => {
    const { service } = setup();
    const validation = await service.validateCommissionRuleSet("draft-1");
    expect(validation.valid).toBe(false);
    expect(validation.errors).toHaveLength(4);
  });

  it("uses the same rounded amount for preview prefilter and strict matching", async () => {
    const { service, prisma } = setup();
    const upperRule = {
      id: "rule-upper",
      ruleSetId: draft.id,
      ...dto,
      minAmount: 1000,
      maxAmount: 5000,
      shippingShares: [],
    };
    prisma.commissionRule.findMany.mockImplementation(({ where }: any) => {
      expect(where.minAmount).toEqual({ lte: 1000 });
      expect(where.OR).toEqual([
        { maxAmount: null },
        { maxAmount: { gt: 1000 } },
      ]);
      return Promise.resolve([upperRule]);
    });

    const result = await service.previewCommission({
      categoryId: "cat-1",
      sellerType: CommissionSellerType.FREE,
      amount: 999.996,
    });

    expect(result.ruleId).toBe("rule-upper");
    expect(result.matchedAmount).toBe(1000);
    expect(result.calculationAmount).toBe(999.996);
  });

  it("publishes complete 0-to-infinity coverage atomically", async () => {
    const { service, prisma } = setup();
    prisma.commissionRule.findMany.mockResolvedValue(
      Object.values(CommissionSellerType).map((sellerType) => ({
        id: `rule-${sellerType}`,
        categoryId: "cat-1",
        sellerType,
        minAmount: 0,
        maxAmount: null,
      })),
    );
    const result = await service.publishCommissionRuleSet("admin", "draft-1");
    expect(result.validation.valid).toBe(true);
    expect(prisma.commissionRuleSet.updateMany).toHaveBeenCalled();
    expect(prisma.commissionRuleSet.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "draft-1" } }),
    );
  });

  it("surfaces a database overlap violation as conflict", async () => {
    const { service, prisma } = setup();
    prisma.commissionRule.create.mockRejectedValue(
      new Error("commission_rules_no_overlap"),
    );
    await expect(
      service.createCommissionRule("admin", dto),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
