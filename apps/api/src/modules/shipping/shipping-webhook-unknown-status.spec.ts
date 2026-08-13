import { ShipmentStatus } from "@prisma/client";
import { ShippingService } from "./shipping.service";

/**
 * Taşıyıcı webhook'unda TANIMADIĞIMIZ durum kodu, gönderinin durumunu
 * DEĞİŞTİRMEZ.
 *
 * Eski eşleme (`statusMap[status] || in_transit`) eşleşmeyen her değeri "yolda"
 * sayıyordu: taşıyıcının gönderdiği bir iade/iptal sinyali sessizce yolda'ya
 * dönüşüp kayboluyordu. Sürat poller'ında aynı kural (L2) zaten uygulanıyor;
 * webhook da onunla aynı davranmalı.
 */
describe("ShippingService.handleProviderWebhook — bilinmeyen durum", () => {
  const makeService = (
    shipmentStatus: ShipmentStatus = ShipmentStatus.in_transit,
  ) => {
    const tx = {
      shipment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      shipmentEvent: { create: jest.fn() },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      shipment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "sh-1",
            orderId: "o1",
            status: shipmentStatus,
            packageId: "pkg-1",
            order: { id: "o1", buyerId: "b1", status: "shipped" },
          },
        ]),
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const service = new ShippingService(
      prisma as any,
      {} as any, // paymentService (duyuru çağrıları optional-call ile korunur)
      {} as any, // notificationService
      {} as any, // shippingTariffs
      {} as any, // orderShipments
    );
    return { service, tx, prisma };
  };

  it("bilinmeyen durumu yok sayar, gönderiye dokunmaz", async () => {
    const { service, tx } = makeService();

    const result = await service.handleProviderWebhook("surat", {
      trackingNumber: "PKG-1",
      status: "kargo_iade_edildi",
    });

    expect(result).toEqual({ status: "ignored" });
    expect(tx.shipment.updateMany).not.toHaveBeenCalled();
  });

  it("eşlenmiş durumu normal işler", async () => {
    const { service, tx } = makeService(ShipmentStatus.picked_up);

    const result = await service.handleProviderWebhook("surat", {
      trackingNumber: "PKG-1",
      status: "in_transit",
    });

    expect(result).toEqual({ status: "ok" });
    expect(tx.shipment.updateMany).toHaveBeenCalled();
  });

  it("iade ve iptal artık eşlenmiştir (yolda'ya düşmez)", async () => {
    const { service, tx } = makeService(ShipmentStatus.in_transit);

    await service.handleProviderWebhook("surat", {
      trackingNumber: "PKG-1",
      status: "returned",
    });

    expect(tx.shipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ShipmentStatus.returned }),
      }),
    );
  });
});
