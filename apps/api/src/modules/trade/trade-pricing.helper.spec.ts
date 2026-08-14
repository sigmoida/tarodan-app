import { CommissionSellerType } from "@prisma/client";
import { CommissionRuleMatchError } from "../order/helpers/order-commission.helper";
import {
  buildTradePricing,
  TRADE_SHIPPING_LEGS,
  TradeCommissionRule,
} from "./trade-pricing.helper";

const rule = (
  overrides: Partial<TradeCommissionRule> = {},
): TradeCommissionRule => ({
  id: "trade-rule",
  ruleSetId: "set-1",
  name: "Free 0+",
  categoryId: "cat-1",
  sellerType: CommissionSellerType.FREE,
  minAmount: 0,
  maxAmount: null,
  tradeFeeSellerAmount: 20,
  tradeFeeBuyerAmount: 10,
  ...overrides,
});

const tariff = {
  packageTiers: [
    {
      code: "small",
      label: "Small",
      minDesi: 0,
      maxDesi: null,
      amount: 50,
      sortOrder: 0,
    },
  ],
};

describe("trade fees from strict commission rules", () => {
  it("charges giver and receiver fixed fees from an exact trade rule", () => {
    const result = buildTradePricing({
      rules: [rule()],
      tariff: tariff as any,
      items: [
        {
          productId: "p1",
          side: "initiator",
          categoryId: "cat-1",
          sellerType: CommissionSellerType.FREE,
          value: 1000,
          quantity: 1,
          shippingDesi: 1,
        },
        {
          productId: "p2",
          side: "receiver",
          categoryId: "cat-1",
          sellerType: CommissionSellerType.FREE,
          value: 1000,
          quantity: 1,
          shippingDesi: 1,
        },
      ],
    });
    expect(result.initiator.serviceFee).toBe(30);
    expect(result.receiver.serviceFee).toBe(30);
    expect(result.initiator.shipping).toBe(50 * TRADE_SHIPPING_LEGS);
    expect(result.ruleMatches).toEqual([
      expect.objectContaining({ productId: "p1", ruleId: "trade-rule" }),
      expect.objectContaining({ productId: "p2", ruleId: "trade-rule" }),
    ]);
  });

  it("uses half-open trade value bands", () => {
    const result = buildTradePricing({
      rules: [
        rule({ id: "low", maxAmount: 500, tradeFeeSellerAmount: 5 }),
        rule({ id: "high", minAmount: 500, tradeFeeSellerAmount: 25 }),
      ],
      tariff: tariff as any,
      items: [
        {
          productId: "p1",
          side: "initiator",
          categoryId: "cat-1",
          sellerType: CommissionSellerType.FREE,
          value: 500,
          quantity: 1,
          shippingDesi: 1,
        },
      ],
    });
    expect(result.initiator.serviceFee).toBe(25);
  });

  it("matches the product owner's seller type", () => {
    const result = buildTradePricing({
      rules: [
        rule({ tradeFeeSellerAmount: 20 }),
        rule({
          id: "basic",
          sellerType: CommissionSellerType.BASIC,
          tradeFeeSellerAmount: 8,
        }),
      ],
      tariff: tariff as any,
      items: [
        {
          productId: "p1",
          side: "initiator",
          categoryId: "cat-1",
          sellerType: CommissionSellerType.BASIC,
          value: 100,
          quantity: 1,
          shippingDesi: 1,
        },
      ],
    });

    expect(result.initiator.serviceFee).toBe(8);
  });

  it("fails closed when no commission rule matches", () => {
    expect(() =>
      buildTradePricing({
        rules: [rule()],
        tariff: tariff as any,
        items: [
          {
            productId: "p1",
            side: "initiator",
            categoryId: "missing-category",
            sellerType: CommissionSellerType.FREE,
            value: 100,
            quantity: 1,
            shippingDesi: 1,
          },
        ],
      }),
    ).toThrow(CommissionRuleMatchError);
  });
});
