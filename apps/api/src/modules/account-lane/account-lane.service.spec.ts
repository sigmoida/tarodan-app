import { ForbiddenException } from "@nestjs/common";
import { AccountLaneService, laneCacheKey } from "./account-lane.service";
import { laneOf, laneRowWhere, laneUserWhere } from "./account-lane";

describe("AccountLaneService", () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const cache = {
    del: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn((_key: string, factory: () => Promise<unknown>) =>
      factory(),
    ),
  };
  const service = new AccountLaneService(prisma as any, cache as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockImplementation(async ({ where }: any) => ({
      isTestAccount: where.id.startsWith("test-"),
    }));
  });

  it("treats anonymous viewers as live without a lookup", async () => {
    expect(await service.laneOfUser(undefined)).toBe("live");
    expect(await service.laneOfUser(null)).toBe("live");
    expect(cache.getOrSet).not.toHaveBeenCalled();
  });

  it("resolves the lane from User.isTestAccount through the cache", async () => {
    expect(await service.laneOfUser("test-1")).toBe("test");
    expect(await service.laneOfUser("live-1")).toBe("live");
    expect(cache.getOrSet.mock.calls[0][0]).toBe(laneCacheKey("test-1"));
  });

  it("falls back to live for unknown users", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await service.laneOfUser("ghost")).toBe("live");
  });

  it("lanesDiffer: live↔test differ, guest counts as live", async () => {
    expect(await service.lanesDiffer("live-1", "test-1")).toBe(true);
    expect(await service.lanesDiffer("test-1", "test-2")).toBe(false);
    expect(await service.lanesDiffer(undefined, "test-1")).toBe(true);
    expect(await service.lanesDiffer(undefined, "live-1")).toBe(false);
  });

  it("assertSameLane throws 403 across lanes and passes within a lane", async () => {
    await expect(
      service.assertSameLane("live-1", "test-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertSameLane("test-1", "test-2"),
    ).resolves.toBeUndefined();
  });

  it("invalidate drops the cached lane", async () => {
    await service.invalidate("u1");
    expect(cache.del).toHaveBeenCalledWith(laneCacheKey("u1"));
  });

  it("helpers map lanes to predicates", () => {
    expect(laneOf({ isTestAccount: true })).toBe("test");
    expect(laneOf(null)).toBe("live");
    expect(laneUserWhere("test")).toEqual({ isTestAccount: true });
    expect(laneUserWhere("live")).toEqual({ isTestAccount: false });
    expect(laneRowWhere("test")).toEqual({ isTest: true });
  });
});
