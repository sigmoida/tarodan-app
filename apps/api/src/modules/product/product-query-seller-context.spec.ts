import {
  OrderStatus,
  ProductKind,
  ProductStatus,
  TradeStatus,
} from "@prisma/client";
import { ProductQueryService } from "./product-query.service";

describe("ProductQueryService.findSellerProducts lifecycle context", () => {
  it("returns the seller-only order and trade context used by listing actions", async () => {
    const products = [
      {
        id: "sold-product",
        status: ProductStatus.sold,
        _count: { offers: 0 },
        orders: [
          {
            id: "order-1",
            orderNumber: "ORD-1",
            status: OrderStatus.completed,
            quantity: 1,
            unitPrice: 250,
            subtotal: 250,
            createdAt: new Date("2026-08-01T10:00:00.000Z"),
            deliveredAt: new Date("2026-08-03T10:00:00.000Z"),
            completedAt: new Date("2026-08-04T10:00:00.000Z"),
            buyer: { id: "buyer-1", displayName: "Test Buyer" },
          },
        ],
        tradeItemsOffered: [],
      },
      {
        id: "reserved-product",
        status: ProductStatus.reserved,
        _count: { offers: 1 },
        orders: [],
        tradeItemsOffered: [
          {
            trade: {
              id: "trade-1",
              tradeNumber: "TRD-1",
              status: TradeStatus.awaiting_payment,
              createdAt: new Date("2026-08-04T10:00:00.000Z"),
            },
          },
        ],
      },
    ];
    const prisma = {
      product: {
        count: jest.fn().mockResolvedValue(products.length),
        findMany: jest.fn().mockResolvedValue(products),
      },
    };
    const common = {
      formatProductResponseMany: jest
        .fn()
        .mockImplementation(async (rows: typeof products) =>
          rows.map((row) => ({ id: row.id, status: row.status })),
        ),
    };
    const service = new ProductQueryService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      common as any,
    );

    const result = await service.findSellerProducts("seller-1", {
      page: 1,
      limit: 20,
    } as any);

    const sold = result.data.find((product) => product.id === "sold-product");
    const reserved = result.data.find(
      (product) => product.id === "reserved-product",
    );

    expect(sold).toMatchObject({
      id: "sold-product",
      relatedOrder: {
        id: "order-1",
        subtotal: 250,
        buyer: { id: "buyer-1", displayName: "Test Buyer" },
      },
      relatedTrade: null,
    });
    expect(reserved).toMatchObject({
      id: "reserved-product",
      pendingOffersCount: 1,
      relatedOrder: null,
      relatedTrade: { id: "trade-1", status: TradeStatus.awaiting_payment },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: ProductKind.listing }),
        include: expect.objectContaining({
          orders: expect.any(Object),
          tradeItemsOffered: expect.any(Object),
        }),
      }),
    );
  });
});
