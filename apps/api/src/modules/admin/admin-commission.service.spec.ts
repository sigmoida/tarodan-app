import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCommissionService } from "./admin-commission.service";

describe("AdminCommissionService previewCommission", () => {
  const prisma = {
    commissionRule: { findMany: jest.fn() },
  };
  const service = new AdminCommissionService(
    prisma as unknown as PrismaService,
    {} as AdminAuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.commissionRule.findMany.mockResolvedValue([
      {
        id: "existing-seller-rule",
        name: "Existing seller rule",
        ruleType: CommissionRuleType.seller_type,
        categoryId: "category-1",
        sellerType: CommissionSellerType.BUSINESS,
        appliesTo: CommissionAppliesTo.SELLER,
        sellerRate: 5,
        buyerRate: null,
      },
      {
        id: "buyer-fee-rule",
        name: "Global buyer fee",
        ruleType: CommissionRuleType.default,
        categoryId: null,
        sellerType: CommissionSellerType.ALL,
        appliesTo: CommissionAppliesTo.BUYER,
        sellerRate: null,
        buyerRate: 3,
      },
    ]);
  });

  it("replaces the edited rule draft and includes the global buyer fee", async () => {
    const result = await service.previewCommission({
      amount: 1000,
      ruleId: "existing-seller-rule",
      categoryId: "category-1",
      sellerType: CommissionSellerType.BUSINESS,
      appliesTo: CommissionAppliesTo.SELLER,
      sellerRate: 8,
      isActive: true,
      previewCategoryId: "category-1",
      previewSellerType: CommissionSellerType.BUSINESS,
    });

    expect(result).toMatchObject({
      sellerFeeAmount: 80,
      buyerFeeAmount: 30,
      commissionAmount: 110,
      ruleId: "existing-seller-rule",
    });
    expect(prisma.commissionRule.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
    });
  });
});

describe("AdminCommissionService commission rule priority", () => {
  const prisma = {
    commissionRule: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    category: { findUnique: jest.fn() },
  };
  const audit = { createAuditLog: jest.fn() };
  const service = new AdminCommissionService(
    prisma as unknown as PrismaService,
    audit as unknown as AdminAuditService,
  );
  const rule = {
    id: "rule-1",
    name: "Priority rule",
    categoryId: null,
    category: null,
    sellerType: CommissionSellerType.ALL,
    appliesTo: CommissionAppliesTo.SELLER,
    sellerRate: 5,
    buyerRate: null,
    sellerMin: null,
    sellerMax: null,
    buyerMin: null,
    buyerMax: null,
    priority: 7,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    percentage: 5,
    ruleType: CommissionRuleType.default,
    minAmount: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    audit.createAuditLog.mockResolvedValue(undefined);
    // No sibling rules → no amount-range overlap (v2 multi-rule validation).
    prisma.commissionRule.findMany.mockResolvedValue([]);
  });

  it("persists and returns priority when creating a rule", async () => {
    prisma.commissionRule.findFirst.mockResolvedValue(null);
    prisma.commissionRule.create.mockResolvedValue(rule);

    const result = await service.createCommissionRule("admin-1", {
      name: rule.name,
      sellerType: CommissionSellerType.ALL,
      appliesTo: CommissionAppliesTo.SELLER,
      sellerRate: 5,
      priority: 7,
    });

    expect(prisma.commissionRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 7 }),
      }),
    );
    expect(result.priority).toBe(7);
  });

  it("persists and returns priority when updating a rule", async () => {
    prisma.commissionRule.findUnique.mockResolvedValue(rule);
    prisma.commissionRule.update.mockResolvedValue({ ...rule, priority: 10 });

    const result = await service.updateCommissionRule("admin-1", rule.id, {
      priority: 10,
    });

    expect(prisma.commissionRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 10 }),
      }),
    );
    expect(result.priority).toBe(10);
  });
});
