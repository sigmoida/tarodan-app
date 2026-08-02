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
});
