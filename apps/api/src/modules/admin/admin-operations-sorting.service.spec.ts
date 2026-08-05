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
  it("paginates grouped and groupless orders as common row sources", async () => {
    const checkoutGroup = createDelegate();
    const order = createDelegate();
    const service = new AdminOrderService(
      { checkoutGroup, order } as any,
      {} as any,
      undefined as any,
    );

    await service.getOrders({
      page: 2,
      limit: 5,
    });

    expect(checkoutGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }],
        take: 10,
      }),
    );
    // Ürün türü şartı: üyelik ve öne çıkarma siparişleri de gruba bağlanmadan
    // oluşuyor; şart olmadan sanal ürün satırları operasyon listesine sızar.
    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          checkoutGroupId: null,
          product: { kind: "listing" },
        },
        take: 10,
      }),
    );
    expect(order.count).toHaveBeenCalledWith({
      where: {
        checkoutGroupId: null,
        product: { kind: "listing" },
      },
    });
  });

  it("gives both row sources the same tie-break so pages stay stable", async () => {
    const checkoutGroup = createDelegate();
    const order = createDelegate();
    const service = new AdminOrderService(
      { checkoutGroup, order } as any,
      {} as any,
      undefined as any,
    );

    // Eşit tutarlar `take` sınırında keyfi seçilirse bir satır iki sayfada
    // birden çıkar; ikincil anahtar iki kaynakta da AYNI olmak zorunda.
    await service.getOrders({
      page: 1,
      limit: 5,
      sortBy: "totalAmount",
      sortOrder: "asc",
    } as any);

    expect(checkoutGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ totalAmount: "asc" }, { createdAt: "desc" }],
      }),
    );
    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ totalAmount: "asc" }, { createdAt: "desc" }],
      }),
    );
  });

  it("orders equal-amount rows from both sources by the shared tie-break", async () => {
    const shared = 250;
    const checkoutGroup = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "group-1",
          groupNumber: "GRP-1",
          totalAmount: shared,
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          buyer: { displayName: "Buyer" },
        },
      ]),
    };
    const looseRow = {
      id: "order-1",
      orderNumber: "ORD-1",
      checkoutGroupId: null,
      buyerId: "buyer-1",
      sellerId: "seller-1",
      productId: "product-1",
      totalAmount: shared,
      subtotal: shared,
      commissionAmount: 0,
      shippingAddress: {},
      checkoutGroup: null,
      package: null,
      buyer: { id: "buyer-1", displayName: "Buyer", email: "b@example.com" },
      seller: { id: "seller-1", displayName: "Seller", email: "s@example.com" },
      product: { id: "product-1", title: "Product", images: [] },
      shipment: null,
      refundRequests: [],
      // Daha YENİ: eşitlikte createdAt DESC kuralı bunu öne almalı.
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
    };
    // Grubun ESKİ üyesi: satırlar aynı tutarda olduğu için sırayı yalnızca
    // ortak eşitlik kuralı belirler.
    const groupRow = {
      ...looseRow,
      id: "group-order-1",
      orderNumber: "ORD-2",
      checkoutGroupId: "group-1",
      checkoutGroup: { groupNumber: "GRP-1" },
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    const order = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: looseRow.id,
            orderNumber: looseRow.orderNumber,
            totalAmount: shared,
            createdAt: looseRow.createdAt,
            buyer: { displayName: "Buyer" },
          },
        ])
        .mockResolvedValueOnce([looseRow, groupRow]),
    };
    const service = new AdminOrderService(
      { checkoutGroup, order } as any,
      {} as any,
      undefined as any,
    );

    const result = await service.getOrders({
      page: 1,
      limit: 20,
      sortBy: "totalAmount",
      sortOrder: "asc",
    } as any);

    // Tutarlar eşit → createdAt DESC: daha yeni olan grupsuz sipariş önce.
    expect(result.data.map((row: any) => row.id)).toEqual([
      "order-1",
      "group-order-1",
    ]);
  });

  it("returns every checkout group as one complete admin row source", async () => {
    const checkoutGroup = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "group-1",
          groupNumber: "GRP-1",
          totalAmount: 130,
          createdAt: new Date("2026-07-29T08:00:00.000Z"),
          buyer: { displayName: "Buyer" },
        },
      ]),
    };
    const order = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
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
        where: { OR: [{ checkoutGroupId: { in: ["group-1"] } }] },
      }),
    );
  });

  it("includes an accepted-offer order without a checkout group", async () => {
    const createdAt = new Date("2026-08-05T08:00:00.000Z");
    const checkoutGroup = createDelegate();
    const looseOrder = {
      id: "offer-order-1",
      orderNumber: "ORD-OFFER-1",
      checkoutGroupId: null,
      packageId: null,
      buyerId: "buyer-1",
      sellerId: "seller-1",
      productId: "product-1",
      totalAmount: 120,
      subtotal: 100,
      commissionAmount: 10,
      shippingAddress: {},
      checkoutGroup: null,
      package: null,
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
      product: { id: "product-1", title: "Offer product", images: [] },
      shipment: null,
      refundRequests: [],
      createdAt,
    };
    const order = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: looseOrder.id,
            orderNumber: looseOrder.orderNumber,
            totalAmount: looseOrder.totalAmount,
            createdAt,
            buyer: { displayName: "Buyer" },
          },
        ])
        .mockResolvedValueOnce([looseOrder]),
    };
    const service = new AdminOrderService(
      { checkoutGroup, order } as any,
      {} as any,
      undefined as any,
    );

    const result = await service.getOrders({ page: 1, limit: 20 });

    expect(result.data).toEqual([
      expect.objectContaining({
        id: "offer-order-1",
        checkoutGroupId: null,
        groupNumber: null,
        groupItemCount: 1,
      }),
    ]);
    expect(order.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: { in: ["offer-order-1"] }, checkoutGroupId: null }],
        },
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
    // İade geçmişi artık RefundRequest bazlı (grup modelinde Payment 'refunded'
    // olmadığından eski Payment-bazlı liste grup iadelerini göremiyordu).
    const refundRequest = createDelegate();
    const service = new AdminPaymentService(
      { refundRequest } as any,
      {} as any,
      {} as any,
    );

    await service.getRefundHistory({ sortBy: "amount", sortOrder: "asc" });

    expect(refundRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { amount: "asc" },
        skip: 0,
        take: 20,
      }),
    );
  });
});
