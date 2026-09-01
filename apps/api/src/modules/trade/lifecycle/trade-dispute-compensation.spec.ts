import { TradeLifecycleService } from "./trade-lifecycle.service";
import { PaymentStatus, TradeStatus } from "@prisma/client";

/**
 * İtiraz çözümü tazminat sözleşmesi:
 *  - compensate_both (iki taraf da mağdur — ör. iki çıkış kolisi de kayıp):
 *    müşteri taahhüdü "hizmet bedeli ve kargo dahil TAM iade"dir. Satırlar
 *    iadeden ÖNCE fullRefundEntitled ile damgalanır ki hem ilk deneme hem
 *    retry cron'u tam tutarı hesaplasın; hiçbir satır holdReleaseAt almaz.
 *  - compensate_initiator/receiver: yalnız mağdurun satırı, tam-iade işareti
 *    OLMADAN iade edilir (nakit fark; hizmet bedeli/kargo kesilir) — karşı
 *    satır holdReleaseAt damgası alıp escrow takvimiyle serbest kalır.
 */
describe("TradeLifecycleService.resolveDispute — tazminat sözleşmesi", () => {
  const TRADE_ID = "trade-1";
  const INITIATOR = "user-ali";
  const RECEIVER = "user-burak";

  const makeService = () => {
    const txCashUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: TRADE_ID }]),
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          id: TRADE_ID,
          status: TradeStatus.disputed,
          version: 3,
          initiatorId: INITIATOR,
          receiverId: RECEIVER,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      tradeDispute: {
        findUnique: jest.fn().mockResolvedValue({ tradeId: TRADE_ID }),
        update: jest.fn().mockResolvedValue({}),
      },
      tradeItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ productId: "p1", quantity: 1 }]),
      },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "p1", quantity: 1, reservedQuantity: 1 }]),
        update: jest.fn().mockResolvedValue({}),
      },
      tradeCashPayment: { updateMany: txCashUpdateMany },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const prisma = {
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          status: TradeStatus.disputed,
          initiatorId: INITIATOR,
          receiverId: RECEIVER,
        }),
      },
      tradeCashPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const paymentService = {
      refundTradeCashTracked: jest.fn().mockResolvedValue({ refunded: true }),
    };
    const tradeCommon = {
      invalidateProductCachesForTrade: jest.fn().mockResolvedValue(undefined),
    };
    const tradeQuery = {
      getTradeById: jest.fn().mockResolvedValue({ id: TRADE_ID }),
    };

    const service = new TradeLifecycleService(
      prisma as any,
      {} as any, // taxPolicy
      {} as any, // membershipService
      {} as any, // notificationService
      paymentService as any,
      {} as any, // productLockService
      {} as any, // tradeShipment
      tradeCommon as any,
      tradeQuery as any,
      {} as any, // tradeQuote
      {
        isBlockedEither: async () => false,
        getHiddenUserIds: async () => [],
      } as any, // userBlocks
      undefined, // discountService
    );

    return { service, prisma, tx, txCashUpdateMany, paymentService };
  };

  it("compensate_both: iki satır da iadeden ÖNCE fullRefundEntitled damgası alır", async () => {
    const { service, prisma, paymentService } = makeService();

    await service.resolveDispute(TRADE_ID, "admin-1", {
      resolution: "compensate_both",
      notes: "iki koli de kayıp",
    } as any);

    expect(prisma.tradeCashPayment.updateMany).toHaveBeenCalledWith({
      where: {
        tradeId: TRADE_ID,
        status: PaymentStatus.completed,
        releasedAt: null,
        refundedAt: null,
      },
      data: { fullRefundEntitled: true },
    });
    // Damga, iade çağrısından ÖNCE atılmalı — retry cron'u da tam tutarı görsün.
    const stampOrder =
      prisma.tradeCashPayment.updateMany.mock.invocationCallOrder[0];
    const refundOrder =
      paymentService.refundTradeCashTracked.mock.invocationCallOrder[0];
    expect(stampOrder).toBeLessThan(refundOrder);
    // Kapsamsız çağrı: iki satır da iade edilir.
    expect(paymentService.refundTradeCashTracked).toHaveBeenCalledWith(
      TRADE_ID,
      undefined,
    );
  });

  it("compensate_both: hiçbir satır holdReleaseAt damgası almaz (iade borcu)", async () => {
    const { service, txCashUpdateMany } = makeService();

    await service.resolveDispute(TRADE_ID, "admin-1", {
      resolution: "compensate_both",
      notes: "iki koli de kayıp",
    } as any);

    expect(txCashUpdateMany).not.toHaveBeenCalled();
  });

  it("compensate_initiator: tam-iade işareti YAZILMAZ, yalnız mağdurun satırı iade edilir", async () => {
    const { service, prisma, txCashUpdateMany, paymentService } = makeService();

    await service.resolveDispute(TRADE_ID, "admin-1", {
      resolution: "compensate_initiator",
      notes: "hasarlı ürün",
    } as any);

    expect(prisma.tradeCashPayment.updateMany).not.toHaveBeenCalled();
    expect(paymentService.refundTradeCashTracked).toHaveBeenCalledWith(
      TRADE_ID,
      { payerId: INITIATOR },
    );
    // Karşı satır escrow takvimine damgalanır (holdReleaseAt, mağdur hariç).
    expect(txCashUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          payerId: { not: INITIATOR },
        }),
        data: expect.objectContaining({ holdReleaseAt: expect.any(Date) }),
      }),
    );
  });

  it("complete_trade: iade çağrılmaz, tam-iade işareti yazılmaz", async () => {
    const { service, prisma, paymentService } = makeService();

    await service.resolveDispute(TRADE_ID, "admin-1", {
      resolution: "complete_trade",
      notes: "itiraz yerinde değil",
    } as any);

    expect(prisma.tradeCashPayment.updateMany).not.toHaveBeenCalled();
    expect(paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
  });
});
