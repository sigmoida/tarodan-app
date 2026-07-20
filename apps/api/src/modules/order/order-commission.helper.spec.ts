import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  MembershipTierType,
  SellerType,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { TaxService } from "../tax/tax.service";
import { OrderPricingService } from "./order-pricing.service";
import { mapSellerTypeForCommission } from "./order-commission.helper";

describe("mapSellerTypeForCommission", () => {
  it.each([
    [MembershipTierType.free, CommissionSellerType.FREE],
    [MembershipTierType.basic, CommissionSellerType.FREE],
    [MembershipTierType.premium, CommissionSellerType.PREMIUM],
    [MembershipTierType.business, CommissionSellerType.BUSINESS],
  ])("maps the %s membership tier to %s", (membershipTier, expected) => {
    expect(
      mapSellerTypeForCommission(SellerType.individual, membershipTier),
    ).toBe(expected);
  });

  it.each([SellerType.individual, SellerType.verified])(
    "maps a %s seller without membership to FREE",
    (sellerType) => {
      expect(mapSellerTypeForCommission(sellerType, null)).toBe(
        CommissionSellerType.FREE,
      );
    },
  );

  it("maps a platform seller without paid membership to BUSINESS", () => {
    expect(mapSellerTypeForCommission(SellerType.platform, null)).toBe(
      CommissionSellerType.BUSINESS,
    );
  });

  it("gives paid membership precedence over platform seller type", () => {
    expect(
      mapSellerTypeForCommission(
        SellerType.platform,
        MembershipTierType.premium,
      ),
    ).toBe(CommissionSellerType.PREMIUM);
  });
});

describe("commission rule matching by membership tier", () => {
  const commissionRules = [
    {
      id: "free-rule",
      name: "Free commission",
      ruleType: CommissionRuleType.seller_type,
      categoryId: null,
      sellerType: CommissionSellerType.FREE,
      appliesTo: CommissionAppliesTo.SELLER,
      sellerRate: 5,
      sellerMin: null,
      sellerMax: null,
      buyerRate: null,
      buyerMin: null,
      buyerMax: null,
    },
    {
      id: "premium-rule",
      name: "Premium commission",
      ruleType: CommissionRuleType.seller_type,
      categoryId: null,
      sellerType: CommissionSellerType.PREMIUM,
      appliesTo: CommissionAppliesTo.SELLER,
      sellerRate: 10,
      sellerMin: null,
      sellerMax: null,
      buyerRate: null,
      buyerMin: null,
      buyerMax: null,
    },
    {
      id: "business-rule",
      name: "Business commission",
      ruleType: CommissionRuleType.seller_type,
      categoryId: null,
      sellerType: CommissionSellerType.BUSINESS,
      appliesTo: CommissionAppliesTo.SELLER,
      sellerRate: 15,
      sellerMin: null,
      sellerMax: null,
      buyerRate: null,
      buyerMin: null,
      buyerMax: null,
    },
  ];

  const prisma = {
    user: { findUnique: jest.fn() },
    commissionRule: { findMany: jest.fn().mockResolvedValue(commissionRules) },
  };
  const service = new OrderPricingService(
    prisma as unknown as PrismaService,
    {} as TaxService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.commissionRule.findMany.mockResolvedValue(commissionRules);
  });

  it.each([
    [MembershipTierType.free, "free-rule", 5],
    [MembershipTierType.basic, "free-rule", 5],
    [MembershipTierType.premium, "premium-rule", 10],
    [MembershipTierType.business, "business-rule", 15],
  ])(
    "charges a %s seller using the matching rule",
    async (membershipTier, expectedRuleId, expectedFee) => {
      prisma.user.findUnique.mockResolvedValue({
        sellerType: SellerType.individual,
        membership: { tier: { type: membershipTier } },
      });

      const result = await service.calculateCommission(100, "seller-id");

      expect(result).toMatchObject({
        ruleId: expectedRuleId,
        sellerFeeAmount: expectedFee,
        buyerFeeAmount: 0,
        commissionAmount: expectedFee,
      });
    },
  );
});
