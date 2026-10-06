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

  it("exposes the PayTR id of each cash payment without leaking raw payment metadata", async () => {
    const prisma = {
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          ...baseTrade,
          cashPayments: [
            {
              id: "cash-1",
              payment: {
                providerConversationId: "TRADETKSK7X9M2QF3NT000002",
                metadata: { merchantOidHistory: ["TRADETKSK7X9M2QF3NT000001"] },
              },
            },
            { id: "cash-2", payment: null },
          ],
        }),
      },
    };
    const service = new AdminTradeQueryService(prisma as never, {} as never);

    const result = await service.getTradeById("trade-1");

    expect(result.cashPayments).toEqual([
      {
        id: "cash-1",
        paytrOid: "TRADETKSK7X9M2QF3NT000002",
        paytrOidHistory: ["TRADETKSK7X9M2QF3NT000001"],
      },
      { id: "cash-2", paytrOid: null, paytrOidHistory: [] },
    ]);
  });

  it("a PayTR id also searches trade cash payments in the admin list", async () => {
    const prisma = {
      trade: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AdminTradeQueryService(prisma as never, {} as never);

    await service.getTrades({ search: "TRADETKSK7X9M2QF3NT123456" } as never);
    const paytr = JSON.stringify(prisma.trade.findMany.mock.calls[0][0].where);
    expect(paytr).toContain("TKS-K7X9M2QF3N");
    expect(paytr).toContain("merchantOidHistory");

    await service.getTrades({ search: "TKS-K7X9M2QF3N" } as never);
    const plain = JSON.stringify(prisma.trade.findMany.mock.calls[1][0].where);
    expect(plain).not.toContain("merchantOidHistory");
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
