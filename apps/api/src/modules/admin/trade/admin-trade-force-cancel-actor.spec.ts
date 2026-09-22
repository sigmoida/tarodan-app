import { CancellationActor, TradeStatus } from "@prisma/client";
import { TRADE_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";
import { AdminTradeResolutionService } from "./admin-trade-resolution.service";

/**
 * Takılı takasın zorla iptali yöneticinin kararıdır. İade kolisi yoksa takas
 * hemen iptal olur ve aktör platformdur; iade kolisi varsa takas `returning`de
 * bekler — iptal (ve aktörü) bacaklar kapanınca finalize'da yazılır.
 */
describe("AdminTradeResolutionService.forceCancelStuckWarehouseTrade — iptal aktörü", () => {
  const makeService = () => {
    const trade = {
      id: "t1",
      tradeNumber: "TKS-1",
      status: TradeStatus.shipping_to_warehouse,
      firstWarehouseArrivalAt: new Date("2026-09-10T00:00:00.000Z"),
      initiatorId: "u1",
      receiverId: "u2",
      cashPayments: [],
      items: [],
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trade: {
        findUnique: jest.fn().mockResolvedValue(trade),
        update: jest.fn().mockResolvedValue({}),
      },
      tradeShipment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "arrived",
            shipperId: "u1",
            recipientUserId: null,
            shippedAt: new Date(),
            deliveredAt: new Date(),
            carrier: "manual",
            trackingNumber: null,
          },
          {
            id: "stuck",
            shipperId: "u2",
            recipientUserId: null,
            shippedAt: new Date(),
            deliveredAt: null,
            carrier: "manual",
            trackingNumber: null,
          },
        ]),
      },
      tradeCashPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      tradeItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminTradeResolutionService(
      { $transaction: jest.fn((fn: any) => fn(tx)) } as any,
      { createAuditLog: jest.fn().mockResolvedValue(undefined) } as any,
      { refundTradeCashTracked: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, // eventService
      { resolveWarehouseAddressId: jest.fn().mockResolvedValue("wh") } as any,
    );
    return { service, tx };
  };

  it("iade kolisi yoksa takası yönetici (platform) iptali olarak kapatır", async () => {
    const { service, tx } = makeService();

    await service.forceCancelStuckWarehouseTrade("admin-1", "t1", {
      reason: "Koli taşıyıcıda takıldı, çözüm yok",
      sendArrivedItemBack: false,
    });

    expect(tx.trade.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        status: TradeStatus.cancelled,
        cancelledAt: expect.any(Date),
        cancelledBy: CancellationActor.platform,
        cancelReason: TRADE_CANCEL_REASON.adminForceCancelStuck(
          "Koli taşıyıcıda takıldı, çözüm yok",
        ),
        updatedAt: expect.any(Date),
      },
    });
  });
});
