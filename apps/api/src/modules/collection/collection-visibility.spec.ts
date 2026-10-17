import { CollectionCrudService } from "./collection-crud.service";
import { collectionOwnerVisibleWhere } from "./collection-visibility";
import { userBlockServiceStub } from "../user-block/user-block.testing";
import { accountLaneServiceStub } from "../account-lane/account-lane.testing";
import type { AccountLane } from "../account-lane/account-lane";

/**
 * S13 — App Review 2.1: test şeridi hesabına `/collections/browse` canlı
 * koleksiyonları listeliyor, detayı 404 veriyordu. Kök neden: liste yalnız
 * engeli, detay engel + şerit farkını süzüyordu. Artık liste (ES + Postgres +
 * hidrasyon) ve detay (id + slug) TEK yüklemi kullanır.
 */
describe("collectionOwnerVisibleWhere", () => {
  it("gizli sahipleri ve başka şeritteki sahipleri dışarıda bırakır", () => {
    expect(
      collectionOwnerVisibleWhere({ hiddenUserIds: ["x"], lane: "test" }),
    ).toEqual({
      userId: { notIn: ["x"] },
      user: { isTestAccount: true },
    });
  });

  it("gizli kullanıcı yoksa sahip filtresi eklenmez; şerit her zaman uygulanır", () => {
    expect(
      collectionOwnerVisibleWhere({ hiddenUserIds: [], lane: "live" }),
    ).toEqual({ userId: undefined, user: { isTestAccount: false } });
  });
});

describe("CollectionCrudService — liste ve detay aynı kural", () => {
  const build = (lanes: Record<string, AccountLane> = {}) => {
    const searchService = {
      searchCollections: jest.fn().mockResolvedValue({ ids: ["c1"], total: 1 }),
    };
    const prisma = {
      collection: {
        findUnique: jest.fn().mockResolvedValue({ id: "c1", userId: "owner" }),
        findFirst: jest.fn().mockResolvedValue({
          id: "c1",
          userId: "owner",
          items: [],
          isPublic: true,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new CollectionCrudService(
      prisma as any,
      {} as any,
      searchService as any,
      {
        queueReindexAllCollections: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      userBlockServiceStub() as any,
      accountLaneServiceStub(lanes) as any,
    );
    return { service, searchService, prisma };
  };

  const browse = (service: CollectionCrudService, viewerId?: string) =>
    service.browsePublicCollections(
      1,
      20,
      "popular",
      undefined,
      undefined,
      undefined,
      viewerId,
    );

  it("test şeridi viewer'ı ES'e gitmez; Postgres yalnız test sahiplerini listeler", async () => {
    const { service, searchService, prisma } = build({ tester: "test" });

    await browse(service, "tester");

    expect(searchService.searchCollections).not.toHaveBeenCalled();
    expect(prisma.collection.findMany.mock.calls[0][0].where).toMatchObject({
      isPublic: true,
      user: { isTestAccount: true },
    });
  });

  it("canlı viewer ES'i kullanır; hidrasyon da şeridi uygular", async () => {
    const { service, searchService, prisma } = build();

    await browse(service, "viewer");

    expect(searchService.searchCollections).toHaveBeenCalled();
    expect(prisma.collection.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["c1"] },
      userId: undefined,
      user: { isTestAccount: false },
    });
  });

  it("test viewer'ı canlı koleksiyonun detayını görmez (404) — listede de görmez", async () => {
    const { service, prisma } = build({ tester: "test" });

    await expect(
      service.getCollectionById("c1", "tester"),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.collection.count).toHaveBeenCalledWith({
      where: {
        id: "c1",
        userId: undefined,
        user: { isTestAccount: true },
      },
    });
  });

  it("slug ile detay da aynı kapıdan geçer", async () => {
    const { service, prisma } = build({ tester: "test" });

    await expect(
      service.getCollectionBySlug("koleksiyon", "tester"),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.collection.count).toHaveBeenCalledWith({
      where: {
        id: "c1",
        userId: undefined,
        user: { isTestAccount: true },
      },
    });
  });

  it("anonim viewer canlı şerittir: test sahibinin koleksiyonu detayda da yok", async () => {
    const { service, prisma } = build();

    await expect(service.getCollectionById("c1")).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.collection.count.mock.calls[0][0].where.user).toEqual({
      isTestAccount: false,
    });
  });

  it("detay kapısı keşif listesiyle birebir aynı sahip yüklemini kullanır", async () => {
    const { service, prisma } = build({ tester: "test" });

    await browse(service, "tester");
    await service.getCollectionById("c1", "tester").catch(() => undefined);

    const listWhere = prisma.collection.findMany.mock.calls[0][0].where;
    const countCalls = prisma.collection.count.mock.calls;
    const detailWhere = countCalls[countCalls.length - 1][0].where;
    expect({ userId: detailWhere.userId, user: detailWhere.user }).toEqual({
      userId: listWhere.userId,
      user: listWhere.user,
    });
  });
});

describe("CollectionCrudService — browse sayfalama", () => {
  const build = (esResult: { ids: string[]; total: number }) => {
    const searchService = {
      searchCollections: jest.fn().mockResolvedValue(esResult),
    };
    const reindex = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      collection: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            (where.id?.in ?? []).map((id: string) => ({
              id,
              userId: "u",
              name: id,
              isPublic: true,
              user: { id: "u" },
              _count: { items: 0 },
            })),
          ),
        ),
        count: jest.fn().mockResolvedValue(21),
      },
    };
    const service = new CollectionCrudService(
      prisma as any,
      {} as any,
      searchService as any,
      { queueReindexAllCollections: reindex } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      userBlockServiceStub() as any,
      accountLaneServiceStub() as any,
    );
    return { service, prisma, reindex };
  };

  it("son kısmi sayfada (total=21, page=2, 1 id) Prisma'ya düşmez, reindex tetiklemez", async () => {
    const { service, prisma, reindex } = build({ ids: ["c21"], total: 21 });

    const res = await service.browsePublicCollections(2, 20, "popular");

    expect(res.collections.map((c) => c.id)).toEqual(["c21"]);
    expect(reindex).not.toHaveBeenCalled();
    expect(prisma.collection.count).not.toHaveBeenCalled();
  });

  it("Prisma yolu ES ile aynı sırayı kullanır: id tiebreaker, popular'da likeCount", async () => {
    const { service, prisma } = build({ ids: [], total: 0 });

    await service.browsePublicCollections(1, 20, "popular");
    await service.browsePublicCollections(1, 20, "recent");
    await service.browsePublicCollections(1, 20, "name");

    const orders = prisma.collection.findMany.mock.calls.map(
      ([a]) => a.orderBy,
    );
    expect(orders[0]).toEqual([
      { viewCount: "desc" },
      { likeCount: "desc" },
      { id: "asc" },
    ]);
    expect(orders[1]).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
    // name/items: bellekte sıralanır; sayfalama yok ama tiebreaker'lı sıra var.
    expect(orders[2]).toBeUndefined();
  });
});
