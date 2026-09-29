import { CancellationActor, TradeStatus } from "@prisma/client";
import { TRADE_CANCEL_REASON } from "../helpers/trade-cancel-reasons";
import { TradeReconciliationService } from "./trade-reconciliation.service";

/**
 * Takas cron'unun iki iptal yolu da SİSTEM iptalidir. "Süresi Dolan" gerekçesi
 * yalnız süre dolumunda yazılır; kayıp koli ayrı bir gerekçedir (admin ekranı
 * onu süre dolumu saymaz).
 */
describe("TradeReconciliationService — iptal aktörü", () => {
  const makeService = (tx: any, findMany: jest.Mock) => {
    const svc = Object.create(TradeReconciliationService.prototype);
    Object.assign(svc, {
      logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
      prisma: {
        trade: { findMany },
        $transaction: jest.fn((fn: any) => fn(tx)),
      },
      paymentService: { refundTradeCashTracked: jest.fn() },
      tradeCommon: { invalidateProductCachesForTrade: jest.fn() },
      tradeShipment: { cancelSuratShipmentsForTrade: jest.fn() },
      eventService: undefined,
      // Bu spec yalnız iptal yazımına bakar; yan süpürmeler susturulur.
      autoResolveLostParcelTrades: jest.fn().mockResolvedValue(0),
      startPendingTradeConfirmationWindows: jest.fn().mockResolvedValue(0),
      notifyAdminsOfUndeliveredOutboundTrades: jest
        .fn()
        .mockResolvedValue(undefined),
    });
    return svc as TradeReconciliationService;
  };

  it("süresi dolan bekleyen takası sistem aktörü ve süre dolumu gerekçesiyle iptal eder", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          status: TradeStatus.pending,
          firstWarehouseArrivalAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      tradeItem: { findMany: jest.fn().mockResolvedValue([]) },
      tradeCashPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: "t1",
          status: TradeStatus.pending,
          initiatorId: "u1",
          receiverId: "u2",
        },
      ])
      .mockResolvedValue([]);
    const service = makeService(tx, findMany);

    await service.autoCancelExpiredTrades();

    expect(tx.trade.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        status: TradeStatus.cancelled,
        cancelledAt: expect.any(Date),
        cancelledBy: CancellationActor.system,
        cancelReason: TRADE_CANCEL_REASON.autoExpired,
      },
    });
  });

  it("kayıp koli çözümünü sistem iptali olarak, kayıp koli gerekçesiyle yazar", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          status: TradeStatus.shipping_to_warehouse,
          firstWarehouseArrivalAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      tradeShipment: {
        findMany: jest.fn().mockResolvedValue([{ shipperId: "u1" }]),
      },
      tradeItem: { findMany: jest.fn().mockResolvedValue([]) },
      tradeCashPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { id: "t2", tradeNumber: "TKS-2", initiatorId: "u1", receiverId: "u2" },
      ]);
    const service = makeService(tx, findMany);
    // Susturulan sahteyi kaldır: bu test gerçek yolu çalıştırır.
    delete (service as any).autoResolveLostParcelTrades;

    await (service as any).autoResolveLostParcelTrades(new Date());

    expect(tx.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t2" },
        data: expect.objectContaining({
          status: TradeStatus.cancelled,
          cancelledBy: CancellationActor.system,
          cancelReason: TRADE_CANCEL_REASON.lostParcel,
        }),
      }),
    );
  });
});
