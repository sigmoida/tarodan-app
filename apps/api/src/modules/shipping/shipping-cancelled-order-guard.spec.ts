import { OrderStatus, ShipmentStatus } from "@prisma/client";
import { ShippingService } from "./shipping.service";

/**
 * "Kargoya verildikten sonra iptal edilemez" kuralının AYNASI: iptal/iade ile
 * kapanmış sipariş kargoya verilmiş olarak İŞARETLENEMEZ.
 *
 * Eskiden updateTracking yalnız kargo satırına bakıyordu; iptal edilmiş
 * siparişin kargosu `pending`/`label_created` kalabildiği için sipariş
 * cancelled → shipped'e diriliyordu. Sonuç: teslimde escrow release tarihi
 * kuruluyor ve KISMİ iade sonrası kalan tutar satıcıya ödeniyordu.
 */
describe("ShippingService.updateTracking — kapanmış sipariş guard'ı", () => {
  const makeService = (opts: {
    orderStatus: OrderStatus;
    shipmentStatus?: ShipmentStatus;
    /** tx içindeki koşullu güncellemenin eşleştirdiği satır sayısı. */
    orderUpdateCount?: number;
  }) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      shipment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: "ship-1", events: [] }),
      },
      shipmentEvent: { create: jest.fn().mockResolvedValue({}) },
      order: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.orderUpdateCount ?? 1 }),
      },
    };
    const prisma = {
      shipment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "ship-1",
          orderId: "order-1",
          status: opts.shipmentStatus ?? ShipmentStatus.label_created,
          trackingNumber: null,
          provider: "surat",
          order: { sellerId: "seller-1", status: opts.orderStatus },
        }),
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const service = new ShippingService(
      prisma as any,
      {} as any, // paymentService
      { notifyOrderShipped: jest.fn() } as any, // notificationService
      {} as any, // shippingTariff
      {} as any, // orderShipments
    );
    return { service, prisma, tx };
  };

  const dto = { trackingNumber: "TRK-1" } as any;

  it("iptal edilmiş siparişte reddeder, kargo satırına DOKUNMAZ", async () => {
    const { service, tx } = makeService({
      orderStatus: OrderStatus.cancelled,
    });

    await expect(
      service.updateTracking("ship-1", "seller-1", dto),
    ).rejects.toThrow();
    expect(tx.shipment.updateMany).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it("iade sürecindeki siparişte reddeder", async () => {
    const { service, tx } = makeService({
      orderStatus: OrderStatus.refund_requested,
    });

    await expect(
      service.updateTracking("ship-1", "seller-1", dto),
    ).rejects.toThrow();
    expect(tx.shipment.updateMany).not.toHaveBeenCalled();
  });

  it("hazırlanan siparişte kargoya verir ve statüyü KOŞULLU yazar", async () => {
    const { service, tx } = makeService({ orderStatus: OrderStatus.preparing });

    await service.updateTracking("ship-1", "seller-1", dto);

    expect(tx.shipment.updateMany).toHaveBeenCalled();
    const call = tx.order.updateMany.mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({
        id: "order-1",
        status: { in: [OrderStatus.paid, OrderStatus.preparing] },
      }),
    );
    expect(call.data).toEqual(
      expect.objectContaining({ status: OrderStatus.shipped }),
    );
  });

  it("ön kontrol ile tx arasında iptal commit olduysa TÜM tx geri sarılır", async () => {
    // Koşullu güncelleme 0 satır eşleştirir → throw → kargo satırı da
    // picked_up'ta kalmaz (tx rollback).
    const { service, tx } = makeService({
      orderStatus: OrderStatus.preparing,
      orderUpdateCount: 0,
    });

    await expect(
      service.updateTracking("ship-1", "seller-1", dto),
    ).rejects.toThrow();
    expect(tx.order.updateMany).toHaveBeenCalled();
  });
});
