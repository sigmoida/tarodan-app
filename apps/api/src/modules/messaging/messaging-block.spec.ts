import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { MessagingService } from "./messaging.service";
import { ContentFilterService } from "./content-filter.service";
import { NotificationService } from "../notification/notification.service";
import { RealtimeService } from "../websocket/realtime.service";
import { StorageService } from "../storage/storage.service";
import { MediaService } from "../media/media.service";
import { PrismaService } from "../../prisma";
import { UserBlockService } from "../user-block/user-block.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

describe("MessagingService — user blocks", () => {
  let service: MessagingService;
  const thread = { id: "t1", participant1Id: "u1", participant2Id: "u2" };
  const prisma = {
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: "u2" }) },
    messageThread: {
      findUnique: jest.fn().mockResolvedValue({ ...thread, messages: [] }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    message: { count: jest.fn().mockResolvedValue(0) },
  };
  const userBlocks = userBlockServiceStub();
  const contentFilter = { moderateWithAI: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    userBlocks.isBlockedEither.mockResolvedValue(false);
    userBlocks.getHiddenUserIds.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContentFilterService, useValue: contentFilter },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeService, useValue: {} },
        { provide: StorageService, useValue: {} },
        {
          provide: MediaService,
          useValue: {
            findInvalidMessageAttachmentTargets: jest
              .fn()
              .mockResolvedValue([]),
          },
        },
        { provide: UserBlockService, useValue: userBlocks },
      ],
    }).compile();
    service = module.get(MessagingService);
  });

  it("sendMessage → 403 when either side blocked, before content filtering", async () => {
    userBlocks.isBlockedEither.mockResolvedValue(true);
    await expect(
      service.sendMessage("t1", "u1", { content: "hi" } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userBlocks.isBlockedEither).toHaveBeenCalledWith("u1", "u2");
    expect(contentFilter.moderateWithAI).not.toHaveBeenCalled();
  });

  it("createThread → 403 when either side blocked", async () => {
    userBlocks.isBlockedEither.mockResolvedValue(true);
    await expect(
      service.createThread("u1", {
        recipientId: "u2",
        getRecipientId: () => "u2",
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.messageThread.findFirst).not.toHaveBeenCalled();
  });

  it("getThreadById / getThreadMessages → 403 for a blocked pair (deep link)", async () => {
    userBlocks.isBlockedEither.mockResolvedValue(true);
    (prisma.messageThread as any).findUnique = jest.fn().mockResolvedValue({
      id: "t1",
      participant1Id: "u1",
      participant2Id: "u2",
    });
    await expect(service.getThreadById("t1", "u1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.getThreadMessages("t1", "u1", { page: 1, pageSize: 50 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userBlocks.isBlockedEither).toHaveBeenCalledWith("u1", "u2");
  });

  it("getUserThreads excludes threads with hidden users", async () => {
    userBlocks.getHiddenUserIds.mockResolvedValue(["x", "y"]);
    await service.getUserThreads("u1", { page: 1, pageSize: 20 } as any);
    const where = prisma.messageThread.findMany.mock.calls[0][0].where;
    expect(where.NOT).toEqual([
      { participant1Id: { in: ["x", "y"] } },
      { participant2Id: { in: ["x", "y"] } },
    ]);
    expect(prisma.messageThread.count.mock.calls[0][0].where).toBe(where);
  });

  it("getUserThreads leaves the where untouched when nothing is hidden", async () => {
    await service.getUserThreads("u1", { page: 1, pageSize: 20 } as any);
    const where = prisma.messageThread.findMany.mock.calls[0][0].where;
    expect(where.NOT).toBeUndefined();
  });

  it("getUnreadMessageCount ignores messages from hidden users", async () => {
    userBlocks.getHiddenUserIds.mockResolvedValue(["x"]);
    await service.getUnreadMessageCount("u1");
    expect(prisma.message.count.mock.calls[0][0].where.senderId).toEqual({
      notIn: ["x"],
    });
  });

  describe("deleted recipient", () => {
    const deletedRecipient = { id: "u2", deletedAt: new Date() };
    // Engelli alıcıyla aynı tür (403), kendi metniyle.
    const expectRecipientDeleted = (error: unknown) => {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        i18nKey: "server.messaging.recipientDeleted",
      });
    };

    it("sendMessage → 403 when the other participant deleted the account", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(deletedRecipient);
      const error = await service
        .sendMessage("t1", "u1", { content: "hi" } as any)
        .catch((e: unknown) => e);
      expectRecipientDeleted(error);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "u2" },
        select: { deletedAt: true },
      });
      expect(contentFilter.moderateWithAI).not.toHaveBeenCalled();
    });

    const openChat = (message?: string) =>
      service.createThread("u1", {
        recipientId: "u2",
        getRecipientId: () => "u2",
        ...(message ? { message } : {}),
      } as any);

    it("createThread → 403 for a deleted recipient when no thread exists yet", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(deletedRecipient);
      prisma.messageThread.findFirst.mockResolvedValueOnce(null);
      const create = jest.fn();
      (prisma.messageThread as any).create = create;

      expectRecipientDeleted(await openChat().catch((e: unknown) => e));
      expect(create).not.toHaveBeenCalled();
    });

    it("createThread without a message opens the existing thread (history stays reachable)", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(deletedRecipient);
      prisma.messageThread.findFirst.mockResolvedValueOnce(thread);
      const opened = { id: "t1" } as any;
      const getThread = jest
        .spyOn(service, "getThreadById")
        .mockResolvedValueOnce(opened);

      await expect(openChat()).resolves.toBe(opened);
      expect(getThread).toHaveBeenCalledWith("t1", "u1");
    });

    it("createThread with a message into an existing thread → 403", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(deletedRecipient) // createThread alıcı okuması
        .mockResolvedValueOnce(deletedRecipient); // sendMessage alıcı denetimi
      prisma.messageThread.findFirst.mockResolvedValueOnce(thread);

      expectRecipientDeleted(await openChat("selam").catch((e: unknown) => e));
      expect(contentFilter.moderateWithAI).not.toHaveBeenCalled();
    });
  });
});
