import { Test, TestingModule } from "@nestjs/testing";
import { MessagingService } from "./messaging.service";
import { ContentFilterService } from "./content-filter.service";
import { NotificationService } from "../notification/notification.service";
import { RealtimeService } from "../websocket/realtime.service";
import { StorageService } from "../storage/storage.service";
import { PrismaService } from "../../prisma";
import { UserBlockService } from "../user-block/user-block.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

describe("MessagingService realtime emit", () => {
  let service: MessagingService;
  let module: TestingModule;
  const realtime = { emitNewMessage: jest.fn(), emitMessageRead: jest.fn() };

  const sentMessage = {
    id: "m1",
    threadId: "t1",
    senderId: "s1",
    receiverId: "r1",
    content: "merhaba",
    status: "sent",
    createdAt: new Date(),
    sender: { id: "s1", displayName: "Ali" },
    receiver: { id: "r1", displayName: "Veli" },
  };
  const mockPrisma = {
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    messageThread: {
      findUnique: jest.fn().mockResolvedValue({
        id: "t1",
        participant1Id: "s1",
        participant2Id: "r1",
        messages: [],
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    message: {
      create: jest.fn().mockResolvedValue(sentMessage),
      count: jest.fn().mockResolvedValue(3),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: UserBlockService,
          useValue: userBlockServiceStub(),
        },
        {
          provide: ContentFilterService,
          useValue: {
            moderateWithAI: jest.fn().mockResolvedValue({
              isClean: true,
              requiresApproval: false,
              filteredContent: null,
              flaggedReason: null,
            }),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            createInAppNotification: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: RealtimeService, useValue: realtime },
        { provide: StorageService, useValue: { getPublicAssetUrl: jest.fn() } },
      ],
    }).compile();
    service = module.get(MessagingService);
  });

  it("emits message:new with mapped DTO when status is sent", async () => {
    await service.sendMessage("t1", "s1", { content: "merhaba" } as any);
    expect(realtime.emitNewMessage).toHaveBeenCalledTimes(1);
    const [threadId, receiverId, dto, update] =
      realtime.emitNewMessage.mock.calls[0];
    expect(threadId).toBe("t1");
    expect(receiverId).toBe("r1");
    expect(dto.id).toBe("m1");
    expect(update.unreadCount).toBe(3);
  });

  /**
   * Canlı teslimat, bildirim üretimine BAĞLI OLMAMALI.
   *
   * İkisi tek try/catch içindeydi ve bildirim önce çalışıyordu: bildirim
   * servisi hata verdiğinde `emitNewMessage` hiç çağrılmıyor, alıcının açık
   * sohbeti sessiz kalıyor ve rozeti ancak 5 dakikalık yoklamada düzeliyordu.
   */
  it("still emits message:new when the notification fails", async () => {
    const failing = module.get(NotificationService) as any;
    failing.createInAppNotification.mockRejectedValueOnce(new Error("down"));

    await service.sendMessage("t1", "s1", { content: "merhaba" } as any);

    expect(realtime.emitNewMessage).toHaveBeenCalledTimes(1);
    expect(realtime.emitNewMessage.mock.calls[0][3].unreadCount).toBe(3);
  });

  it("does not fail the send when realtime emit throws", async () => {
    realtime.emitNewMessage.mockImplementationOnce(() => {
      throw new Error("socket down");
    });
    await expect(
      service.sendMessage("t1", "s1", { content: "merhaba" } as any),
    ).resolves.toMatchObject({ id: "m1" });
  });
});
