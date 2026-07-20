/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminModerationService } from "./admin-moderation.service";

describe("AdminModerationService event list", () => {
  it("searches displayed text and user fields while preserving typed sorting", async () => {
    const moderationEvent = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const user = {
      findMany: jest.fn().mockResolvedValue([{ id: "user-1" }]),
    };
    const service = new AdminModerationService(
      { moderationEvent, user } as any,
      {} as any,
      {} as any,
      undefined as any,
    );

    await service.getModerationEvents({
      search: "kaan",
      sortBy: "relevanceScore",
      sortOrder: "desc",
      sortType: "number",
    });

    expect(moderationEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { reason: { contains: "kaan", mode: "insensitive" } },
            { userId: { in: ["user-1"] } },
          ]),
        }),
        orderBy: {
          relevanceScore: { sort: "desc", nulls: "last" },
        },
        skip: 0,
        take: 20,
      }),
    );
  });
});
