import { BadRequestException } from "@nestjs/common";
import { ShipmentStatus, TradeStatus } from "@prisma/client";
import { AdminTradeWarehouseService } from "./admin-trade-warehouse.service";

/**
 * Depo teslim alma ve kontrol adımının durum makinesi sözleşmesi.
 *
 * Geç gelen bir koli, KAPANMIŞ bir takası diriltmemelidir: iptal edilmiş
 * (parası iade edilmiş) ya da dönüşe çıkmış bir takas "teslim alındı"
 * işaretiyle at_warehouse'a geri sarılırsa admin onay ekranı açılır ve
 * karşılığı ödenmemiş ürünler yeni sahiplerine gönderilebilir. Sürat
 * poller'ında bu kapı zaten var; manuel yolda da olmalı.
 */
describe("AdminTradeWarehouseService warehouse guards", () => {
  const makeService = (
    trade: {
      status: TradeStatus;
      firstWarehouseArrivalAt: Date | null;
    },
    shipment: Partial<{
      id: string;
      tradeId: string;
      leg: string;
      status: ShipmentStatus;
      deliveredAt: Date | null;
    }> = {},
  ) => {
    const tradeUpdate = jest.fn().mockResolvedValue({});
    const shipmentRow = {
      id: "ship-1",
      tradeId: "trade-1",
      leg: "to_warehouse",
      status: ShipmentStatus.in_transit,
      deliveredAt: null,
      ...shipment,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          id: "trade-1",
          initiatorId: "u1",
          receiverId: "u2",
          ...trade,
        }),
        update: tradeUpdate,
      },
      tradeShipment: {
        findUnique: jest.fn().mockResolvedValue(shipmentRow),
        update: jest.fn().mockResolvedValue({ ...shipmentRow }),
        // İki bacak da teslim: geçiş yalnız durum izin veriyorsa olmalı.
        findMany: jest.fn().mockResolvedValue([
          { id: "ship-1", deliveredAt: new Date() },
          { id: "ship-2", deliveredAt: new Date() },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const service = new AdminTradeWarehouseService(
      prisma as any,
      { createAuditLog: jest.fn() } as any,
      {} as any, // paymentService
      { emitTradeCancelLocked: jest.fn() } as any,
      { createInAppNotification: jest.fn() } as any,
      {} as any, // common
    );
    return { service, tx, tradeUpdate };
  };

  it("moves a shipping trade to at_warehouse when both parcels arrived", async () => {
    const { service, tradeUpdate } = makeService({
      status: TradeStatus.shipping_to_warehouse,
      firstWarehouseArrivalAt: null,
    });

    const result = await service.markWarehouseReceived(
      "admin-1",
      "trade-1",
      "ship-1",
    );

    expect(result.status).toBe(TradeStatus.at_warehouse);
    expect(tradeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TradeStatus.at_warehouse }),
      }),
    );
  });

  it.each([
    TradeStatus.cancelled,
    TradeStatus.returning,
    TradeStatus.completed,
  ])("never revives a %s trade", async (status) => {
    const { service, tradeUpdate } = makeService({
      status,
      firstWarehouseArrivalAt: new Date(),
    });

    const result = await service.markWarehouseReceived(
      "admin-1",
      "trade-1",
      "ship-1",
    );

    // Koli teslim alındı olarak kaydedilir (fiziksel gerçek) ama takas
    // durumu DEĞİŞMEZ.
    expect(result.status).toBe(status);
    expect(tradeUpdate).not.toHaveBeenCalled();
  });

  it("refuses to force a cancelled parcel to delivered", async () => {
    const { service } = makeService(
      {
        status: TradeStatus.shipping_to_warehouse,
        firstWarehouseArrivalAt: null,
      },
      { status: ShipmentStatus.cancelled },
    );

    await expect(
      service.markWarehouseReceived("admin-1", "trade-1", "ship-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AdminTradeWarehouseService.startWarehouseReview", () => {
  const makeService = (status: TradeStatus) => {
    const update = jest
      .fn()
      .mockResolvedValue({ status: TradeStatus.admin_reviewing });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trade: {
        findUnique: jest.fn().mockResolvedValue({ id: "trade-1", status }),
        update,
      },
    };
    const service = new AdminTradeWarehouseService(
      { $transaction: jest.fn((cb: any) => cb(tx)) } as any,
      { createAuditLog: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, update };
  };

  it("takes an arrived trade into inspection", async () => {
    const { service, update } = makeService(TradeStatus.at_warehouse);
    const result = await service.startWarehouseReview("admin-1", "trade-1");
    expect(result.status).toBe(TradeStatus.admin_reviewing);
    expect(update).toHaveBeenCalled();
  });

  it("is idempotent while already under inspection", async () => {
    const { service, update } = makeService(TradeStatus.admin_reviewing);
    const result = await service.startWarehouseReview("admin-1", "trade-1");
    expect(result.already).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects trades that have not arrived yet", async () => {
    const { service } = makeService(TradeStatus.shipping_to_warehouse);
    await expect(
      service.startWarehouseReview("admin-1", "trade-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
