import { getQueueToken } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
// apps/api/src/modules/notification/notification-realtime.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NotificationService } from "./notification.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { I18nService } from "../i18n/i18n.service";
import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationAccountService } from "./notification-account.service";
import { PrismaService } from "../../prisma";
import { ExpoPushProvider } from "./providers/expo-push.provider";
import { SmsProvider } from "./providers/sms.provider";
import { SmtpProvider } from "../mail/smtp.provider";
import { StorageService } from "../storage/storage.service";
import { RealtimeService } from "../websocket/realtime.service";
import { NotificationType } from "./dto/notification.dto";

describe("NotificationService realtime emit", () => {
  let service: NotificationService;
  const realtime = { emitNotification: jest.fn() };
  const mockPrisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "u1", email: "a@b.c", displayName: "A" }),
    },
    notificationLog: {
      create: jest
        .fn()
        .mockResolvedValue({ id: "log-1", createdAt: new Date() }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        NotificationDispatchService,
        I18nService,
        NotificationCommerceService,
        NotificationAccountService,
        {
          provide: getQueueToken(QUEUE_NAMES.EMAIL),
          useValue: { add: jest.fn() },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: ExpoPushProvider, useValue: { isConfigured: () => false } },
        { provide: SmsProvider, useValue: { isConfigured: () => false } },
        {
          provide: SmtpProvider,
          useValue: {
            sendEmail: jest.fn().mockResolvedValue({ success: true }),
            isConfigured: () => false,
          },
        },
        {
          provide: StorageService,
          useValue: { getPublicAssetUrl: jest.fn().mockReturnValue(null) },
        },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();
    service = module.get(NotificationService);
  });

  it("emits notification:new after saving an in-app notification", async () => {
    await service.createInAppNotification("u1", NotificationType.NEW_MESSAGE, {
      senderName: "Ali",
      messagePreview: "selam",
      threadId: "t1",
    });
    expect(realtime.emitNotification).toHaveBeenCalledTimes(1);
    const [userId, payload] = realtime.emitNotification.mock.calls[0];
    expect(userId).toBe("u1");
    expect(payload.type).toBe(NotificationType.NEW_MESSAGE);
    expect(payload.title).toBeTruthy();
    expect(payload.id).toBe("log-1");
  });

  it("stores no icon on a new in-app row", async () => {
    await service.createInAppNotification("u1", NotificationType.NEW_MESSAGE, {
      senderName: "Ali",
      messagePreview: "selam",
      threadId: "t1",
    });
    const { data } = mockPrisma.notificationLog.create.mock.calls[0][0];
    expect(data.data).not.toHaveProperty("icon");
  });

  it("omits the icon from the list, including rows saved with an emoji", async () => {
    mockPrisma.notificationLog.findMany.mockResolvedValueOnce([
      {
        id: "n1",
        type: NotificationType.NEW_MESSAGE,
        title: "t",
        body: "b",
        status: "sent",
        createdAt: new Date(),
        data: { icon: "\u{1F4AC}", threadId: "t1" },
      },
    ]);
    const result = await service.getInAppNotifications("u1");
    const [item] = result.notifications;
    expect(item).not.toHaveProperty("icon");
    expect(item?.data).toEqual({ threadId: "t1" });
  });

  it("drops the emoji a legacy row's title was saved with, keeping the words", async () => {
    mockPrisma.notificationLog.findMany.mockResolvedValueOnce([
      {
        id: "n1",
        type: NotificationType.TRADE_ACCEPTED,
        title: "Takas Kabul Edildi! \u{1F389}",
        body: "b",
        status: "sent",
        createdAt: new Date(),
        data: {},
      },
      {
        id: "n2",
        type: NotificationType.PRODUCT_LIKED,
        title: "\u{1F680} Öne Çıkarma Aktif ❤️",
        body: "b",
        status: "read",
        createdAt: new Date(),
        data: {},
      },
    ]);
    const result = await service.getInAppNotifications("u1");
    expect(result.notifications.map((n) => n.title)).toEqual([
      "Takas Kabul Edildi!",
      "Öne Çıkarma Aktif",
    ]);
  });
});
