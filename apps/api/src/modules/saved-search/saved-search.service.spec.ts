import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  canonicalizeSavedSearchQuery,
  type SavedSearchQuery,
} from "@tarodan/types";
import { SavedSearchService } from "./saved-search.service";
import { savedSearchQueryHash } from "./helpers/saved-search-hash";
import type { CreateSavedSearchDto } from "./dto";

/**
 * Saved searches (critical path 13: the tier limit). Pins the order of the
 * refusals (empty 400, duplicate 409, limit 403), the stored canonical form,
 * the default name and ownership. The real-database races (parallel saves at
 * limit - 1, the P2002 path, the deletion cascade) are in
 * test/e2e/saved-searches.e2e-spec.ts.
 */
describe("SavedSearchService", () => {
  const CREATED_AT = new Date("2026-10-21T10:00:00.000Z");
  const CATEGORY = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";

  const makeService = (
    opts: { count?: number; limit?: number; duplicate?: boolean } = {},
  ) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ deleted_at: null }]),
      savedSearch: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.duplicate ? { id: "existing" } : null),
        count: jest.fn().mockResolvedValue(opts.count ?? 0),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: "ss-1",
            name: data.name,
            query: data.query,
            labels: data.labels,
            createdAt: CREATED_AT,
          }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
      savedSearch: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const membership = {
      getSavedSearchLimit: jest.fn().mockResolvedValue(opts.limit ?? 5),
    };
    const service = new SavedSearchService(
      prisma as never,
      membership as never,
    );
    return { service, prisma, tx, membership };
  };

  const dto = (
    over: Partial<CreateSavedSearchDto> = {},
  ): CreateSavedSearchDto =>
    ({
      query: { search: "ferrari", tradeOnly: true },
      ...over,
    }) as CreateSavedSearchDto;

  const responseOf = (error: unknown) =>
    (error as ForbiddenException).getResponse() as Record<string, unknown>;

  describe("create: the tier limit", () => {
    it("saves the fifth search of a free member (4 of 5 used)", async () => {
      const { service, tx } = makeService({ count: 4, limit: 5 });

      await expect(service.create("u1", dto())).resolves.toMatchObject({
        id: "ss-1",
      });
      expect(tx.savedSearch.create).toHaveBeenCalledTimes(1);
    });

    it("refuses the sixth with 403 SAVED_SEARCH_LIMIT and the limit", async () => {
      const { service, tx } = makeService({ count: 5, limit: 5 });

      const error = await service.create("u1", dto()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(responseOf(error)).toMatchObject({
        i18nKey: "server.savedSearch.limitReached",
        i18nParams: { limit: 5 },
        errorCode: "SAVED_SEARCH_LIMIT",
        limit: 5,
      });
      expect(tx.savedSearch.create).not.toHaveBeenCalled();
    });

    it.each([
      ["basic", 10],
      ["premium", 20],
      ["business", 50],
    ])("enforces the %s limit of %i", async (_tier, limit) => {
      const below = makeService({ count: limit - 1, limit });
      await expect(below.service.create("u1", dto())).resolves.toBeDefined();

      const at = makeService({ count: limit, limit });
      await expect(at.service.create("u1", dto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("after a downgrade below the count, refuses new saves", async () => {
      const { service } = makeService({ count: 18, limit: 5 });

      await expect(service.create("u1", dto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("a tier limit of 0 allows no saves", async () => {
      const { service } = makeService({ count: 0, limit: 0 });

      await expect(service.create("u1", dto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("counts and inserts under the user row lock, the lock first", async () => {
      const { service, tx, membership, prisma } = makeService({ count: 1 });

      await service.create("u1", dto());

      const sql = (tx.$queryRaw.mock.calls[0][0] as string[])
        .join("?")
        .replace(/\s+/g, " ");
      expect(sql).toContain("FROM users WHERE id = ? FOR NO KEY UPDATE");
      // The caller's own row: a lock on any other row serialises nothing.
      expect(tx.$queryRaw.mock.calls[0][1]).toBe("u1");
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      // The transaction's first statement: before the duplicate lookup, the
      // count and the insert (so no other row lock can come before it).
      const lockAt = tx.$queryRaw.mock.invocationCallOrder[0];
      for (const step of [
        tx.savedSearch.findUnique,
        tx.savedSearch.count,
        tx.savedSearch.create,
      ]) {
        expect(lockAt).toBeLessThan(step.mock.invocationCallOrder[0]);
      }
      expect(tx.savedSearch.count).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      // Count and insert on the transaction client, never on the pool.
      expect(prisma.savedSearch.count).not.toHaveBeenCalled();
      // The limit is read before the transaction, outside the lock.
      expect(
        membership.getSavedSearchLimit.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
    });

    it("refuses a deleted account found under the lock", async () => {
      const { service, tx } = makeService();
      tx.$queryRaw.mockResolvedValue([{ deleted_at: new Date() }]);

      await expect(service.create("u1", dto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(tx.savedSearch.create).not.toHaveBeenCalled();
    });
  });

  describe("create: duplicates", () => {
    it("answers 409 SAVED_SEARCH_DUPLICATE for the same canonical query", async () => {
      const { service, tx } = makeService({ duplicate: true });

      const error = await service.create("u1", dto()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(responseOf(error)).toMatchObject({
        i18nKey: "server.savedSearch.alreadySaved",
        errorCode: "SAVED_SEARCH_DUPLICATE",
      });
      expect(tx.savedSearch.create).not.toHaveBeenCalled();
    });

    it("looks the duplicate up by the canonical hash, whatever the input order", async () => {
      const { service, tx } = makeService();

      await service.create(
        "u1",
        dto({
          query: {
            tradeOnly: true,
            color: "red,black",
            search: "ferrari ",
          } as CreateSavedSearchDto["query"],
        }),
      );

      const expected = savedSearchQueryHash(
        canonicalizeSavedSearchQuery({
          search: "ferrari",
          color: "black,red",
          tradeOnly: true,
        }),
      );
      expect(tx.savedSearch.findUnique).toHaveBeenCalledWith({
        where: { userId_queryHash: { userId: "u1", queryHash: expected } },
        select: { id: true },
      });
    });

    it("reports a duplicate before the limit (a duplicate needs no slot)", async () => {
      const { service } = makeService({ duplicate: true, count: 5, limit: 5 });

      await expect(service.create("u1", dto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("maps a lost unique race (P2002) to the same 409", async () => {
      const { service, tx } = makeService();
      tx.savedSearch.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "5.22.0",
        }),
      );

      const error = await service.create("u1", dto()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(responseOf(error)).toMatchObject({
        errorCode: "SAVED_SEARCH_DUPLICATE",
      });
    });

    it("does not hide other database errors", async () => {
      const { service, tx } = makeService();
      const failure = new Error("connection lost");
      tx.savedSearch.create.mockRejectedValue(failure);

      await expect(service.create("u1", dto())).rejects.toBe(failure);
    });
  });

  describe("create: the stored form", () => {
    it.each([
      [{}],
      [{ sortBy: "price_asc" }],
      [{ page: 2, limit: 48, sellerId: CATEGORY }],
      [{ search: "   ", tradeOnly: false }],
    ])("refuses an empty search %j with 400 emptyQuery", async (query) => {
      const { service, membership } = makeService();

      const error = await service
        .create("u1", dto({ query: query as CreateSavedSearchDto["query"] }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(responseOf(error)).toMatchObject({
        i18nKey: "server.savedSearch.emptyQuery",
      });
      expect(membership.getSavedSearchLimit).not.toHaveBeenCalled();
    });

    it("stores the canonical query without unknown keys, with its hash", async () => {
      const { service, tx } = makeService();

      await service.create(
        "u1",
        dto({
          query: {
            search: " porsche ",
            page: 3,
            status: "sold",
            sortBy: "price_desc",
          } as unknown as CreateSavedSearchDto["query"],
        }),
      );

      const data = tx.savedSearch.create.mock.calls[0][0].data as {
        userId: string;
        query: SavedSearchQuery;
        queryHash: string;
      };
      expect(data.query).toEqual({ search: "porsche", sortBy: "price_desc" });
      expect(Object.keys(data.query)).toEqual(["search", "sortBy"]);
      expect(data.queryHash).toBe(savedSearchQueryHash(data.query));
      expect(data.userId).toBe("u1");
    });

    it("keeps only labels of keys in the query", async () => {
      const { service, tx } = makeService();

      await service.create(
        "u1",
        dto({
          query: { categoryId: CATEGORY } as CreateSavedSearchDto["query"],
          labels: { categoryId: "Diecast", brandId: "Ferrari" },
        }),
      );

      expect(tx.savedSearch.create.mock.calls[0][0].data.labels).toEqual({
        categoryId: "Diecast",
      });
    });

    it("stores the user's name", async () => {
      const { service, tx } = makeService();

      await service.create("u1", dto({ name: "My F40 hunt" }));

      expect(tx.savedSearch.create.mock.calls[0][0].data.name).toBe(
        "My F40 hunt",
      );
    });

    it("derives the default name when none is given", async () => {
      const { service, tx } = makeService();

      await service.create(
        "u1",
        dto({
          query: {
            search: "f40",
            categoryId: CATEGORY,
          } as CreateSavedSearchDto["query"],
          labels: { categoryId: "Diecast" },
        }),
      );

      expect(tx.savedSearch.create.mock.calls[0][0].data.name).toBe(
        "f40 · Diecast",
      );
    });

    it("stores null when no name can be derived", async () => {
      const { service, tx } = makeService();

      await service.create(
        "u1",
        dto({
          name: "",
          query: { tradeOnly: true } as CreateSavedSearchDto["query"],
        }),
      );

      expect(tx.savedSearch.create.mock.calls[0][0].data.name).toBeNull();
    });

    it("answers the contract shape with an ISO date", async () => {
      const { service } = makeService();

      await expect(service.create("u1", dto())).resolves.toEqual({
        id: "ss-1",
        name: "ferrari",
        query: { search: "ferrari", tradeOnly: true },
        labels: {},
        createdAt: "2026-10-21T10:00:00.000Z",
      });
    });
  });

  describe("list", () => {
    it("returns only the caller's searches, newest first, paginated", async () => {
      const { service, prisma } = makeService();
      prisma.savedSearch.count.mockResolvedValue(1);
      prisma.savedSearch.findMany.mockResolvedValue([
        {
          id: "ss-1",
          name: null,
          query: { search: "x", page: 2 },
          labels: { search: "Text label", categoryId: "Not in query" },
          createdAt: CREATED_AT,
        },
      ]);

      const result = await service.list("u1", { page: 1, limit: 100 });

      expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: 0,
          take: 100,
        }),
      );
      expect(prisma.savedSearch.count).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      expect(result).toEqual({
        data: [
          {
            id: "ss-1",
            name: null,
            // Re-canonicalised on read: a stray key never reaches clients.
            query: { search: "x" },
            labels: { search: "Text label" },
            createdAt: "2026-10-21T10:00:00.000Z",
          },
        ],
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
      });
    });
  });

  describe("remove", () => {
    it("deletes by id and owner in one statement", async () => {
      const { service, prisma } = makeService();

      await service.remove("u1", "ss-1");

      expect(prisma.savedSearch.deleteMany).toHaveBeenCalledWith({
        where: { id: "ss-1", userId: "u1" },
      });
    });

    it("answers 404 for a missing id or another user's id", async () => {
      const { service, prisma } = makeService();
      prisma.savedSearch.deleteMany.mockResolvedValue({ count: 0 });

      const error = await service
        .remove("u1", "someone-elses")
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(responseOf(error)).toMatchObject({
        i18nKey: "server.savedSearch.notFound",
      });
    });
  });
});
