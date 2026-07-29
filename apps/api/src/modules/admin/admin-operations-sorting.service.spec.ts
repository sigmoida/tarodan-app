/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminMessagingService } from "./admin-messaging.service";
import { AdminOrderService } from "./admin-order.service";
import { AdminPaymentService } from "./admin-payment.service";
import { AdminRefundService } from "./admin-refund.service";
import { AdminShippingService } from "./admin-shipping.service";
import { AdminTradeQueryService } from "./admin-trade-query.service";

function createDelegate() {
  return {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  };
}

describe("admin operations list sorting", () => {
  it("paginates orders by checkout group so a cart stays on one page", async () => {
    const checkoutGroup = createDelegate();
    const service = new AdminOrderService(
      { checkoutGroup } as any,
      {} as any,
      undefined as any,
    );

    await service.getOrders({
      page: 2,
      limit: 5,
    });

    expect(checkoutGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        select: { id: true },
        skip: 5,
        take: 5,
      }),
    );
  });

  it("returns every checkout group as one complete admin row source", async () => {
    const checkoutGroup = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([{ id: "group-1" }]),
    };
    const order = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "order-1",
          orderNumber: "ORD-1",
          checkoutGroupId: "group-1",
          packageId: "package-1",
          buyerId: "buyer-1",
          sellerId: "seller-1",
          productId: "product-1",
          totalAmount: 130,
          subtotal: 100,
          commissionAmount: 10,
          shippingAddress: {},
          checkoutGroup: { groupNumber: "GRP-1" },
          buyer: {
            id: "buyer-1",
            displayName: "Buyer",
            email: "buyer@example.com",
          },
          seller: {
            id: "seller-1",
            displayName: "Seller",
            email: "seller@example.com",
          },
          product: {
            id: "product-1",
            title: "Product",
            images: [],
          },
          shipment: {
            id: "shipment-1",
            status: "shipped",
            trackingNumber: "INTERNAL-1",
            providerTrackingId: "SURAT-1",
          },
          refundRequests: [],
          createdAt: new Date("2026-07-29T08:00:00.000Z"),
        },
      ]),
    };
    const service = new AdminOrderService(
      { checkoutGroup, order } as any,
      {} as any,
      undefined as any,
    );

    const result = await service.getOrders({ page: 1, limit: 20 });

    expect(result.data).toEqual([
      expect.objectContaining({
        id: "order-1",
        checkoutGroupId: "group-1",
        groupNumber: "GRP-1",
        groupItemCount: 1,
        packageId: "package-1",
        shipmentId: "shipment-1",
        shipmentTrackingNumber: "SURAT-1",
        internalTrackingNumber: "INTERNAL-1",
      }),
    ]);
    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { checkoutGroupId: { in: ["group-1"] } },
      }),
    );
  });

  it("sorts trades by a scalar field", async () => {
    const trade = createDelegate();
    const service = new AdminTradeQueryService(
      { trade } as any,
      undefined as any,
    );

    await service.getTrades({
      sortBy: "cashAmount",
      sortOrder: "asc",
    });

    expect(trade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { cashAmount: "asc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("sorts refund requests by amount", async () => {
    const refundRequest = createDelegate();
    const service = new AdminRefundService(
      { refundRequest } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
    );

    await service.listRefundRequests({
      sortBy: "amount",
      sortOrder: "desc",
    });

    expect(refundRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { amount: "desc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("sorts messages by status", async () => {
    const message = createDelegate();
    const service = new AdminMessagingService({ message } as any, {} as any);

    await service.getMessages({ sortBy: "status", sortOrder: "asc" });

    expect(message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { status: "asc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("uses the standard twenty-row default for shipments", async () => {
    const shipment = createDelegate();
    const service = new AdminShippingService({ shipment } as any);

    await service.getShipments({ sortBy: "trackingNumber", sortOrder: "asc" });

    expect(shipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { trackingNumber: "asc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("searches shipment content across order, party, carrier, and tracking fields", async () => {
    const shipment = createDelegate();
    const service = new AdminShippingService({ shipment } as any);

    await service.getShipments({ search: "kaan" });

    expect(shipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              order: {
                buyer: {
                  displayName: { contains: "kaan", mode: "insensitive" },
                },
              },
            },
            {
              trackingNumber: { contains: "kaan", mode: "insensitive" },
            },
          ]),
        }),
      }),
    );
  });

  it("sorts trade shipments and preserves their updated-at default", async () => {
    const tradeShipment = createDelegate();
    const service = new AdminTradeQueryService(
      { tradeShipment, user: { findMany: jest.fn() } } as any,
      undefined as any,
    );

    await service.findTradeShipments({});

    expect(tradeShipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: "desc" },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("searches trade shipments across trade, carrier, tracking, and users", async () => {
    const tradeShipment = createDelegate();
    const userFindMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: "user-1" }])
      .mockResolvedValueOnce([]);
    const service = new AdminTradeQueryService(
      { tradeShipment, user: { findMany: userFindMany } } as any,
      undefined as any,
    );

    await service.findTradeShipments({ search: "kaan" });

    expect(tradeShipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              trade: {
                tradeNumber: { contains: "kaan", mode: "insensitive" },
              },
            },
            { shipperId: { in: ["user-1"] } },
          ]),
        }),
      }),
    );
  });

  it("sorts refund history and maps its response", async () => {
    const payment = createDelegate();
    const service = new AdminPaymentService(
      { payment } as any,
      {} as any,
      {} as any,
    );

    await service.getRefundHistory({ sortBy: "amount", sortOrder: "asc" });

    expect(payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { amount: "asc" },
        skip: 0,
        take: 20,
      }),
    );
  });
});
