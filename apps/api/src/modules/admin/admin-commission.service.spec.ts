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
