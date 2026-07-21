import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Prisma, PrismaClient } from "@prisma/client";

import { AdminListQueryDto } from "./admin-list-query.dto";
import { paginate } from "./paginate";
import { paginateComputedRows } from "./paginate-computed";
import { resolveOrderBy } from "./resolve-order-by";
import { buildSearchWhere } from "./search-where";
import { AdminShipmentQueryDto } from "../../modules/admin/dto/operations-query.dto";
import { AuditLogQueryDto } from "../../modules/admin/dto/admin-query.dto";
import { AdminCollectionQueryDto } from "../../modules/admin/dto/collection-admin.dto";
import { DiscountQueryDto } from "../../modules/discount/dto/discount-query.dto";

// Keeps the shared delegate contract checked against the generated Prisma API.
function _paginateProducts(prisma: PrismaClient) {
  return paginate(
    prisma.product,
    { where: { status: "active" }, select: { id: true } },
    { page: 1, limit: 20 },
  );
}

type _Assert<T extends true> = T;
type _Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? true
    : false;
type _SelectedProduct = Awaited<
  ReturnType<typeof _paginateProducts>
>["data"][number];
type _SelectionIsPreserved = _Assert<_Equal<_SelectedProduct, { id: string }>>;

describe("admin list primitives", () => {
  describe("AdminListQueryDto", () => {
    it("provides pagination defaults and converts query string values", async () => {
      const query = plainToInstance(AdminListQueryDto, {
        page: "2",
        limit: "40",
      });

      await expect(validate(query)).resolves.toHaveLength(0);
      expect(query).toMatchObject({ page: 2, limit: 40 });
      expect(new AdminListQueryDto()).toMatchObject({ page: 1, limit: 20 });
    });

    it("rejects a limit above the maximum", async () => {
      const query = plainToInstance(AdminListQueryDto, { limit: "251" });

      const errors = await validate(query);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: "limit",
            constraints: expect.any(Object),
          }),
        ]),
      );
    });

    it("accepts the 250-row option for shipment lists", async () => {
      const query = plainToInstance(AdminShipmentQueryDto, { limit: "250" });

      await expect(validate(query)).resolves.toHaveLength(0);
      expect(query.limit).toBe(250);
    });

    it.each([AuditLogQueryDto, AdminCollectionQueryDto, DiscountQueryDto])(
      "accepts page-size 250 and sortType through %p",
      async (Dto) => {
        const query = plainToInstance(Dto, {
          limit: "250",
          sortBy: "createdAt",
          sortOrder: "asc",
          sortType: "date",
        });

        await expect(validate(query)).resolves.toHaveLength(0);
        expect(query).toMatchObject({
          limit: 250,
          sortBy: "createdAt",
          sortOrder: "asc",
          sortType: "date",
        });
      },
    );
  });

  describe("resolveOrderBy", () => {
    const defaultSort: Prisma.ProductOrderByWithRelationInput = {
      createdAt: "desc",
    };

    it("applies sorting for a scalar field discovered from Prisma DMMF", () => {
      expect(
        resolveOrderBy(
          "Product",
          { sortBy: "price", sortOrder: "asc" },
          { defaultSort },
        ),
      ).toEqual({
        price: "asc",
      });
    });

    it("applies a mapped relation or computed sort", () => {
      expect(
        resolveOrderBy(
          "Product",
          { sortBy: "categoryName", sortOrder: "asc" },
          {
            defaultSort,
            sortMap: {
              categoryName: (direction) => ({ category: { name: direction } }),
            },
          },
        ),
      ).toEqual({ category: { name: "asc" } });
    });

    it("allows a sort map to override a scalar field", () => {
      expect(
        resolveOrderBy<Prisma.UserOrderByWithRelationInput>(
          "User",
          { sortBy: "lastLoginAt", sortOrder: "asc" },
          {
            defaultSort: { createdAt: "desc" },
            sortMap: {
              lastLoginAt: (direction) => ({
                lastLoginAt: { sort: direction, nulls: "last" },
              }),
            },
          },
        ),
      ).toEqual({ lastLoginAt: { sort: "asc", nulls: "last" } });
    });

    it("resolves a dotted relation path via the DMMF", () => {
      expect(
        resolveOrderBy(
          "Product",
          { sortBy: "seller.displayName", sortOrder: "asc" },
          { defaultSort },
        ),
      ).toEqual({ seller: { displayName: "asc" } });
    });

    it("resolves a multi-level relation path", () => {
      expect(
        resolveOrderBy<Prisma.RefundRequestOrderByWithRelationInput>(
          "RefundRequest",
          { sortBy: "order.buyer.displayName", sortOrder: "desc" },
          { defaultSort: { createdAt: "desc" } },
        ),
      ).toEqual({ order: { buyer: { displayName: "desc" } } });
    });

    it("resolves a `<relation>Count` aggregate to an orderBy _count", () => {
      expect(
        resolveOrderBy<Prisma.UserOrderByWithRelationInput>(
          "User",
          { sortBy: "productsCount", sortOrder: "desc" },
          { defaultSort: { createdAt: "desc" } },
        ),
      ).toEqual({ products: { _count: "desc" } });
    });

    it("refuses to traverse a to-many relation for a nested scalar", () => {
      const fallback: Prisma.UserOrderByWithRelationInput = {
        createdAt: "desc",
      };
      // `products` is a to-many relation → cannot orderBy a nested scalar through it.
      expect(
        resolveOrderBy<Prisma.UserOrderByWithRelationInput>(
          "User",
          { sortBy: "products.title", sortOrder: "asc" },
          { defaultSort: fallback },
        ),
      ).toBe(fallback);
    });

    it("puts nulls last for an optional number/date scalar via sortType", () => {
      expect(
        resolveOrderBy(
          "Product",
          { sortBy: "salePrice", sortOrder: "asc", sortType: "number" },
          { defaultSort },
        ),
      ).toEqual({ salePrice: { sort: "asc", nulls: "last" } });
    });

    it("does not add null ordering to a required scalar", () => {
      expect(
        resolveOrderBy(
          "Product",
          { sortBy: "createdAt", sortOrder: "asc", sortType: "date" },
          { defaultSort },
        ),
      ).toEqual({ createdAt: "asc" });
    });

    it("keeps a plain scalar sort when sortType is text or absent", () => {
      expect(
        resolveOrderBy(
          "Product",
          { sortBy: "title", sortOrder: "asc", sortType: "text" },
          { defaultSort },
        ),
      ).toEqual({ title: "asc" });
    });

    it("uses the default for an unknown sort key without throwing", () => {
      expect(
        resolveOrderBy(
          "Product",
          { sortBy: "craetedAt", sortOrder: "asc" },
          { defaultSort },
        ),
      ).toBe(defaultSort);
    });
  });

  describe("buildSearchWhere", () => {
    it("builds a case-insensitive contains OR across scalar + relation paths", () => {
      expect(
        buildSearchWhere("ali", ["orderNumber", "seller.displayName"]),
      ).toEqual({
        OR: [
          { orderNumber: { contains: "ali", mode: "insensitive" } },
          { seller: { displayName: { contains: "ali", mode: "insensitive" } } },
        ],
      });
    });

    it("nests multi-level relation paths", () => {
      expect(buildSearchWhere("x", ["order.buyer.displayName"])).toEqual({
        OR: [
          {
            order: {
              buyer: { displayName: { contains: "x", mode: "insensitive" } },
            },
          },
        ],
      });
    });

    it("returns undefined for a blank term or no fields", () => {
      expect(buildSearchWhere("   ", ["name"])).toBeUndefined();
      expect(buildSearchWhere("ali", [])).toBeUndefined();
    });
  });

  describe("paginate", () => {
    it("counts, fetches the requested page, and caps the limit", async () => {
      const delegate = {
        count: jest.fn(async () => 505),
        findMany: jest.fn(async () => [{ id: "product-1" }]),
      };
      const options = {
        where: { status: "ACTIVE" },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      };

      // Over the 250 cap → clamped to 250.
      const result = await paginate(delegate, options, { page: 2, limit: 500 });

      expect(delegate.count).toHaveBeenCalledWith({ where: options.where });
      expect(delegate.findMany).toHaveBeenCalledWith({
        ...options,
        skip: 250,
        take: 250,
      });
      expect(result).toEqual({
        data: [{ id: "product-1" }],
        meta: { total: 505, page: 2, limit: 250, totalPages: 3 },
      });
    });
  });

  describe("paginateComputedRows", () => {
    it("sorts computed values before applying the standard page contract", () => {
      const result = paginateComputedRows(
        [
          { id: "empty", value: null },
          { id: "high", value: 500 },
          { id: "low", value: 200 },
        ],
        (row) => row.value,
        { page: 1, limit: 2, sortOrder: "asc", sortType: "number" },
      );

      expect(result).toEqual({
        data: [
          { id: "low", value: 200 },
          { id: "high", value: 500 },
        ],
        meta: { total: 3, page: 1, limit: 2, totalPages: 2 },
      });
    });
  });
});
