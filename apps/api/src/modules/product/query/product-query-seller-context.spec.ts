import { accountLaneServiceStub } from "../../account-lane/account-lane.testing";
import { ProductKind, ProductStatus } from "@prisma/client";
import { ACTIVE_TRADE_STATUSES } from "../../trade/helpers/trade.constants";
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

    const findManyArgs = (prisma: ReturnType<typeof build>["prisma"]) =>
      prisma.product.findMany.mock.calls[0][0];

    // The where GET /products/my built before tradeOnly existed ("All" tab).
    const defaultWhere = {
      kind: ProductKind.listing,
      sellerId: "seller-1",
      status: { notIn: [ProductStatus.deleted] },
    };

    // tradeEligible: active, not offered in an active trade, stock available.
    const tradeEligibleWhere = {
      status: ProductStatus.active,
      NOT: {
        tradeItemsOffered: {
          some: {
            side: "initiator",
            trade: { status: { in: ACTIVE_TRADE_STATUSES } },
          },
        },
      },
      OR: [
        { quantity: null },
        { reservedQuantity: null, quantity: { gt: 0 } },
        { quantity: { gt: "reservedQuantity" } },
      ],
    };

    it("adds isTradeEnabled when tradeOnly is set", async () => {
      const { prisma, service } = build();
      await service.findSellerProducts("seller-1", {
        tradeOnly: true,
        status: ProductStatus.active,
      });
      const arg = findManyArgs(prisma);
      expect(arg.where).toEqual({
        kind: ProductKind.listing,
        sellerId: "seller-1",
        status: ProductStatus.active,
        isTradeEnabled: true,
      });
      expect(prisma.product.count).toHaveBeenCalledWith({ where: arg.where });
    });

    it("leaves the query exactly as before without tradeOnly", async () => {
      const { prisma, service } = build();
      await service.findSellerProducts("seller-1", {});
      const arg = findManyArgs(prisma);
      expect(arg.where).toEqual(defaultWhere);
      expect(arg.skip).toBe(0);
      expect(arg.take).toBe(20);
      expect(prisma.product.count).toHaveBeenCalledWith({
        where: defaultWhere,
      });
    });

    it("treats tradeOnly=false exactly like an absent flag", async () => {
      const absent = build();
      await absent.service.findSellerProducts("seller-1", {
        status: ProductStatus.sold,
        page: 2,
        limit: 10,
      });
      const off = build();
      await off.service.findSellerProducts("seller-1", {
        status: ProductStatus.sold,
        page: 2,
        limit: 10,
        tradeOnly: false,
      });

      expect(findManyArgs(off.prisma)).toEqual(findManyArgs(absent.prisma));
      expect(off.prisma.product.count.mock.calls).toEqual(
        absent.prisma.product.count.mock.calls,
      );
      expect(findManyArgs(off.prisma).where).not.toHaveProperty(
        "isTradeEnabled",
      );
    });

    it("keeps an explicit status and ANDs isTradeEnabled with it", async () => {
      const { prisma, service } = build();
      await service.findSellerProducts("seller-1", {
        tradeOnly: true,
        status: ProductStatus.sold,
      });
      expect(findManyArgs(prisma).where).toEqual({
        kind: ProductKind.listing,
        sellerId: "seller-1",
        status: ProductStatus.sold,
        isTradeEnabled: true,
      });
    });

    it("does not change the tradeEligible query without tradeOnly", async () => {
      const { prisma, service } = build();
      await service.findSellerProducts("seller-1", {
        tradeEligible: true,
      });
      expect(findManyArgs(prisma).where).toEqual({
        kind: ProductKind.listing,
        sellerId: "seller-1",
        ...tradeEligibleWhere,
      });
    });

    it("combines tradeOnly with tradeEligible and pages the filtered set", async () => {
      const { prisma, service } = build();
      prisma.product.count.mockResolvedValue(45);
      const result = await service.findSellerProducts("seller-1", {
        tradeEligible: true,
        tradeOnly: true,
        // tradeEligible overrides any status the client sends.
        status: ProductStatus.sold,
        page: 2,
        limit: 20,
      });
      const arg = findManyArgs(prisma);
      const expectedWhere = {
        kind: ProductKind.listing,
        sellerId: "seller-1",
        isTradeEnabled: true,
        ...tradeEligibleWhere,
      };
      expect(arg.where).toEqual(expectedWhere);
      // meta.total comes from a count over the same filtered where.
      expect(prisma.product.count).toHaveBeenCalledTimes(1);
      expect(prisma.product.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(arg.skip).toBe(20);
      expect(arg.take).toBe(20);
      expect(result.meta).toEqual({
        total: 45,
        page: 2,
        limit: 20,
        totalPages: 3,
      });
    });
  });
});
