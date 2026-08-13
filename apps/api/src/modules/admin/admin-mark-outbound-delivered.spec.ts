import { ShipmentStatus, TradeStatus } from "@prisma/client";
import { AdminTradeWarehouseService } from "./admin-trade-warehouse.service";

/**
 * Çıkış kolisini elle teslim işaretleme (ops kurtarma yolu). Escrow onay
 * penceresi teslimattan başladığı için taşıyıcı teslimi raporlamazsa takas
 * askıda kalır; bu uç fiziksel teslimi kayda geçirir ve iki koli de teslim
 * olduğunda pencereyi başlatır. Guard'lar: yalnız `shipping_to_recipients`
 * takas, yalnız `from_warehouse` bacağı, terminal (iptal/dönüş) bacak
 * delivered'a zorlanamaz; zaten teslim edilmiş bacakta yalnız pencere onarılır.
 */
describe("AdminTradeWarehouseService.markOutboundDelivered", () => {
  const makeService = (opts: {
    tradeStatus?: TradeStatus;
    shipment?: Record<string, unknown> | null;
    otherLegDelivered?: boolean;
  }) => {
    const shipment =
      opts.shipment === undefined
        ? {
            id: "ship-1",
            tradeId: "trade-1",
            leg: "from_warehouse",
            status: ShipmentStatus.in_transit,
            deliveredAt: null,
          }
        : opts.shipment;

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          id: "trade-1",
          status: opts.tradeStatus ?? TradeStatus.shipping_to_recipients,
          confirmationDeadline: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tradeShipment: {
        findUnique: jest.fn().mockResolvedValue(shipment),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: "ship-1", ...data }),
          ),
        findMany: jest.fn().mockResolvedValue([
          {
            status: ShipmentStatus.delivered,
            deliveredAt: new Date("2026-08-12T09:00:00.000Z"),
          },
          {
            status: opts.otherLegDelivered
              ? ShipmentStatus.delivered
              : ShipmentStatus.in_transit,
            deliveredAt: opts.otherLegDelivered
              ? new Date("2026-08-12T10:00:00.000Z")
              : null,
          },
        ]),
      },
      platformSetting: {
        findUnique: jest.fn().mockResolvedValue({ settingValue: "3" }),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminTradeWarehouseService(
      prisma as any,
      audit as any,
      {} as any, // paymentService
      {} as any, // eventService
      {} as any, // cargo
      {} as any, // tradeCommon
    );
    return { service, tx, audit };
  };

  it("iki koli de teslimse onay penceresini başlatır", async () => {
    const { service, tx } = makeService({ otherLegDelivered: true });

    const res = await service.markOutboundDelivered(
      "admin-1",
      "trade-1",
      "ship-1",
      "kurye telefonla doğruladı",
    );

    expect(tx.tradeShipment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ShipmentStatus.delivered }),
      }),
    );
    expect(tx.trade.updateMany).toHaveBeenCalled();
    expect(res.confirmationDeadline).toBeInstanceOf(Date);
  });

  it("karşı koli teslim değilse pencere BAŞLAMAZ", async () => {
    const { service, tx } = makeService({ otherLegDelivered: false });

    const res = await service.markOutboundDelivered(
      "admin-1",
      "trade-1",
      "ship-1",
    );

    expect(tx.trade.updateMany).not.toHaveBeenCalled();
    expect(res.confirmationDeadline).toBeNull();
  });

  it("takas çıkış sevkinde değilse reddeder", async () => {
    const { service, tx } = makeService({
      tradeStatus: TradeStatus.at_warehouse,
    });

    await expect(
      service.markOutboundDelivered("admin-1", "trade-1", "ship-1"),
    ).rejects.toThrow();
    expect(tx.tradeShipment.update).not.toHaveBeenCalled();
  });

  it("giriş bacağı bu uçtan işaretlenemez", async () => {
    const { service, tx } = makeService({
      shipment: {
        id: "ship-1",
        tradeId: "trade-1",
        leg: "to_warehouse",
        status: ShipmentStatus.in_transit,
        deliveredAt: null,
      },
    });

    await expect(
      service.markOutboundDelivered("admin-1", "trade-1", "ship-1"),
    ).rejects.toThrow();
    expect(tx.tradeShipment.update).not.toHaveBeenCalled();
  });

  it("zaten teslim edilmiş koli: tarih ötelenmez, yalnız pencere onarılır", async () => {
    // Alarm ("koliler teslim ama pencere kurulamadı") tam bu durumu işaret
    // eder; uç reddetseydi admin'in elinde onarım aracı kalmazdı.
    const { service, tx } = makeService({
      shipment: {
        id: "ship-1",
        tradeId: "trade-1",
        leg: "from_warehouse",
        status: ShipmentStatus.delivered,
        deliveredAt: new Date("2026-08-10T09:00:00.000Z"),
      },
      otherLegDelivered: true,
    });

    const res = await service.markOutboundDelivered(
      "admin-1",
      "trade-1",
      "ship-1",
    );

    expect(tx.tradeShipment.update).not.toHaveBeenCalled();
    expect(tx.trade.updateMany).toHaveBeenCalled();
    expect(res.confirmationDeadline).toBeInstanceOf(Date);
  });

  it("iptal/dönüş bacağı delivered'a ZORLANAMAZ (#86 durum makinesi)", async () => {
    const { service, tx } = makeService({
      shipment: {
        id: "ship-1",
        tradeId: "trade-1",
        leg: "from_warehouse",
        status: ShipmentStatus.returned,
        deliveredAt: null,
      },
    });

    await expect(
      service.markOutboundDelivered("admin-1", "trade-1", "ship-1"),
    ).rejects.toThrow();
    expect(tx.tradeShipment.update).not.toHaveBeenCalled();
  });
});
