import {
  BusinessStatus,
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  MembershipTierType,
  SellerType,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { TaxService } from "../tax/tax.service";
import { OrderPricingService } from "./order-pricing.service";
import {
  calculateCommissionFromRules,
  mapSellerTypeForCommission,
} from "./order-commission.helper";
import { testTaxPolicy } from "./testing/tax-policy-fixture";

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
    {
      getActiveOutboundTariff: async () => ({
        freeShippingEnabled: true,
        freeShippingThreshold: 500,
      }),
    } as any,
    {
      getEffectiveDisplayPrice: async () => null,
      getEffectiveDisplayPriceMany: async () => new Map(),
    } as any,
    testTaxPolicy(),
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
        businessStatus:
          membershipTier === MembershipTierType.business
            ? BusinessStatus.approved
            : null,
        companyName:
          membershipTier === MembershipTierType.business ? "Acme A.S." : null,
        taxId:
          membershipTier === MembershipTierType.business ? "1234567890" : null,
        // Paid-tier commission requires an ENTITLED membership (active + in-period);
        // a raw past_due/expired tier no longer unlocks premium/business commission.
        membership: {
          tier: { type: membershipTier },
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
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

  it("does not grant the business commission rule before KYC approval", async () => {
    prisma.user.findUnique.mockResolvedValue({
      sellerType: SellerType.individual,
      businessStatus: BusinessStatus.pending,
      companyName: "Acme A.S.",
      taxId: "1234567890",
      membership: {
        tier: { type: MembershipTierType.business, isActive: true },
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await service.calculateCommission(100, "seller-id");

    expect(result).toMatchObject({
      ruleId: "free-rule",
      sellerFeeAmount: 5,
      commissionAmount: 5,
    });
  });
});

describe("calculateCommissionFromRules", () => {
  const rule = (
    id: string,
    sellerType: CommissionSellerType,
    appliesTo: CommissionAppliesTo,
    rates: { sellerRate?: number; buyerRate?: number },
    categoryId: string | null = null,
  ) => ({
    id,
    name: id,
    ruleType: CommissionRuleType.seller_type,
    categoryId,
    sellerType,
    appliesTo,
    sellerRate: rates.sellerRate ?? null,
    buyerRate: rates.buyerRate ?? null,
    sellerMin: null,
    sellerMax: null,
    buyerMin: null,
    buyerMax: null,
  });

  it("layers the global buyer fee onto a category seller rule", () => {
    const result = calculateCommissionFromRules(
      1000,
      [
        rule(
          "category-seller",
          CommissionSellerType.BUSINESS,
          CommissionAppliesTo.SELLER,
          { sellerRate: 8 },
          "category-1",
        ),
        rule(
          "global-buyer",
          CommissionSellerType.ALL,
          CommissionAppliesTo.BUYER,
          { buyerRate: 3 },
        ),
      ],
      "category-1",
      CommissionSellerType.BUSINESS,
    );

    expect(result).toMatchObject({
      sellerFeeAmount: 80,
      buyerFeeAmount: 30,
      commissionAmount: 110,
      ruleId: "category-seller",
    });
  });

  it("uses a more-specific BOTH rule for both sides", () => {
    const result = calculateCommissionFromRules(
      1000,
      [
        rule(
          "exact-both",
          CommissionSellerType.PREMIUM,
          CommissionAppliesTo.BOTH,
          { sellerRate: 6, buyerRate: 2 },
          "category-1",
        ),
        rule(
          "global-seller",
          CommissionSellerType.ALL,
          CommissionAppliesTo.SELLER,
          { sellerRate: 5 },
        ),
        rule(
          "global-buyer",
          CommissionSellerType.ALL,
          CommissionAppliesTo.BUYER,
          { buyerRate: 3 },
        ),
      ],
      "category-1",
      CommissionSellerType.PREMIUM,
    );

    expect(result).toMatchObject({
      sellerFeeAmount: 60,
      buyerFeeAmount: 20,
      commissionAmount: 80,
      ruleId: "exact-both",
    });
  });

  it("resolves seller and buyer specificity independently", () => {
    const result = calculateCommissionFromRules(
      1000,
      [
        rule(
          "type-seller",
          CommissionSellerType.FREE,
          CommissionAppliesTo.SELLER,
          { sellerRate: 5 },
        ),
        rule(
          "category-buyer",
          CommissionSellerType.ALL,
          CommissionAppliesTo.BUYER,
          { buyerRate: 4 },
          "category-1",
        ),
      ],
      "category-1",
      CommissionSellerType.FREE,
    );

    expect(result).toMatchObject({
      sellerFeeAmount: 50,
      buyerFeeAmount: 40,
      commissionAmount: 90,
      ruleId: "type-seller",
    });
  });
});
