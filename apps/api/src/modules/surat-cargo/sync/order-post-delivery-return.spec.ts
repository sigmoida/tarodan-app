import { OrderStatus, ShipmentStatus } from "@prisma/client";
import { OrderTrackingSyncService } from "./order-tracking-sync.service";

/**
 * Prod vakası (PKG-56HMSK9TX5): koli alıcıya teslim edildi, operatör taşıyıcıyı
 * arayıp elle iade başlattı, koli AYNI etiketle satıcıya döndü. İki ayrı kusur
 * üst üste bindi ve sipariş sistemde "Teslim Edildi"de dondu:
 *
 *   1. Teslim edilen koli poller sorgusundan düşüyordu → iade hiç görülmedi.
 *   2. Görülse bile tamamlanma yalnız kod 12'ye bağlıydı; canlıda 13 geldi.
 *
 * Ayrıca teslim sonrası izleme açılınca yeni bir risk doğuyor: aynı sipariş için
 * elle açılmış bir iade talebi yürürken otomatik iade de tetiklenirse alıcıya iki
 * kez para iade edilebilir. Üçü de burada kilitleniyor.
 */
describe("post-delivery carrier return", () => {
  const DELIVERED_AT = new Date("2026-08-21T07:51:48.520Z");

  /** Sürat'ın gerçek cevabı: tamamlanmış iade kod 12 DEĞİL, 13 ile geliyor. */
  const returnedGonderi = {
    KargonunDurumuSayi: 13,
    KargonunDurumu: "Teslim Edildi (İade)",
    IadeDurum: "Evet",
    IadeAciklama: "Alıcı Kabul Etmedi",
    DevirSebebi: "",
    KargoTakipNo: "17514233432521",
    TakipUrl: "https://www.suratkargo.com.tr/KargoTakip/",
    TeslimTarihi: "21/08/2026",
    TeslimAlan: "AHMET ÖZDEMİR",
    PlanlananTeslimTarihi: "",
    Tutar: "122.09",
    TutarKdvsiz: "101.74",
    KdvTutar: "20.35",
    ToplamDesiKg: "3",
    Hareketler: [
      { Islem: "İade Edildi", IslemTarihi: "2026-08-21T12:09:50.403" },
    ],
  };

  const deliveredShipment = {
    id: "shipment-1",
    orderId: "order-1",
    provider: "surat",
    status: ShipmentStatus.delivered,
    trackingNumber: "PKG-56HMSK9TX5",
    providerTrackingId: "17514233432521",
    trackingUrl: "https://www.suratkargo.com.tr/KargoTakip/",
    estimatedDelivery: null,
    shippedAt: new Date("2026-08-21T06:30:01.113Z"),
    order: { id: "order-1", buyerId: "buyer-1", status: OrderStatus.completed },
  };

  const makeService = (openRefund: Record<string, unknown> | null) => {
    const tx = {
      shipment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      shipment: {
        findMany: jest.fn().mockResolvedValue([deliveredShipment]),
        findUnique: jest.fn().mockResolvedValue(deliveredShipment),
      },
      shipmentEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(openRefund) },
      $transaction: jest.fn((fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const paymentService = {
      handleOrderDelivered: jest.fn().mockResolvedValue({ acted: false }),
      processRefund: jest.fn().mockResolvedValue({ success: true }),
      announceOrderDelivered: jest.fn(),
    };
    const client = {
      lookupTracking: jest
        .fn()
        .mockResolvedValue({
          kind: "found",
          data: { Gonderiler: [returnedGonderi] },
        }),
      parseSuratDate: jest.fn().mockReturnValue(DELIVERED_AT),
    };
    const service = new OrderTrackingSyncService(
      prisma as any,
      { get: () => paymentService } as any,
      client as any,
    );
    return { service, prisma, tx, client, paymentService };
  };

  it("keeps asking about a parcel that was already delivered", async () => {
    const { service, prisma } = makeService(null);

    await service.syncPostDeliveryShipments(48);

    const where = prisma.shipment.findMany.mock.calls[0][0].where;
    expect(where.status).toBe(ShipmentStatus.delivered);
    expect(where.deliveredAt.gte).toBeInstanceOf(Date);
    // Pencere geçmişe bakar: yaşlı uç taze uçtan önce gelmeli.
    expect(where.deliveredAt.gte.getTime()).toBeLessThan(
      where.deliveredAt.lt.getTime(),
    );
  });

  it("moves the parcel out of `delivered` once the carrier returns it", async () => {
    const { service, tx } = makeService(null);

    await service.syncPostDeliveryShipments(48);

    expect(tx.shipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "shipment-1", status: ShipmentStatus.delivered },
        data: expect.objectContaining({
          status: ShipmentStatus.returned,
          providerStatusCode: 13,
          returnReason: "Alıcı Kabul Etmedi",
        }),
      }),
    );
  });

  it("records the movements the old code never ingested", async () => {
    const { service, prisma } = makeService(null);

    await service.syncPostDeliveryShipments(48);

    expect(prisma.shipmentEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ status: "İade Edildi" })],
      }),
    );
  });

  it("refunds automatically when nobody opened a refund by hand", async () => {
    const { service, prisma, paymentService } = makeService(null);

    await service.syncPostDeliveryShipments(48);

    expect(prisma.order.updateMany).toHaveBeenCalled();
    expect(paymentService.processRefund).toHaveBeenCalledWith("order-1");
  });

  it("does NOT refund again when a refund is already in flight", async () => {
    // Bugünkü vaka: operatör panelden iade açmıştı. İki yol da parayı iade
    // ederse alıcıya iki kez ödeme çıkar.
    const { service, prisma, paymentService } = makeService({
      id: "refund-1",
      refundNumber: "RFD-M8EYBFH8A6",
      status: "return_delivered",
    });

    await service.syncPostDeliveryShipments(48);

    expect(paymentService.processRefund).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});
