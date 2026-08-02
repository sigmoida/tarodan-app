import { OrderStatus, ShipmentStatus } from "@prisma/client";
import { OrderTrackingSyncService } from "./order-tracking-sync.service";

describe("OrderTrackingSyncService", () => {
  const shipment = (overrides: Record<string, unknown> = {}) => ({
    id: "shipment-1",
    orderId: "order-1",
    provider: "surat",
    status: ShipmentStatus.in_transit,
    trackingNumber: "PACKAGE-REF-1",
    providerTrackingId: null,
    trackingUrl: null,
    estimatedDelivery: null,
    order: { id: "order-1", status: OrderStatus.shipped },
    ...overrides,
  });

  const tracking = (code: number, overrides: Record<string, unknown> = {}) => ({
    KargonunDurumuSayi: code,
    KargonunDurumu: `status-${code}`,
    KargoTakipNo: "SURAT-CODE-1",
    TakipUrl: "https://www.suratkargo.com.tr/KargoTakip/",
    TeslimTarihi: code === 6 ? "28.07.2026 12:00:00" : "",
    TeslimAlan: code === 6 ? "Buyer" : "",
    PlanlananTeslimTarihi: "",
    IadeAciklama: code === 12 ? "Alıcı kabul etmedi" : "",
    DevirSebebi: "",
    Tutar: "36.00",
    TutarKdvsiz: "30.00",
    KdvTutar: "6.00",
    ToplamDesiKg: "2",
    Hareketler: [],
    ...overrides,
  });

  const makeService = (opts?: {
    shipment?: Record<string, unknown>;
    code?: number;
    casCount?: number;
    refundClaimCount?: number;
  }) => {
    const tx = {
      shipment: {
        updateMany: jest.fn().mockResolvedValue({ count: opts?.casCount ?? 1 }),
      },
    };
    const prisma = {
      shipment: {
        findUnique: jest.fn().mockResolvedValue(opts?.shipment ?? shipment()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      shipmentEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      order: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts?.refundClaimCount ?? 1 }),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const paymentService = {
      handleOrderDelivered: jest.fn().mockResolvedValue({
        acted: true,
        use48h: false,
        confirmationDeadline: null,
        buyerId: "buyer-1",
      }),
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const moduleRef = {
      get: jest.fn().mockReturnValue(paymentService),
    };
    const client = {
      fetchTrackingInfo: jest.fn().mockResolvedValue({
        Gonderiler: [tracking(opts?.code ?? 6)],
      }),
      parseSuratDate: jest
        .fn()
        .mockReturnValue(new Date("2026-07-28T09:00:00.000Z")),
    };
    const service = new OrderTrackingSyncService(
      prisma as any,
      moduleRef as any,
      client as any,
    );
    return { service, prisma, tx, client, paymentService };
  };

  it("queries with the package reference and atomically applies delivery escrow", async () => {
    const { service, tx, client, paymentService } = makeService();

    await expect(service.syncShipmentTracking("shipment-1")).resolves.toBe(
      true,
    );

    expect(client.fetchTrackingInfo).toHaveBeenCalledWith("PACKAGE-REF-1");
    expect(tx.shipment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "shipment-1",
        status: ShipmentStatus.in_transit,
      },
      data: expect.objectContaining({
        status: ShipmentStatus.delivered,
        providerStatusCode: 6,
        providerTrackingId: "SURAT-CODE-1",
        deliveredAt: new Date("2026-07-28T09:00:00.000Z"),
        carrierActualCost: 36,
        carrierNetCost: 30,
        carrierTaxAmount: 6,
        carrierDesi: 2,
        carrierCostSyncedAt: expect.any(Date),
      }),
    });
    expect(paymentService.handleOrderDelivered).toHaveBeenCalledWith(
      "order-1",
      new Date("2026-07-28T09:00:00.000Z"),
      tx,
    );
  });

  it("does not regress a delivered shipment on an older carrier event", async () => {
    const delivered = shipment({ status: ShipmentStatus.delivered });
    const { service, prisma, tx } = makeService({
      shipment: delivered,
      code: 3,
    });

    await expect(service.syncShipmentTracking("shipment-1")).resolves.toBe(
      false,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.shipment.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the internal status for an unknown Sürat code while recording raw data", async () => {
    const { service, tx, paymentService } = makeService({ code: 99 });

    await expect(service.syncShipmentTracking("shipment-1")).resolves.toBe(
      true,
    );

    expect(tx.shipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ShipmentStatus.in_transit,
          providerStatusCode: 99,
          providerRawStatus: "status-99",
        }),
      }),
    );
    expect(paymentService.handleOrderDelivered).not.toHaveBeenCalled();
  });

  it("claims and refunds an outbound shipment returned to sender", async () => {
    const { service, prisma, paymentService } = makeService({ code: 12 });

    await expect(service.syncShipmentTracking("shipment-1")).resolves.toBe(
      true,
    );

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        status: {
          notIn: [OrderStatus.cancelled, OrderStatus.refunded],
        },
      },
      data: { status: OrderStatus.refund_requested },
    });
    expect(paymentService.processRefund).toHaveBeenCalledWith("order-1");
    expect(paymentService.handleOrderDelivered).not.toHaveBeenCalled();
  });

  it("does not run delivery side effects after losing the shipment CAS", async () => {
    const { service, paymentService } = makeService({ casCount: 0 });

    await expect(service.syncShipmentTracking("shipment-1")).resolves.toBe(
      false,
    );
    expect(paymentService.handleOrderDelivered).not.toHaveBeenCalled();
    expect(paymentService.processRefund).not.toHaveBeenCalled();
  });

  it("polls Sürat ONCE per parcel and applies the result to every sibling row", async () => {
    // Aynı koli (PKG-…) = aynı OzelKargoTakipNo'yu paylaşan 3 sipariş satırı +
    // ayrı bir koli. Eskiden her satır için ayrı Sürat çağrısı yapılıyordu.
    const { service, prisma, client, tx } = makeService();
    prisma.shipment.findMany.mockResolvedValue([
      shipment({ id: "s1", orderId: "o1", trackingNumber: "PKG-AAA" }),
      shipment({ id: "s2", orderId: "o2", trackingNumber: "PKG-AAA" }),
      shipment({ id: "s3", orderId: "o3", trackingNumber: "PKG-AAA" }),
      shipment({ id: "s4", orderId: "o4", trackingNumber: "PKG-BBB" }),
    ]);

    const res = await service.syncAllActiveShipments();

    // 4 satır, 2 koli → 2 çağrı (4 değil).
    expect(client.fetchTrackingInfo).toHaveBeenCalledTimes(2);
    expect(client.fetchTrackingInfo).toHaveBeenCalledWith("PKG-AAA");
    expect(client.fetchTrackingInfo).toHaveBeenCalledWith("PKG-BBB");
    // Ama güncelleme SATIR bazında kalır: iade/escrow muhasebesi sipariş bazlı.
    expect(tx.shipment.updateMany).toHaveBeenCalledTimes(4);
    expect(res).toEqual({ synced: 4, failed: 0 });
  });
});
