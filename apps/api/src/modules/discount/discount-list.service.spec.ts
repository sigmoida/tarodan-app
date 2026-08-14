/* eslint-disable @typescript-eslint/no-explicit-any */

import { DiscountService } from "./discount.service";
import { DiscountUsageService } from "./discount-usage.service";

describe("DiscountService admin list contract", () => {
  it("composes full-content search with the selected column sort", async () => {
    const discount = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      discount,
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const service = new DiscountService(
      prisma as any,
      {} as any, // cache
      { syncProduct: jest.fn() } as any, // searchService
      new DiscountUsageService(prisma as any),
    );

    await service.findAll(
      {
        search: "category",
        sortBy: "value",
        sortOrder: "desc",
        sortType: "number",
      },
      "admin-1",
      true,
    );

    expect(discount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              category: {
                name: { contains: "category", mode: "insensitive" },
              },
            },
            {
              description: {
                contains: "category",
                mode: "insensitive",
              },
            },
          ]),
        }),
        orderBy: { value: "desc" },
        skip: 0,
        take: 20,
      }),
    );
  });
});
