import {
  CommissionSellerType,
  MembershipTierType,
  SellerType,
  ShippingPackageTierCode,
} from "@prisma/client";
import {
  calculateCommissionFromRules,
  CommissionRuleForCalculation,
  CommissionRuleMatchError,
  CommissionSellerConfigurationError,
  CorporateSellingSuspendedError,
  findMatchingCommissionRule,
  resolveCommissionSellerType,
} from "./order-commission.helper";

const rule = (
  overrides: Partial<CommissionRuleForCalculation> = {},
): CommissionRuleForCalculation => ({
  id: "rule-1",
  ruleSetId: "set-1",
  name: "Exact rule",
  categoryId: "cat-1",
  sellerType: CommissionSellerType.FREE,
  minAmount: 0,
  maxAmount: null,
  buyerCommissionRate: 1,
  buyerServiceFeeRate: 2,
  sellerCommissionRate: 10,
  sellerPlatformFeeRate: 3,
  shippingBuyerShare: 100,
  ...overrides,
});

describe("strict commission matching", () => {
  it("uses half-open ranges at an exact boundary", () => {
    const lower = rule({ id: "lower", maxAmount: 5000 });
    const upper = rule({ id: "upper", minAmount: 5000 });
    expect(
      findMatchingCommissionRule([lower, upper], {
        categoryId: "cat-1",
        sellerType: CommissionSellerType.FREE,
        amount: 4999.99,
      }).id,
    ).toBe("lower");
    expect(
      findMatchingCommissionRule([lower, upper], {
        categoryId: "cat-1",
        sellerType: CommissionSellerType.FREE,
        amount: 5000,
      }).id,
    ).toBe("upper");
  });

  it("fails closed for zero or multiple exact matches", () => {
    const context = {
      categoryId: "cat-1",
      sellerType: CommissionSellerType.FREE,
      amount: 100,
    };
    expect(() => findMatchingCommissionRule([], context)).toThrow(
      CommissionRuleMatchError,
    );
    expect(() =>
      findMatchingCommissionRule([rule(), rule({ id: "rule-2" })], context),
    ).toThrow(CommissionRuleMatchError);
  });

  it("takes buyer, seller and shipping properties from one rule", () => {
    const result = calculateCommissionFromRules(
      1000,
      [
        rule({
          shippingBuyerShare: 80,
          shippingShares: [
            { tierCode: ShippingPackageTierCode.large, buyerShare: 40 },
          ],
        }),
      ],
      {
        categoryId: "cat-1",
        sellerType: CommissionSellerType.FREE,
      },
    );
    expect(result.ruleId).toBe("rule-1");
    expect(result.sellerRuleId).toBe("rule-1");
    expect(result.buyerRuleId).toBe("rule-1");
    expect(result.buyerFeeAmount).toBe(30);
    expect(result.sellerFeeAmount).toBe(130);
    expect(result.shippingBuyerShares.large).toBe(40);
    expect(result.shippingBuyerShares.small).toBe(80);
  });

  it("accepts an explicit all-zero rule", () => {
    const result = calculateCommissionFromRules(
      1000,
      [
        rule({
          buyerCommissionRate: 0,
          buyerServiceFeeRate: 0,
          sellerCommissionRate: 0,
          sellerPlatformFeeRate: 0,
        }),
      ],
      {
        categoryId: "cat-1",
        sellerType: CommissionSellerType.FREE,
      },
    );
    expect(result.commissionAmount).toBe(0);
    expect(result.ruleId).toBe("rule-1");
  });

  it("rounds a divided unit price to cents before selecting the band", () => {
    const result = calculateCommissionFromRules(
      100,
      [
        rule({ id: "lower", maxAmount: 33.33 }),
        rule({ id: "upper", minAmount: 33.33 }),
      ],
      {
        categoryId: "cat-1",
        sellerType: CommissionSellerType.FREE,
        amount: 100 / 3,
      },
    );
    expect(result.ruleId).toBe("upper");
    expect(result.matchedAmount).toBe(33.33);
  });
});

describe("commission seller type", () => {
  it("keeps BASIC distinct from FREE", () => {
    expect(
      resolveCommissionSellerType({
        userSellerType: SellerType.individual,
        membershipTier: MembershipTierType.basic,
      }),
    ).toBe(CommissionSellerType.BASIC);
  });

  it("rejects corporate plus non-business membership", () => {
    expect(() =>
      resolveCommissionSellerType({
        userSellerType: SellerType.verified,
        configuredMembershipTier: MembershipTierType.business,
        membershipTier: MembershipTierType.free,
        businessStatus: "approved",
        companyName: "ACME",
        taxId: "123",
      }),
    ).toThrow(CorporateSellingSuspendedError);
  });

  it("does not silently downgrade an invalid configured BUSINESS membership to FREE", () => {
    expect(() =>
      resolveCommissionSellerType({
        userSellerType: SellerType.verified,
        configuredMembershipTier: MembershipTierType.business,
        membershipTier: MembershipTierType.free,
        companyName: "Eksik İşletme",
        businessStatus: null,
        taxId: null,
      }),
    ).toThrow(CommissionSellerConfigurationError);
  });
});
