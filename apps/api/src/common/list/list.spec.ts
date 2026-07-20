import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Prisma, PrismaClient } from "@prisma/client";

import { AdminListQueryDto } from "./admin-list-query.dto";
import { paginate } from "./paginate";
import { resolveOrderBy } from "./resolve-order-by";

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
      const query = plainToInstance(AdminListQueryDto, { limit: "101" });

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

  describe("paginate", () => {
    it("counts, fetches the requested page, and caps the limit", async () => {
      const delegate = {
        count: jest.fn(async () => 205),
        findMany: jest.fn(async () => [{ id: "product-1" }]),
      };
      const options = {
        where: { status: "ACTIVE" },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      };

      const result = await paginate(delegate, options, { page: 2, limit: 250 });

      expect(delegate.count).toHaveBeenCalledWith({ where: options.where });
      expect(delegate.findMany).toHaveBeenCalledWith({
        ...options,
        skip: 100,
        take: 100,
      });
      expect(result).toEqual({
        data: [{ id: "product-1" }],
        meta: { total: 205, page: 2, limit: 100, totalPages: 3 },
      });
    });
  });
});
