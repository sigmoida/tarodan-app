import { ShippingService } from "./shipping.service";
import { ShipmentStatus } from "@prisma/client";

/**
 * #5 (takip anahtarı bozulması): Manuel updateTracking, satıcının girdiği taşıyıcı
 * kodunu providerTrackingId'ye yazar; trackingNumber (Sürat sorgu anahtarı /
 * OzelKargoTakipNo) YALNIZCA hâlâ boşsa doldurulur — mevcut Sürat anahtarı ezilmez.
 */
describe("ShippingService.updateTracking — #5 tracking-key koruması", () => {
  const makeService = (shipment: any) => {
    const captured = { updateData: undefined as any };
    const tx = {
      shipment: {
        updateMany: jest.fn().mockImplementation((arg: any) => {
          captured.updateData = arg.data;
          return Promise.resolve({ count: 1 });
        }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...shipment, events: [] }),
      },
      shipmentEvent: { create: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      shipment: {
        findUnique: jest.fn().mockResolvedValue(shipment),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any;
    const notificationService = {
      notifyOrderShipped: jest.fn().mockResolvedValue(undefined),
    } as any;
    const svc = new ShippingService(
      prisma,
      {} as any, // configService
      {} as any, // paymentService
      notificationService,
      {
        getActiveOutboundTariff: async () => ({
          freeShippingEnabled: true,
          freeShippingThreshold: 500,
        }),
      } as any, // shippingTariffs
    );
    return { svc, captured };
  };

  const baseShipment = (over: any) => ({
    id: "sh1",
    orderId: "o1",
    provider: "surat",
    status: ShipmentStatus.pending,
    trackingNumber: null,
    order: { sellerId: "seller-1", buyerId: "buyer-1" },
    ...over,
  });

  it("Sürat-yönetimli gönderide (trackingNumber dolu) sorgu anahtarını EZMEZ", async () => {
    const { svc, captured } = makeService(
      baseShipment({ trackingNumber: "OZEL-QUERY-KEY-123" }),
    );

    await svc.updateTracking("sh1", "seller-1", {
      trackingNumber: "SELLER-CARRIER-999",
    } as any);

    // trackingNumber update'e dahil edilMEmeli (mevcut Sürat anahtarı korunur)
    expect(captured.updateData.trackingNumber).toBeUndefined();
    // satıcı kodu providerTrackingId'ye gitmeli
    expect(captured.updateData.providerTrackingId).toBe("SELLER-CARRIER-999");
    expect(captured.updateData.status).toBe(ShipmentStatus.picked_up);
  });

  it("Sürat anahtarı yoksa (manuel gönderi) trackingNumber doldurulur", async () => {
    const { svc, captured } = makeService(
      baseShipment({ trackingNumber: null }),
    );

    await svc.updateTracking("sh1", "seller-1", {
      trackingNumber: "MANUAL-123",
    } as any);

    expect(captured.updateData.trackingNumber).toBe("MANUAL-123");
    expect(captured.updateData.providerTrackingId).toBe("MANUAL-123");
  });
});
