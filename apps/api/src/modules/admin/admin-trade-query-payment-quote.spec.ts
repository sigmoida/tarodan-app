import { AdminTradeQueryService } from "./admin-trade-query.service";

describe("AdminTradeQueryService payment quote", () => {
  const baseTrade = {
    id: "trade-1",
    pricingVersion: "v2",
    cashPayments: [],
    items: [],
  };

  it("adds live commission and shipping quote before payment rows exist", async () => {
    const prisma = {
      trade: { findUnique: jest.fn().mockResolvedValue(baseTrade) },
    };
    const quote = {
      quoteForTrade: jest.fn().mockResolvedValue({
        tradeId: "trade-1",
        commissionRuleSet: { id: "set-live", version: 4 },
        ruleMatches: [
          {
            productId: "product-1",
            side: "initiator",
            ruleId: "rule-live",
          },
        ],
        initiator: { serviceFee: 30, shipping: 200, total: 230 },
        receiver: { serviceFee: 30, shipping: 200, total: 230 },
      }),
    };
    const service = new AdminTradeQueryService(
      prisma as never,
      undefined as never,
      quote as never,
    );

    const result = await service.getTradeById("trade-1");

    expect(quote.quoteForTrade).toHaveBeenCalledWith("trade-1");
    expect(result.paymentQuote).toMatchObject({
      initiator: { serviceFee: 30, shipping: 200 },
      receiver: { serviceFee: 30, shipping: 200 },
    });
    expect(result.commissionRuleMatches).toEqual([
      expect.objectContaining({
        productId: "product-1",
        ruleId: "rule-live",
        ruleSetVersion: 4,
        source: "live",
      }),
    ]);
  });

  it("keeps accepted trade payment snapshots instead of recalculating", async () => {
    const prisma = {
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          ...baseTrade,
          cashPayments: [{ id: "payment-1" }],
          commissionRuleSnapshot: {
            ruleSetId: "set-snapshot",
            ruleSetVersion: 2,
            items: [
              {
                productId: "product-1",
                side: "initiator",
                ruleId: "rule-snapshot",
                ruleSetId: "set-snapshot",
                ruleName: "Applied rule",
                categoryId: "category-1",
                sellerType: "FREE",
                matchedAmount: 500,
                minAmount: 0,
                maxAmount: null,
                tradeFeeSellerAmount: 20,
                tradeFeeBuyerAmount: 10,
              },
            ],
          },
        }),
      },
    };
    const quote = { quoteForTrade: jest.fn() };
    const service = new AdminTradeQueryService(
      prisma as never,
      undefined as never,
      quote as never,
    );

    const result = await service.getTradeById("trade-1");

    expect(quote.quoteForTrade).not.toHaveBeenCalled();
    expect(result.paymentQuote).toBeNull();
    expect(result.commissionRuleMatches).toEqual([
      expect.objectContaining({
        ruleId: "rule-snapshot",
        ruleSetVersion: 2,
        source: "snapshot",
      }),
    ]);
  });
});
