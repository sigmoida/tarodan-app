import { ShipmentStatus } from "@prisma/client";
import { ShippingService } from "./shipping.service";

/**
 * Taşıyıcı webhook'u KOLİ seviyesindedir: bir OrderPackage = bir fiziksel
 * gönderi = bir OzelKargoTakipNo (PKG-…), ama kayıt sipariş başınadır. Eskiden
 * `findFirst` ile yalnız BİR kardeş güncelleniyordu → çok ürünlü kolinin diğer
 * satırları kargoda takılı kalıyor, teslimde escrow'ları hiç açılmıyordu.
 */
describe("ShippingService.handleProviderWebhook — koli bazlı yayılım", () => {
  const shipment = (id: string, orderId: string, status = "in_transit") => ({
    id,
    orderId,
    status,
    provider: "surat",
    trackingNumber: "PKG-COLI0001",
    order: { id: orderId },
  });

  const makeService = (siblings: any[]) => {
    const tx = {
      shipment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      shipmentEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      shipment: { findMany: jest.fn().mockResolvedValue(siblings) },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const paymentService = {
      handleOrderDelivered: jest.fn().mockResolvedValue({ acted: true }),
    };
    const service = new ShippingService(
      prisma as any,
      paymentService as any,
      {} as any, // notificationService
      {} as any, // shippingTariffs
      {} as any, // orderShipments
    );
    return { service, prisma, tx, paymentService };
  };

  it("teslim edildi → kolinin TÜM sipariş satırları güncellenir ve her biri escrow'a girer", async () => {
    const { service, tx, paymentService } = makeService([
      shipment("sh-1", "o1"),
      shipment("sh-2", "o2"),
      shipment("sh-3", "o3"),
    ]);

    const res = await service.handleProviderWebhook("surat", {
      trackingNumber: "PKG-COLI0001",
      status: "delivered",
    });

    expect(res).toEqual({ status: "ok" });
    expect(tx.shipment.updateMany).toHaveBeenCalledTimes(3);
    expect(tx.shipmentEvent.create).toHaveBeenCalledTimes(3);
    // Escrow/teslim onayı SİPARİŞ bazındadır — üç satır da işlenir.
    expect(paymentService.handleOrderDelivered).toHaveBeenCalledTimes(3);
    expect(
      paymentService.handleOrderDelivered.mock.calls.map((c: any[]) => c[0]),
    ).toEqual(["o1", "o2", "o3"]);
  });

  it("kardeşlerden biri geçersiz geçişteyse yalnız o atlanır, koli geri kalmaz", async () => {
    const { service, tx, paymentService } = makeService([
      shipment("sh-1", "o1"),
      // Admin bu satırı iptal etmiş: in_transit'e geri döndürülemez.
      shipment("sh-2", "o2", ShipmentStatus.cancelled),
      shipment("sh-3", "o3"),
    ]);

    const res = await service.handleProviderWebhook("surat", {
      trackingNumber: "PKG-COLI0001",
      status: "in_transit",
    });

    expect(res).toEqual({ status: "ok" });
    expect(tx.shipment.updateMany).toHaveBeenCalledTimes(2);
    expect(paymentService.handleOrderDelivered).not.toHaveBeenCalled();
  });

  it("hiçbir kardeş yazılamazsa (hepsi stale) ignored döner", async () => {
    const { service, prisma, tx } = makeService([
      shipment("sh-1", "o1"),
      shipment("sh-2", "o2"),
    ]);
    tx.shipment.updateMany.mockResolvedValue({ count: 0 });

    const res = await service.handleProviderWebhook("surat", {
      trackingNumber: "PKG-COLI0001",
      status: "delivered",
    });

    expect(res).toEqual({ status: "ignored" });
    expect(prisma.shipment.findMany).toHaveBeenCalledTimes(1);
  });

  it("eşleşen kayıt yoksa ignored döner", async () => {
    const { service } = makeService([]);

    const res = await service.handleProviderWebhook("surat", {
      trackingNumber: "PKG-YOK",
      status: "delivered",
    });

    expect(res).toEqual({ status: "ignored" });
  });
});
