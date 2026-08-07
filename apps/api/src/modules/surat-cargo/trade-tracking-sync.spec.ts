import { TradeTrackingSyncService } from "./trade-tracking-sync.service";
import { ShipmentStatus, TradeStatus } from "@prisma/client";

/**
 * #2 (takip donması) + #3 (at_warehouse geri-sarma) regresyon testleri.
 */
describe("TradeTrackingSyncService", () => {
  describe("fiziksel teslim ve bildirim", () => {
    const makeService = (shippedAt: Date | null = null) => {
      const tradeShipment = {
        id: "trade-shipment-1",
        tradeId: "trade-1",
        carrier: "surat",
        trackingNumber: "PKG-TRADE-1",
        providerTrackingId: null,
        status: ShipmentStatus.label_created,
        shippedAt,
        deliveredAt: null,
        shipperId: "initiator-1",
        recipientUserId: null,
        leg: "to_warehouse",
        recipientType: "warehouse",
        trade: {
          initiatorId: "initiator-1",
          receiverId: "receiver-1",
        },
      };
      const prisma = {
        tradeShipment: {
          findUnique: jest.fn().mockResolvedValue(tradeShipment),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        tradeShipmentEvent: {
          findMany: jest.fn().mockResolvedValue([]),
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      const notifyTradeShipped = jest.fn().mockResolvedValue(undefined);
      const moduleRef = {
        get: jest.fn().mockReturnValue({ notifyTradeShipped }),
      };
      const client = {
        lookupTracking: jest.fn().mockResolvedValue({
          kind: "found",
          data: {
            IsError: false,
            errorMessage: null,
            Gonderiler: [
              {
                KargonunDurumuSayi: 3,
                KargonunDurumu: "Transfer merkezinde",
                KargoTakipNo: "SURAT-TRADE-123",
                TeslimTarihi: "",
                Hareketler: [],
              },
            ],
          },
        }),
        parseSuratDate: jest.fn(),
      };
      return {
        service: new TradeTrackingSyncService(
          prisma as any,
          moduleRef as any,
          client as any,
        ),
        prisma,
        notifyTradeShipped,
      };
    };

    it("ilk taşıyıcı hareketinde shippedAt yazar ve karşı tarafı bir kez bilgilendirir", async () => {
      const { service, prisma, notifyTradeShipped } = makeService();

      await expect(
        service.syncTradeShipmentTracking("trade-shipment-1"),
      ).resolves.toBe(true);

      expect(prisma.tradeShipment.updateMany).toHaveBeenCalledWith({
        where: {
          id: "trade-shipment-1",
          status: ShipmentStatus.label_created,
          shippedAt: null,
        },
        data: expect.objectContaining({
          status: ShipmentStatus.in_transit,
          providerTrackingId: "SURAT-TRADE-123",
          shippedAt: expect.any(Date),
        }),
      });
      expect(notifyTradeShipped).toHaveBeenCalledWith(
        "receiver-1",
        "trade-1",
        "SURAT-TRADE-123",
      );
    });

    it("shippedAt zaten varsa aynı bildirimi yeniden göndermez", async () => {
      const { service, notifyTradeShipped } = makeService(
        new Date("2026-08-07T10:00:00.000Z"),
      );

      await service.syncTradeShipmentTracking("trade-shipment-1");

      expect(notifyTradeShipped).not.toHaveBeenCalled();
    });
  });

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
