import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { UserBlockService } from "./user-block.service";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { USER_BLOCKED_EVENT, blockedCacheKey } from "./user-block.constants";

describe("UserBlockService", () => {
  let service: UserBlockService;
  const tx = {
    userBlock: { create: jest.fn() },
    userFollow: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    userBlock: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const cache = {
    del: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn((_key: string, factory: () => Promise<unknown>) =>
      factory(),
    ),
  };
  const events = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.userBlock.count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        UserBlockService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    service = module.get(UserBlockService);
  });

  describe("block", () => {
    it("rejects self-block", async () => {
      await expect(service.block("u1", "u1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("rejects unknown target", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.block("u1", "u2")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("rejects duplicate block", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u2", displayName: "B" });
      prisma.userBlock.findUnique.mockResolvedValue({ id: "b0" });
      await expect(service.block("u1", "u2")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("creates the block, unfollows both ways, invalidates both caches and emits", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u2", displayName: "B" });
      prisma.userBlock.findUnique.mockResolvedValue(null);
      tx.userBlock.create.mockResolvedValue({ id: "b1", reason: "spam" });

      const result = await service.block("u1", "u2", " spam ");

      expect(result).toEqual({ success: true, blockedDisplayName: "B" });
      expect(tx.userBlock.create).toHaveBeenCalledWith({
        data: { blockerId: "u1", blockedId: "u2", reason: "spam" },
      });
      const unfollowWhere = tx.userFollow.deleteMany.mock.calls[0][0].where;
      expect(unfollowWhere.OR).toEqual([
        { followerId: "u1", followingId: "u2" },
        { followerId: "u2", followingId: "u1" },
      ]);
      expect(cache.del).toHaveBeenCalledWith(blockedCacheKey("u1"));
      expect(cache.del).toHaveBeenCalledWith(blockedCacheKey("u2"));
      expect(events.emit).toHaveBeenCalledWith(USER_BLOCKED_EVENT, {
        blockId: "b1",
        blockerId: "u1",
        blockedId: "u2",
        reason: "spam",
      });
    });
  });

  describe("unblock", () => {
    it("404s when no block exists", async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unblock("u1", "u2")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cache.del).not.toHaveBeenCalled();
    });

    it("deletes and invalidates both caches", async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 1 });
      await service.unblock("u1", "u2");
      expect(cache.del).toHaveBeenCalledTimes(2);
    });
  });

  describe("getHiddenUserIds / isBlockedEither", () => {
    it("returns [] for anonymous viewers without touching cache", async () => {
      expect(await service.getHiddenUserIds(undefined)).toEqual([]);
      expect(cache.getOrSet).not.toHaveBeenCalled();
    });

    it("unions both directions, deduplicated and sorted", async () => {
      prisma.userBlock.findMany.mockResolvedValue([
        { blockerId: "me", blockedId: "z" },
        { blockerId: "a", blockedId: "me" },
        { blockerId: "me", blockedId: "a" },
      ]);
      expect(await service.getHiddenUserIds("me")).toEqual(["a", "z"]);
      expect(prisma.userBlock.findMany.mock.calls[0][0].where).toEqual({
        OR: [{ blockerId: "me" }, { blockedId: "me" }],
      });
    });

    it("isBlockedEither is symmetric via the hidden list", async () => {
      prisma.userBlock.findMany.mockResolvedValue([
        { blockerId: "b", blockedId: "a" },
      ]);
      expect(await service.isBlockedEither("a", "b")).toBe(true);
      expect(await service.isBlockedEither("a", "a")).toBe(false);
    });
  });
});
