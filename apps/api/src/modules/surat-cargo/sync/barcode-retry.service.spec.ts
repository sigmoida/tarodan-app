import { Logger } from "@nestjs/common";
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
    const tradeShipments = { retryInboundBarcode: jest.fn() };
    const tradeWarehouse = { retryReturnBarcode: jest.fn() };
    const moduleRef = {
      get: jest.fn((token: { name?: string }) =>
        token?.name === "TradeShipmentService"
          ? tradeShipments
          : token?.name === "AdminTradeWarehouseService"
            ? tradeWarehouse
            : undefined,
      ),
    };
    const service = new BarcodeRetryService(
      prisma as any,
      moduleRef as any,
      cache as any,
      orderShipments as any,
    );
    return { service, prisma, orderShipments, tradeShipments, tradeWarehouse };
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
    ).resolves.toEqual({ retried: 1, failed: 0, failures: [] });

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
  it("reports the failed shipment id and the reason, not just a count", async () => {
    const { service, prisma, orderShipments } = makeService();
    prisma.shipment.findMany.mockResolvedValue([
      {
        id: "shipment-1",
        orderId: "order-1",
        trackingNumber: "PKG-1",
        order: { orderNumber: "ORD-1", sellerId: "seller-1" },
      },
      {
        id: "shipment-2",
        orderId: "order-2",
        trackingNumber: "PKG-2",
        order: { orderNumber: "ORD-2", sellerId: "seller-2" },
      },
    ]);
    orderShipments.createBarcode
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("carrier timeout"));

    const result = await (service as any).retryPendingOrderBarcodes(
      new Date(0),
      new Date(),
    );

    expect(result.retried).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.failures).toEqual([
      "order shipment-1 (carrier returned no barcode)",
      "order shipment-2 (carrier timeout)",
    ]);
  });

  // One failure, one alarm: the run summary is the alarm, each record only
  // gets a warn line of its own (the summary lists the first few).
  it("logs each failed record at warn and none at error", async () => {
    const { service, prisma, orderShipments } = makeService();
    prisma.shipment.findMany.mockResolvedValue([
      {
        id: "shipment-1",
        orderId: "order-1",
        trackingNumber: "PKG-1",
        order: { orderNumber: "ORD-1", sellerId: "seller-1" },
      },
      {
        id: "shipment-2",
        orderId: "order-2",
        trackingNumber: "PKG-2",
        order: { orderNumber: "ORD-2", sellerId: "seller-2" },
      },
    ]);
    orderShipments.createBarcode
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("carrier timeout"));
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    try {
      await (service as any).retryPendingOrderBarcodes(new Date(0), new Date());

      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        "Barcode retry failed: order shipment-1 (carrier returned no barcode)",
      );
      expect(warn).toHaveBeenCalledWith(
        "Barcode retry failed: order shipment-2 (carrier timeout)",
      );
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
  it("names failed trade legs by id and reason, at warn only", async () => {
    const { service, prisma, tradeShipments, tradeWarehouse } = makeService();
    prisma.tradeShipment.findMany
      .mockResolvedValueOnce([{ id: "ts-in-1" }, { id: "ts-in-2" }])
      .mockResolvedValueOnce([{ id: "ts-ret-1" }]);
    tradeShipments.retryInboundBarcode
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("carrier timeout"));
    tradeWarehouse.retryReturnBarcode.mockRejectedValueOnce(
      new Error("address rejected"),
    );
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    try {
      const result = await (service as any).retryPendingTradeBarcodes(
        new Date(0),
        new Date(),
      );

      expect(result).toEqual({
        retried: 0,
        failed: 3,
        failures: [
          "trade-inbound ts-in-1 (retry reported not completed)",
          "trade-inbound ts-in-2 (carrier timeout)",
          "trade-return ts-ret-1 (address rejected)",
        ],
      });
      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(3);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
