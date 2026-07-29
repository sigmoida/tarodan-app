/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminCollectionService } from "./admin-collection.service";

describe("AdminCollectionService list sorting", () => {
  it("uses SQL sorting for search columns unsupported by Elasticsearch", async () => {
    const collection = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const prisma = { collection };
    const service = new AdminCollectionService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.getCollections({
      search: "ali",
      sortBy: "owner.displayName",
      sortOrder: "asc",
    });

    expect(collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              user: {
                displayName: { contains: "ali", mode: "insensitive" },
              },
            },
          ]),
        }),
        orderBy: { user: { displayName: "asc" } },
      }),
    );
  });

  it("maps the displayed item count accessor to the relation count", async () => {
    const collection = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const service = new AdminCollectionService(
      { collection } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.getCollections({
      sortBy: "itemCount",
      sortOrder: "desc",
    });

    expect(collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { items: { _count: "desc" } },
      }),
    );
  });
});
