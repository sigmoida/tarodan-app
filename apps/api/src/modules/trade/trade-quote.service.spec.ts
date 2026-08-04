import { NotFoundException } from "@nestjs/common";
import {
  CommissionSellerType,
  MembershipTierType,
  SellerType,
  ShippingPackageTierCode,
  SubscriptionStatus,
  TradeStatus,
} from "@prisma/client";
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
  const seller = {
    sellerType: SellerType.individual,
    businessStatus: null,
    companyName: null,
    taxId: null,
    membership: {
      status: SubscriptionStatus.active,
      currentPeriodEnd: new Date("2099-01-01"),
      tier: { type: MembershipTierType.free, isActive: true },
    },
  };
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
        product: { categoryId: "cat-1", shippingDesi: 1, seller },
      },
      {
        productId: "p-b",
        side: "receiver",
        quantity: 1,
        valueAtTrade: 500,
        product: { categoryId: "cat-1", shippingDesi: 1, seller },
      },
    ],
    ...over,
  });

  const makeService = (
    trade: any = makeTrade(),
    rules: any[] = [
      {
        id: "r1",
        ruleSetId: "set-1",
        name: "Free 0+",
        categoryId: "cat-1",
        sellerType: CommissionSellerType.FREE,
        minAmount: 0,
        maxAmount: null,
        tradeFeeSellerAmount: 20,
        tradeFeeBuyerAmount: 15,
      },
    ],
  ) => {
    const prisma = {
      trade: { findUnique: jest.fn().mockResolvedValue(trade) },
      commissionRuleSet: {
        findFirst: jest.fn().mockResolvedValue({ id: "set-1", rules }),
      },
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

  it("yalnız AKTİF komisyon setinin kurallarını kullanır", async () => {
    const { service, prisma } = makeService();

    await service.quoteForTrade("trade-1");

    expect(prisma.commissionRuleSet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE" },
        include: { rules: true },
      }),
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
            product: { categoryId: "cat-1", shippingDesi: 3, seller },
          },
          {
            productId: "p-b",
            side: "receiver",
            quantity: 1,
            valueAtTrade: 500,
            product: { categoryId: "cat-1", shippingDesi: 1, seller },
          },
        ],
      }),
    );

    const quote = await service.quoteForTrade("trade-1");

    expect(quote.initiator.shipping).toBe(100); // 6 desi → orta (50) × 2
    expect(quote.receiver.shipping).toBe(60); // 1 desi → küçük (30) × 2
  });
});

/**
 * KARŞI TEKLİF ÖNİZLEMESİ — kullanıcı teklifi kurarken maliyeti görebilmeli.
 * Kaydedilmiş takasla AYNI motor kullanılır (önizleme ile tahsilat ayrışmaz);
 * tek fark ürün değerinin güncel ilan fiyatından okunmasıdır.
 */
describe("TradeQuoteService.previewQuote", () => {
  const seller = {
    sellerType: SellerType.individual,
    businessStatus: null,
    companyName: null,
    taxId: null,
    membership: {
      status: SubscriptionStatus.active,
      currentPeriodEnd: new Date("2099-01-01"),
      tier: { type: MembershipTierType.free, isActive: true },
    },
  };
  const makeService = (
    products: any[] = [
      {
        id: "p-a",
        categoryId: "cat-1",
        shippingDesi: 1,
        price: 500,
        seller,
      },
      {
        id: "p-b",
        categoryId: "cat-1",
        shippingDesi: 1,
        price: 500,
        seller,
      },
    ],
  ) => {
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue(products) },
      commissionRuleSet: {
        findFirst: jest.fn().mockResolvedValue({
          id: "set-1",
          rules: [
            {
              id: "r1",
              ruleSetId: "set-1",
              name: "Free 0+",
              categoryId: "cat-1",
              sellerType: CommissionSellerType.FREE,
              minAmount: 0,
              maxAmount: null,
              tradeFeeSellerAmount: 20,
              tradeFeeBuyerAmount: 15,
            },
          ],
        }),
      },
    };
    const shipping = {
      getActiveOutboundTariff: jest.fn().mockResolvedValue({
        packageTiers: [
          {
            code: ShippingPackageTierCode.small,
            minDesi: 0,
            maxDesi: 5,
            amount: 30,
          },
        ],
      }),
    };
    return { service: new TradeQuoteService(prisma as any, shipping as any) };
  };

  it("kaydedilmemiş teklifi iki taraf için fiyatlar", async () => {
    const { service } = makeService();

    const quote = await service.previewQuote({
      initiatorItems: [{ productId: "p-a", quantity: 1 }],
      receiverItems: [{ productId: "p-b", quantity: 1 }],
    });

    expect(quote.initiator).toMatchObject({
      serviceFee: 35,
      shipping: 60,
      total: 95,
    });
    expect(quote.receiver.total).toBe(95);
  });

  it("nakit farkını belirtilen tarafa yükler", async () => {
    const { service } = makeService();

    const quote = await service.previewQuote({
      initiatorItems: [{ productId: "p-a" }],
      receiverItems: [{ productId: "p-b" }],
      cashAmount: 200,
      cashPayer: "receiver",
    });

    expect(quote.receiver.total).toBe(295);
    expect(quote.initiator.total).toBe(95);
  });

  it("erişilemeyen ürün için eksik fiyat göstermek yerine 404 verir", async () => {
    const { service } = makeService([
      {
        id: "p-a",
        categoryId: "cat-1",
        shippingDesi: 1,
        price: 500,
        seller,
      },
    ]);

    await expect(
      service.previewQuote({
        initiatorItems: [{ productId: "p-a" }],
        receiverItems: [{ productId: "silinmis" }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ürün yokken sorgu atmaz ve sıfır fiyat döner", async () => {
    const { service } = makeService();

    const quote = await service.previewQuote({
      initiatorItems: [],
      receiverItems: [],
    });

    expect(quote.initiator.total).toBe(0);
    expect(quote.receiver.total).toBe(0);
  });
});
