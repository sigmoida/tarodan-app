import { TradeTrackingSyncService } from "./trade-tracking-sync.service";
import { ShipmentStatus, TradeStatus } from "@prisma/client";

/**
 * #2 (takip donması) + #3 (at_warehouse geri-sarma) regresyon testleri.
 */
describe("TradeTrackingSyncService", () => {
  describe("syncAllActiveTradeShipments filtresi (#2)", () => {
    it("terminal-OLMAYAN tüm bacakları seçer (notIn terminal) — ara durumlar dahil", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { tradeShipment: { findMany } } as any;
      const svc = new TradeTrackingSyncService(prisma, {} as any, {} as any);

      await svc.syncAllActiveTradeShipments();

      const where = findMany.mock.calls[0][0].where;
      expect(where.status.notIn).toEqual([
        ShipmentStatus.delivered,
        ShipmentStatus.returned,
        ShipmentStatus.cancelled,
      ]);
      // `failed` terminal değildir: geçici takip hatasından sonra worker tekrar
      // sorgulayıp taşıyıcının gerçek durumuyla kaydı iyileştirebilmelidir.
      expect(where.status.notIn).not.toContain(ShipmentStatus.failed);
      // Eski beyaz-liste artık yok — at_delivery_branch/out_for_delivery pollanır.
      expect(where.status.in).toBeUndefined();
    });
  });

  describe("maybeTransitionTradeToAtWarehouse kaynak-durum whitelist (#3)", () => {
    const makeTx = (tradeStatus: TradeStatus) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        trade: {
          findUnique: jest.fn().mockResolvedValue({
            id: "t1",
            status: tradeStatus,
            firstWarehouseArrivalAt: new Date("2026-01-01T00:00:00Z"),
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        tradeShipment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "l1",
              status: ShipmentStatus.delivered,
              deliveredAt: new Date(),
            },
            {
              id: "l2",
              status: ShipmentStatus.delivered,
              deliveredAt: new Date(),
            },
          ]),
        },
        tradeShipmentEvent: { createMany: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: jest.fn((fn: any) => fn(tx)),
        tradeCashPayment: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;
      const svc = new TradeTrackingSyncService(prisma, {} as any, {} as any);
      return { svc, tx };
    };

    it("shipping_to_warehouse'dan at_warehouse'a GEÇER (iki bacak teslim)", async () => {
      const { svc, tx } = makeTx(TradeStatus.shipping_to_warehouse);

      await (svc as any).maybeTransitionTradeToAtWarehouse("t1");

      expect(tx.trade.update).toHaveBeenCalledTimes(1);
      expect(tx.trade.update.mock.calls[0][0].data.status).toBe(
        TradeStatus.at_warehouse,
      );
    });

    it("cancelled bir takası at_warehouse'a GERİ SARMAZ", async () => {
      const { svc, tx } = makeTx(TradeStatus.cancelled);

      await (svc as any).maybeTransitionTradeToAtWarehouse("t1");

      expect(tx.trade.update).not.toHaveBeenCalled();
      // Erken çıkış — bacak sorgusuna bile gitmez
      expect(tx.tradeShipment.findMany).not.toHaveBeenCalled();
    });

    it("completed bir takası at_warehouse'a GERİ SARMAZ", async () => {
      const { svc, tx } = makeTx(TradeStatus.completed);

      await (svc as any).maybeTransitionTradeToAtWarehouse("t1");

      expect(tx.trade.update).not.toHaveBeenCalled();
    });

    it("zaten at_warehouse ise no-op (idempotent)", async () => {
      const { svc, tx } = makeTx(TradeStatus.at_warehouse);

      await (svc as any).maybeTransitionTradeToAtWarehouse("t1");

      expect(tx.trade.update).not.toHaveBeenCalled();
    });
  });
});
