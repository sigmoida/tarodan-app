import {
  buildTradeCommissionRuleSnapshot,
  readTradeCommissionRuleSnapshot,
} from "./trade-commission-snapshot";

describe("trade commission rule snapshot", () => {
  const quote = {
    tradeId: "trade-1",
    commissionRuleSet: { id: "set-1", version: 3 },
    ruleMatches: [
      {
        productId: "product-1",
        side: "initiator" as const,
        ruleId: "rule-1",
        ruleSetId: "set-1",
        ruleName: "Premium 0+",
        categoryId: "category-1",
        sellerType: "PREMIUM" as const,
        matchedAmount: 500,
        minAmount: 0,
        maxAmount: null,
        tradeFeeSellerAmount: 20,
        tradeFeeBuyerAmount: 10,
      },
    ],
    initiator: {} as never,
    receiver: {} as never,
  };

  it("round-trips the applied set and per-product rule", () => {
    const snapshot = buildTradeCommissionRuleSnapshot(quote);
    expect(readTradeCommissionRuleSnapshot(snapshot)).toEqual({
      ruleSetId: "set-1",
      ruleSetVersion: 3,
      items: quote.ruleMatches,
    });
  });

  it("treats legacy or malformed values as absent", () => {
    expect(readTradeCommissionRuleSnapshot(null)).toBeNull();
    expect(readTradeCommissionRuleSnapshot({ ruleSetId: "set-1" })).toBeNull();
  });
});
