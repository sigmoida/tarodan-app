/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminCollectionService } from "./admin-collection.service";

describe("AdminCollectionService list sorting", () => {
  it("uses SQL sorting for search columns unsupported by Elasticsearch", async () => {
    const collection = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      collection,
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: "collection-1" }]),
    };
    const searchService = {
      isAvailable: jest.fn().mockReturnValue(true),
      searchCollections: jest.fn(),
    };
    const service = new AdminCollectionService(
      prisma as any,
      searchService as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.getCollections({
      search: "ali",
      sortBy: "user.displayName",
      sortOrder: "asc",
    });

    expect(searchService.searchCollections).not.toHaveBeenCalled();
    expect(collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["collection-1"] } },
        orderBy: { user: { displayName: "asc" } },
      }),
    );
  });
});
