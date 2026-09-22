import { CancellationActor, TradeStatus } from "@prisma/client";
import { TRADE_VALID_TRANSITIONS } from "../helpers/trade.state-machine";
import { TradeLifecycleService } from "./trade-lifecycle.service";

/**
 * Kullanıcı takası iptal ettiğinde aktör, iptal edenin takastaki rolünden
 * gelir: teklifi açan (initiator) `buyer`, ilan sahibi (receiver) `seller`.
 * Ret ise her zaman receiver'ındır (`tradeRejectedData`).
 */
describe("TradeLifecycleService — iptal/ret aktörü", () => {
  const makeService = (status: TradeStatus = TradeStatus.pending) => {
    const trade = {
      id: "t1",
      status,
      version: 4,
      initiatorId: "u-init",
      receiverId: "u-recv",
      firstWarehouseArrivalAt: null,
    };
    const tx: any = {
      trade: { update: jest.fn().mockResolvedValue({}) },
      tradeItem: { findMany: jest.fn().mockResolvedValue([]) },
      tradeShipment: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeCashPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const svc = Object.create(TradeLifecycleService.prototype);
    Object.assign(svc, {
      validTransitions: TRADE_VALID_TRANSITIONS,
      logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
      prisma: { $transaction: jest.fn((fn: any) => fn(tx)) },
      getTradeWithLock: jest.fn().mockResolvedValue(trade),
      productLockService: { releaseReservation: jest.fn() },
      paymentService: { refundTradeCashTracked: jest.fn() },
      tradeShipment: { cancelSuratShipmentsForTrade: jest.fn() },
      tradeCommon: { invalidateProductCachesForTrade: jest.fn() },
      tradeQuery: { getTradeById: jest.fn().mockResolvedValue({ id: "t1" }) },
      notificationService: {
        createInAppNotification: jest.fn().mockResolvedValue(undefined),
      },
    });
    return { service: svc as TradeLifecycleService, tx };
  };

  it.each([
    ["u-init", CancellationActor.buyer],
    ["u-recv", CancellationActor.seller],
  ])("%s iptal edince aktör %s olur", async (userId, actor) => {
    const { service, tx } = makeService();

    await service.cancelTrade("t1", userId, { reason: "vazgeçtim" } as any);

    expect(tx.trade.update).toHaveBeenCalledWith({
      where: { id: "t1", version: 4 },
      data: {
        status: TradeStatus.cancelled,
        cancelledAt: expect.any(Date),
        cancelledBy: actor,
        cancelReason: "vazgeçtim",
        version: { increment: 1 },
      },
    });
  });

  it("ret, reddedeni (ilan sahibi) satıcı olarak damgalar", async () => {
    const { service, tx } = makeService();

    await service.rejectTrade("t1", "u-recv", { reason: "olmaz" } as any);

    expect(tx.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TradeStatus.rejected,
          cancelledBy: CancellationActor.seller,
        }),
      }),
    );
  });
});
