import { ShipmentStatus } from "@prisma/client";
import { BarcodeRetryService } from "./barcode-retry.service";

describe("BarcodeRetryService carrier registration semantics", () => {
  const makeService = () => {
    const prisma = {
      shipment: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      tradeShipment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const orderShipments = {
      ensure: jest.fn(),
      createBarcode: jest.fn().mockResolvedValue({
        kargoTakipNo: null,
        labelZpl: null,
      }),
    };
    const service = new BarcodeRetryService(
      prisma as any,
      {} as any,
      cache as any,
      orderShipments as any,
    );
    return { service, prisma, orderShipments };
  };

  it("retries only pending registrations, not label_created acceptance waits", async () => {
    const { service, prisma } = makeService();

    await (service as any).retryPendingOrderBarcodes(new Date(0), new Date());
    await (service as any).retryPendingTradeBarcodes(new Date(0), new Date());

    expect(prisma.shipment.findMany.mock.calls[0][0].where.status).toBe(
      ShipmentStatus.pending,
    );
    for (const call of prisma.tradeShipment.findMany.mock.calls) {
      expect(call[0].where.status).toBe(ShipmentStatus.pending);
    }
  });

  it("marks a successful pre-advice as label_created even without a real code", async () => {
    const { service, prisma, orderShipments } = makeService();
    prisma.shipment.findMany.mockResolvedValue([
      {
        id: "shipment-1",
        orderId: "order-1",
        trackingNumber: "PKG-1",
        order: {
          orderNumber: "ORD-1",
          sellerId: "seller-1",
        },
      },
    ]);

    await expect(
      (service as any).retryPendingOrderBarcodes(new Date(0), new Date()),
    ).resolves.toEqual({ retried: 1, failed: 0 });

    expect(orderShipments.createBarcode).toHaveBeenCalledWith(
      "order-1",
      "PKG-1",
    );
    expect(prisma.shipment.update).toHaveBeenCalledWith({
      where: { id: "shipment-1" },
      data: {
        providerTrackingId: null,
        labelZpl: null,
        status: ShipmentStatus.label_created,
      },
    });
  });
});
