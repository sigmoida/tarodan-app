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
  });

  it("keeps accepted trade payment snapshots instead of recalculating", async () => {
    const prisma = {
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          ...baseTrade,
          cashPayments: [{ id: "payment-1" }],
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
  });
});
