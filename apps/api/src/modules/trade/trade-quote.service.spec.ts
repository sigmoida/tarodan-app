import { NotFoundException } from "@nestjs/common";
import { ShippingPackageTierCode, TradeStatus } from "@prisma/client";
import { TradeQuoteService } from "./trade-quote.service";

/**
 * Takas ödeme teklifi (v2) — "bu takas bana kaça mal olacak?" sorusunun TEK
 * cevabı. Hem teklif/kabul ekranları hem de kabulde yazılacak ödeme satırları
 * bu servisten beslenir: önizleme ile tahsilat ayrışamaz.
 *
 * v1 takaslar (mevcut, komisyonlu tek taraflı model) bu servise HİÇ girmez —
 * `pricingVersion` ayrımı tek yerdedir.
 */
describe("TradeQuoteService.quoteForTrade", () => {
  const tariff = {
    packageTiers: [
      {
        code: ShippingPackageTierCode.small,
        minDesi: 0,
        maxDesi: 5,
        amount: 30,
      },
      {
        code: ShippingPackageTierCode.medium,
        minDesi: 5,
        maxDesi: 15,
        amount: 50,
      },
      {
        code: ShippingPackageTierCode.large,
        minDesi: 15,
        maxDesi: null,
        amount: 80,
      },
    ],
  };

  const makeTrade = (over: Record<string, unknown> = {}) => ({
    id: "trade-1",
    initiatorId: "user-a",
    receiverId: "user-b",
    status: TradeStatus.pending,
    cashAmount: null,
    cashPayerId: null,
    pricingVersion: "v2",
    items: [
      {
        productId: "p-a",
        side: "initiator",
        quantity: 1,
        valueAtTrade: 500,
        product: { categoryId: "cat-1", shippingDesi: 1 },
      },
      {
        productId: "p-b",
        side: "receiver",
        quantity: 1,
        valueAtTrade: 500,
        product: { categoryId: "cat-1", shippingDesi: 1 },
      },
    ],
    ...over,
  });

  const makeService = (
    trade: any = makeTrade(),
    rules: any[] = [
      {
        id: "r1",
        categoryId: null,
        sellerType: null,
        taxpayerType: null,
        minAmount: null,
        maxAmount: null,
        priority: 0,
        tradeFeeSellerAmount: 20,
        tradeFeeBuyerAmount: 15,
      },
    ],
  ) => {
    const prisma = {
      trade: { findUnique: jest.fn().mockResolvedValue(trade) },
      commissionRule: { findMany: jest.fn().mockResolvedValue(rules) },
    };
    const shipping = {
      getActiveOutboundTariff: jest.fn().mockResolvedValue(tariff),
    };
    return {
      service: new TradeQuoteService(prisma as any, shipping as any),
      prisma,
      shipping,
    };
  };

  it("her iki taraf için ödenecek toplamı ve kalemleri döner", async () => {
    const { service } = makeService();

    const quote = await service.quoteForTrade("trade-1");

    expect(quote.initiator).toMatchObject({
      userId: "user-a",
      serviceFee: 35,
      shipping: 60,
      cashDifference: 0,
      total: 95,
    });
    expect(quote.receiver).toMatchObject({
      userId: "user-b",
      serviceFee: 35,
      shipping: 60,
      total: 95,
    });
  });

  it("nakit farkını yalnız ödeyen tarafın toplamına ekler", async () => {
    const { service } = makeService(
      makeTrade({ cashAmount: 200, cashPayerId: "user-b" }),
    );

    const quote = await service.quoteForTrade("trade-1");

    expect(quote.receiver.cashDifference).toBe(200);
    expect(quote.receiver.total).toBe(295);
    expect(quote.initiator.cashDifference).toBe(0);
    expect(quote.initiator.total).toBe(95);
  });

  it("yalnız AKTİF kuralları kullanır", async () => {
    const { service, prisma } = makeService();

    await service.quoteForTrade("trade-1");

    expect(prisma.commissionRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it("takas yoksa 404 verir", async () => {
    const { service, prisma } = makeService();
    prisma.trade.findUnique.mockResolvedValue(null);

    await expect(service.quoteForTrade("yok")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("v1 takas için teklif üretmez (eski model kendi akışıyla biter)", async () => {
    const { service } = makeService(makeTrade({ pricingVersion: "v1" }));

    await expect(service.quoteForTrade("trade-1")).resolves.toBeNull();
  });

  it("kargo kademesini tarafın ürünlerinin birleşik desisinden çözer", async () => {
    const { service } = makeService(
      makeTrade({
        items: [
          {
            productId: "p-a",
            side: "initiator",
            quantity: 2,
            valueAtTrade: 500,
            product: { categoryId: "cat-1", shippingDesi: 3 },
          },
          {
            productId: "p-b",
            side: "receiver",
            quantity: 1,
            valueAtTrade: 500,
            product: { categoryId: "cat-1", shippingDesi: 1 },
          },
        ],
      }),
    );

    const quote = await service.quoteForTrade("trade-1");

    expect(quote.initiator.shipping).toBe(100); // 6 desi → orta (50) × 2
    expect(quote.receiver.shipping).toBe(60); // 1 desi → küçük (30) × 2
  });
});
