/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminAnalyticsOrderService } from "../analytics/admin-analytics-order.service";

describe("AdminAnalyticsOrderService checkout group detail", () => {
  it("returns all group identifiers and carrier tracking references", async () => {
    const representative = {
      id: "order-1",
      orderNumber: "ORD-1",
      checkoutGroupId: "group-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      productId: "product-1",
      quantity: 1,
      unitPrice: 100,
      totalAmount: 130,
      subtotal: 100,
      shippingCost: 20,
      commissionAmount: 10,
      buyerFeeAmount: 10,
      sellerFeeAmount: 10,
      buyer: {
        id: "buyer-1",
        displayName: "Buyer",
        email: "buyer@example.com",
      },
      seller: {
        id: "seller-1",
        displayName: "Seller",
        email: "seller@example.com",
        sellerType: "individual",
      },
      product: {
        id: "product-1",
        title: "Product 1",
        price: 100,
        images: [],
        category: null,
      },
      offer: null,
      payment: null,
      checkoutGroup: {
        groupNumber: "GRP-1",
        payment: null,
      },
      shipment: {
        id: "shipment-1",
        provider: "surat",
        status: "shipped",
        trackingNumber: "INTERNAL-1",
        providerTrackingId: "SURAT-1",
        events: [],
      },
      shippingAddress: {},
      status: "shipped",
      createdAt: new Date("2026-07-29T08:00:00.000Z"),
    };
    const groupOrders = [
      {
        ...representative,
        packageId: "package-1",
        package: { id: "package-1", shippingCost: 20 },
        seller: {
          id: "seller-1",
          displayName: "Seller",
          sellerType: "individual",
        },
        product: {
          id: "product-1",
          title: "Product 1",
          images: [],
        },
        shipment: {
          id: "shipment-1",
          provider: "surat",
          status: "shipped",
          trackingNumber: "INTERNAL-1",
          providerTrackingId: "SURAT-1",
        },
      },
      {
        ...representative,
        id: "order-2",
        orderNumber: "ORD-2",
        sellerId: "seller-2",
        productId: "product-2",
        packageId: "package-2",
        package: { id: "package-2", shippingCost: 20 },
        seller: {
          id: "seller-2",
          displayName: "Seller 2",
          sellerType: "corporate",
        },
        product: {
          id: "product-2",
          title: "Product 2",
          images: [],
        },
        shipment: {
          id: "shipment-2",
          provider: "surat",
          status: "preparing",
          trackingNumber: "INTERNAL-2",
          providerTrackingId: "SURAT-2",
        },
      },
    ];
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(representative),
        findMany: jest.fn().mockResolvedValue(groupOrders),
      },
    };
    const service = new AdminAnalyticsOrderService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      { resolveProductImageUrl: (value: string | null) => value } as any,
    );

    const result = await service.getOrderById("order-1");

    expect(result.group).toEqual(
      expect.objectContaining({
        id: "group-1",
        groupNumber: "GRP-1",
        itemCount: 2,
        packageCount: 2,
      }),
    );
    expect(result.group?.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageId: "package-1",
          seller: expect.objectContaining({ id: "seller-1" }),
          shipment: {
            id: "shipment-1",
            provider: "surat",
            trackingNumber: "INTERNAL-1",
            providerTrackingId: "SURAT-1",
            status: "shipped",
          },
          items: [
            expect.objectContaining({
              orderId: "order-1",
              orderNumber: "ORD-1",
              productId: "product-1",
            }),
          ],
        }),
        expect.objectContaining({
          packageId: "package-2",
          seller: expect.objectContaining({ id: "seller-2" }),
          shipment: expect.objectContaining({
            id: "shipment-2",
            providerTrackingId: "SURAT-2",
          }),
          items: [
            expect.objectContaining({
              orderId: "order-2",
              productId: "product-2",
            }),
          ],
        }),
      ]),
    );
  });
});
