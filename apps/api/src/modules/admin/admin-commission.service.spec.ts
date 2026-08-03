import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  CommissionTaxpayerType,
  ShippingPackageTierCode,
} from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
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
  const audit = { createRequiredAuditLog: jest.fn() };
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
    audit.createRequiredAuditLog.mockResolvedValue(undefined);
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

/**
 * Çakışma denetimi motorla AYNI belirsizlik tanımını kullanmalı: motor satıcı
 * tarafında SELLER ve BOTH kurallarını, alıcı tarafında BUYER ve BOTH
 * kurallarını BİRLİKTE değerlendirir; null/ALL/all ise joker eş anlamlılarıdır.
 * Guard yalnız birebir aynı appliesTo/eksen değerini karşılaştırırsa, aynı
 * özgüllükte iki kural yan yana yaşar ve seçim DB satır sırasına kalır.
 */
describe("AdminCommissionService overlap guard — appliesTo & wildcard aliases", () => {
  const prisma = {
    commissionRule: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { createRequiredAuditLog: jest.fn() };
  const service = new AdminCommissionService(
    prisma as unknown as PrismaService,
    audit as unknown as AdminAuditService,
  );

  const existingBoth = {
    id: "existing-both",
    categoryId: "category-1",
    sellerType: CommissionSellerType.FREE,
    taxpayerType: CommissionTaxpayerType.all,
    appliesTo: CommissionAppliesTo.BOTH,
    minAmount: null,
    maxAmount: null,
    isActive: true,
  };

  const draft = {
    name: "Draft",
    categoryId: "category-1",
    sellerType: CommissionSellerType.FREE,
    appliesTo: CommissionAppliesTo.SELLER,
    sellerRate: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    audit.createRequiredAuditLog.mockResolvedValue(undefined);
    prisma.commissionRule.findMany.mockResolvedValue([existingBoth]);
    prisma.commissionRule.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        ...data,
        id: "new-rule",
        category: null,
        shippingShares: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );
  });

  it("rejects a SELLER rule overlapping an existing BOTH rule on the same axes", async () => {
    await expect(
      service.createCommissionRule("admin-1", { ...draft }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a BUYER rule overlapping an existing BOTH rule on the same axes", async () => {
    await expect(
      service.createCommissionRule("admin-1", {
        ...draft,
        appliesTo: CommissionAppliesTo.BUYER,
        sellerRate: undefined,
        buyerRate: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("allows a SELLER rule next to an existing BUYER rule (sides don't meet)", async () => {
    prisma.commissionRule.findMany.mockResolvedValue([
      { ...existingBoth, appliesTo: CommissionAppliesTo.BUYER },
    ]);

    await expect(
      service.createCommissionRule("admin-1", { ...draft }),
    ).resolves.toMatchObject({ id: "new-rule" });
  });

  it("treats sellerType null and ALL as the same wildcard", async () => {
    prisma.commissionRule.findMany.mockResolvedValue([
      {
        ...existingBoth,
        sellerType: null,
        appliesTo: CommissionAppliesTo.SELLER,
      },
    ]);

    await expect(
      service.createCommissionRule("admin-1", {
        ...draft,
        sellerType: CommissionSellerType.ALL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("treats taxpayerType null and `all` as the same wildcard", async () => {
    prisma.commissionRule.findMany.mockResolvedValue([
      {
        ...existingBoth,
        taxpayerType: null,
        appliesTo: CommissionAppliesTo.SELLER,
      },
    ]);

    await expect(
      service.createCommissionRule("admin-1", {
        ...draft,
        taxpayerType: CommissionTaxpayerType.all,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("allows different SPECIFIC taxpayer types side by side", async () => {
    prisma.commissionRule.findMany.mockResolvedValue([
      {
        ...existingBoth,
        taxpayerType: CommissionTaxpayerType.corporate,
      },
    ]);

    await expect(
      service.createCommissionRule("admin-1", {
        ...draft,
        taxpayerType: CommissionTaxpayerType.individual,
      }),
    ).resolves.toMatchObject({ id: "new-rule" });
  });

  it("allows a category-specific rule next to a category wildcard (specificity resolves)", async () => {
    prisma.commissionRule.findMany.mockResolvedValue([
      { ...existingBoth, categoryId: null },
    ]);

    await expect(
      service.createCommissionRule("admin-1", { ...draft }),
    ).resolves.toMatchObject({ id: "new-rule" });
  });

  it("still allows non-overlapping amount ranges on identical axes", async () => {
    prisma.commissionRule.findMany.mockResolvedValue([
      { ...existingBoth, minAmount: 0, maxAmount: 1000 },
    ]);

    await expect(
      service.createCommissionRule("admin-1", {
        ...draft,
        appliesTo: CommissionAppliesTo.BOTH,
        minAmount: 1000.01,
        maxAmount: undefined,
      }),
    ).resolves.toMatchObject({ id: "new-rule" });
  });
});

/**
 * Nested `deleteMany` yalnızca UPDATE'te geçerlidir; create payload'ında Prisma
 * bunu `PrismaClientValidationError` ile reddeder (kural oluşturma 500 verirdi).
 * Silinecek satır da yoktur — create yalnız `create` göndermeli.
 */
describe("AdminCommissionService shippingShares nested write shape", () => {
  const prisma = {
    commissionRule: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { createRequiredAuditLog: jest.fn() };
  const service = new AdminCommissionService(
    prisma as unknown as PrismaService,
    audit as unknown as AdminAuditService,
  );

  const shippingShares = [
    { tierCode: ShippingPackageTierCode.small, buyerShare: 50 },
  ];

  const catchAll = {
    id: "catch-all",
    name: "Catch all",
    categoryId: null,
    sellerType: null,
    taxpayerType: null,
    appliesTo: CommissionAppliesTo.BOTH,
    minAmount: null,
    maxAmount: null,
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    audit.createRequiredAuditLog.mockResolvedValue(undefined);
    prisma.commissionRule.findMany.mockResolvedValue([catchAll]);
    const echo = ({ data }: any) =>
      Promise.resolve({
        ...data,
        id: "rule-1",
        category: null,
        shippingShares: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      });
    prisma.commissionRule.create.mockImplementation(echo);
    prisma.commissionRule.update.mockImplementation(echo);
    prisma.commissionRule.findUnique.mockResolvedValue({
      ...catchAll,
      id: "rule-1",
      categoryId: "category-1",
      sellerType: CommissionSellerType.BUSINESS,
      taxpayerType: CommissionTaxpayerType.corporate,
    });
  });

  it("sends only `create` (never `deleteMany`) when creating a rule", async () => {
    await service.createCommissionRule("admin-1", {
      name: "250-999 TL ARASI",
      categoryId: "category-1",
      sellerType: CommissionSellerType.BUSINESS,
      taxpayerType: CommissionTaxpayerType.corporate,
      appliesTo: CommissionAppliesTo.BOTH,
      sellerCommissionRate: 6,
      minAmount: 250,
      maxAmount: 999,
      shippingShares,
    });

    const { data } = prisma.commissionRule.create.mock.calls[0][0];
    expect(data.shippingShares).toEqual({ create: shippingShares });
    expect(data.shippingShares).not.toHaveProperty("deleteMany");
  });

  it("replaces the full list with `deleteMany` + `create` when updating", async () => {
    await service.updateCommissionRule("admin-1", "rule-1", {
      shippingShares,
    });

    const { data } = prisma.commissionRule.update.mock.calls[0][0];
    expect(data.shippingShares).toEqual({
      deleteMany: {},
      create: shippingShares,
    });
  });

  it("leaves existing rows untouched when the field is omitted", async () => {
    await service.updateCommissionRule("admin-1", "rule-1", { priority: 3 });

    const { data } = prisma.commissionRule.update.mock.calls[0][0];
    expect(data).not.toHaveProperty("shippingShares");
  });
});
