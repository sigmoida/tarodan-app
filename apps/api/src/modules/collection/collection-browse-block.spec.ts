import { CollectionCrudService } from "./collection-crud.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

describe("CollectionCrudService — user blocks", () => {
  const build = (hidden: string[], blockedEither = false) => {
    const searchService = {
      searchCollections: jest.fn().mockResolvedValue(null),
    };
    const userBlocks = userBlockServiceStub({ hidden, blockedEither });
    const prisma = {
      collection: {
        findUnique: jest.fn().mockResolvedValue({ id: "c1", userId: "owner" }),
      },
    };
    const service = new CollectionCrudService(
      prisma as any,
      {} as any,
      searchService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      userBlocks as any,
    );
    const pg = jest
      .spyOn(service as any, "browsePublicCollectionsPrisma")
      .mockResolvedValue({ data: [], total: 0 });
    return { service, searchService, userBlocks, pg, prisma };
  };

  it("browse excludes hidden owners in ES and in the Prisma fallback", async () => {
    const { service, searchService, pg } = build(["x"]);
    await service.browsePublicCollections(
      1,
      20,
      "popular",
      undefined,
      undefined,
      undefined,
      "viewer",
    );
    expect(
      searchService.searchCollections.mock.calls[0][0].excludeUserIds,
    ).toEqual(["x"]);
    expect(pg).toHaveBeenCalledWith(1, 20, "popular", undefined, undefined, [
      "x",
    ]);
  });

  it("getCollectionById → 404 when the owner is blocked either way", async () => {
    const { service, userBlocks } = build([], true);
    await expect(
      service.getCollectionById("c1", "viewer"),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(userBlocks.isBlockedEither).toHaveBeenCalledWith("viewer", "owner");
  });

  it("getUserCollections → 404 for a blocked owner, but never for the owner themselves", async () => {
    const { service, userBlocks } = build([], true);
    await expect(
      service.getUserCollections("owner", "viewer"),
    ).rejects.toMatchObject({
      status: 404,
    });
    userBlocks.isBlockedEither.mockClear();
    await expect(
      service.getUserCollections("owner", "owner").catch((e) => e),
    ).resolves.not.toMatchObject({ status: 404 });
    expect(userBlocks.isBlockedEither).not.toHaveBeenCalled();
  });
});
