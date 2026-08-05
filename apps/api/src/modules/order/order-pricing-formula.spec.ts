import { CommissionSellerType } from "@prisma/client";
import {
  calculateCommissionFromRules,
  CommissionRuleForCalculation,
} from "./order-commission.helper";

const referenceRule: CommissionRuleForCalculation = {
  id: "reference",
  ruleSetId: "set-1",
  name: "Reference",
  categoryId: "cat-1",
  sellerType: CommissionSellerType.FREE,
  minAmount: 0,
  maxAmount: null,
  buyerCommissionRate: 1,
  buyerServiceFeeRate: 2,
  sellerCommissionRate: 5,
  sellerPlatformFeeRate: 1,
  sellerCommissionMin: 10,
  sellerCommissionMax: 100,
  shippingBuyerShare: 100,
};

describe("strict commission formula", () => {
  it("calculates all four rate buckets from the same base", () => {
    const result = calculateCommissionFromRules(1000, [referenceRule], {
      categoryId: "cat-1",
      sellerType: CommissionSellerType.FREE,
    });
    expect(result.buyerCommissionAmount).toBe(10);
    expect(result.buyerServiceFeeAmount).toBe(20);
    expect(result.sellerCommissionAmount).toBe(50);
    expect(result.sellerPlatformFeeAmount).toBe(10);
    expect(result.commissionAmount).toBe(90);
  });

  it("applies fee floor and cap without changing rule selection", () => {
    expect(
      calculateCommissionFromRules(100, [referenceRule], {
        categoryId: "cat-1",
        sellerType: CommissionSellerType.FREE,
      }).sellerCommissionAmount,
    ).toBe(10);
    expect(
      calculateCommissionFromRules(5000, [referenceRule], {
        categoryId: "cat-1",
        sellerType: CommissionSellerType.FREE,
      }).sellerCommissionAmount,
    ).toBe(100);
  });

  it("can select by discounted unit amount while charging a line total", () => {
    const low = { ...referenceRule, id: "low", maxAmount: 500 };
    const high = { ...referenceRule, id: "high", minAmount: 500 };
    const result = calculateCommissionFromRules(800, [low, high], {
      categoryId: "cat-1",
      sellerType: CommissionSellerType.FREE,
      amount: 400,
    });
    expect(result.ruleId).toBe("low");
    expect(result.sellerCommissionAmount).toBe(40);
  });
});
