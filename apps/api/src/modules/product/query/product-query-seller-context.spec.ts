import { ProductKind, ProductStatus } from "@prisma/client";
import { ProductQueryService } from "./product-query.service";

describe("ProductQueryService.findSellerProducts", () => {
  it("returns listing data without order or trade context", async () => {
    const products = [
      {
        id: "sold-product",
        status: ProductStatus.sold,
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
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
        .mockImplementation(async (rows: typeof products) => rows),
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

    expect(result.data).toEqual(products);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: ProductKind.listing }),
        include: expect.not.objectContaining({
          orders: expect.anything(),
          tradeItemsOffered: expect.anything(),
        }),
      }),
    );
  });
});
