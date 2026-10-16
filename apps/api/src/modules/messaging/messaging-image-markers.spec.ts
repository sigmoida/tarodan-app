import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { MessagingService } from "./messaging.service";
import { ContentFilterService } from "./content-filter.service";
import { NotificationService } from "../notification/notification.service";
import { RealtimeService } from "../websocket/realtime.service";
import { StorageService } from "../storage/storage.service";
import { MediaService } from "../media/media.service";
import { PrismaService } from "../../prisma";
import { UserBlockService } from "../user-block/user-block.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

/**
 * `[IMG:…]` işaretleri: istemciler hedefi alıcının oturum jetonuyla yükler.
 * Gönderimde her hedef göndericinin kendi mesaj eki olmalı — değilse 400 ve
 * mesaj HİÇ yazılmaz (içerik filtresine/AI'ya da gitmez).
 */
describe("MessagingService — image marker validation", () => {
  let service: MessagingService;
  const OWN =
    "https://api.tarodan.test/api/media/message-attachment/0b0f6c3e-8a2d-4c1b-9f51-3a7e2d9c4b10";
  const EVIL = "https://attacker.example/x.png";

  const prisma = {
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: "r1", deletedAt: null }),
    },
    messageThread: {
      findUnique: jest.fn().mockResolvedValue({
        id: "t1",
        participant1Id: "s1",
        participant2Id: "r1",
        messages: [],
      }),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    message: {
      create: jest.fn().mockResolvedValue({
        id: "m1",
        threadId: "t1",
        senderId: "s1",
        receiverId: "r1",
        content: "x",
        status: "sent",
        createdAt: new Date(),
        sender: { id: "s1", displayName: "Ali" },
        receiver: { id: "r1", displayName: "Veli" },
      }),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const contentFilter = {
    moderateWithAI: jest.fn().mockResolvedValue({
      isClean: true,
      requiresApproval: false,
      filteredContent: null,
      flaggedReason: null,
    }),
  };
  const media = { findInvalidMessageAttachmentTargets: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    media.findInvalidMessageAttachmentTargets.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContentFilterService, useValue: contentFilter },
        {
          provide: NotificationService,
          useValue: {
            createInAppNotification: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: RealtimeService,
          useValue: { emitNewMessage: jest.fn() },
        },
        { provide: StorageService, useValue: {} },
        { provide: MediaService, useValue: media },
        { provide: UserBlockService, useValue: userBlockServiceStub() },
      ],
    }).compile();
    service = module.get(MessagingService);
  });

  it("işaretsiz mesaj → ek doğrulamasına hiç gitmez, gönderilir", async () => {
    await service.sendMessage("t1", "s1", { content: "merhaba" });

    expect(media.findInvalidMessageAttachmentTargets).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it("göndericinin kendi eki → hedefler gönderici ile doğrulanır, gönderilir", async () => {
    await service.sendMessage("t1", "s1", {
      content: `bak bu güzel [IMG:${OWN}]`,
    });

    expect(media.findInvalidMessageAttachmentTargets).toHaveBeenCalledWith(
      [OWN],
      "s1",
    );
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it("harici URL işareti → 400 (i18n anahtarı), mesaj yazılmaz, filtreye gitmez", async () => {
    media.findInvalidMessageAttachmentTargets.mockResolvedValue([EVIL]);

    const send = service.sendMessage("t1", "s1", {
      content: `[IMG:${OWN}] [IMG:${EVIL}]`,
    });

    await expect(send).rejects.toBeInstanceOf(BadRequestException);
    await expect(send).rejects.toMatchObject({
      response: { i18nKey: "server.messaging.invalidImageAttachment" },
    });
    expect(media.findInvalidMessageAttachmentTargets).toHaveBeenCalledWith(
      [OWN, EVIL],
      "s1",
    );
    expect(contentFilter.moderateWithAI).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("createThread ilk mesajı da aynı doğrulamadan geçer (var olan konu)", async () => {
    prisma.messageThread.findFirst.mockResolvedValue({
      id: "t1",
      participant1Id: "r1",
      participant2Id: "s1",
    });
    media.findInvalidMessageAttachmentTargets.mockResolvedValue([EVIL]);

    await expect(
      service.createThread("s1", {
        recipientId: "r1",
        message: `[IMG:${EVIL}]`,
        getRecipientId: () => "r1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
