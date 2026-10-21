import { accountLaneServiceStub } from "../../account-lane/account-lane.testing";
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
      {
        isBlockedEither: async () => false,
        getHiddenUserIds: async () => [],
      } as any,
      accountLaneServiceStub() as any,
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

  describe("tradeOnly", () => {
    const build = () => {
      const prisma = {
        product: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
          fields: { reservedQuantity: "reservedQuantity" },
        },
      };
      const common = {
        formatProductResponseMany: jest.fn().mockResolvedValue([]),
      };
      const service = new ProductQueryService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        common as any,
        {
          isBlockedEither: async () => false,
          getHiddenUserIds: async () => [],
        } as any,
        accountLaneServiceStub() as any,
      );
      return { prisma, service };
    };

    it("adds isTradeEnabled when tradeOnly is set", async () => {
      const { prisma, service } = build();
      await service.findSellerProducts("seller-1", {
        tradeOnly: true,
        status: "active",
      } as any);
      const arg = prisma.product.findMany.mock.calls[0][0];
      expect(arg.where).toEqual(
        expect.objectContaining({
          sellerId: "seller-1",
          status: "active",
          isTradeEnabled: true,
        }),
      );
      expect(prisma.product.count).toHaveBeenCalledWith({ where: arg.where });
    });

    it("leaves the where untouched without tradeOnly", async () => {
      const { prisma, service } = build();
      await service.findSellerProducts("seller-1", {} as any);
      expect(prisma.product.findMany.mock.calls[0][0].where).not.toHaveProperty(
        "isTradeEnabled",
      );
    });

    it("combines tradeOnly with tradeEligible and pages the filtered set", async () => {
      const { prisma, service } = build();
      prisma.product.count.mockResolvedValue(45);
      const result = await service.findSellerProducts("seller-1", {
        tradeEligible: true,
        tradeOnly: true,
        page: 2,
        limit: 20,
      } as any);
      const arg = prisma.product.findMany.mock.calls[0][0];
      expect(arg.where).toEqual(
        expect.objectContaining({
          status: "active",
          isTradeEnabled: true,
          NOT: expect.anything(),
          OR: expect.any(Array),
        }),
      );
      expect(arg.skip).toBe(20);
      expect(arg.take).toBe(20);
      expect(result.meta).toEqual(
        expect.objectContaining({
          total: 45,
          page: 2,
          limit: 20,
          totalPages: 3,
        }),
      );
    });
  });
});
