import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NotificationService } from "./notification.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { I18nService } from "../i18n/i18n.service";
import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationAccountService } from "./notification-account.service";
import { PrismaService } from "../../prisma";
import { SendGridProvider } from "./providers/sendgrid.provider";
import { ExpoPushProvider } from "./providers/expo-push.provider";
import { SmsProvider } from "./providers/sms.provider";
import { SmtpProvider } from "./providers/smtp.provider";
import { StorageService } from "../storage/storage.service";
import { RealtimeService } from "../websocket/realtime.service";
import { NotificationType, NotificationChannel } from "./dto";
import { PushWorker } from "../../workers/push.worker";

/**
 * Bulgu #9 — bildirim tercihleri gerçekten UYGULANIYOR mu?
 *
 * Saf helper testi notification-preferences.spec.ts'te. Bu dosya servis/worker
 * WIRING'ini doğrular: tercih kapalıyken in-app (zil), realtime emit, push ve
 * email gönderim çağrılarının GERÇEKTEN atlandığını assert eder.
 */
describe("Notification preference gating (wiring)", () => {
  describe("NotificationService", () => {
    let service: NotificationService;
    let storedSettings: Record<string, unknown> | null;

    const mockPrisma = {
      user: {
        findUnique: jest.fn(({ select }: any) => {
          if (select?.notificationSettings) {
            return Promise.resolve({ notificationSettings: storedSettings });
          }
          return Promise.resolve({
            id: "user-1",
            email: "buyer@test.dev",
            displayName: "Alıcı",
            phone: "+905300000000",
          });
        }),
      },
      notificationLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: "log-1" }),
      },
    };

    const sendEmail = jest.fn().mockResolvedValue({ success: true });
    const sendToUser = jest.fn().mockResolvedValue([{ success: true }]);
    const emitNotification = jest.fn();

    const inAppCreateCount = () =>
      mockPrisma.notificationLog.create.mock.calls.filter(
        ([arg]: [any]) => arg?.data?.channel === "in_app",
      ).length;

    beforeEach(async () => {
      jest.clearAllMocks();
      storedSettings = null; // varsayılan = hepsi açık

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationService,
          NotificationDispatchService,
          I18nService,
          NotificationCommerceService,
          NotificationAccountService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: { get: jest.fn() } },
          {
            provide: SendGridProvider,
            useValue: { sendEmail, isConfigured: () => false },
          },
          {
            provide: ExpoPushProvider,
            useValue: {
              sendToUser,
              registerToken: jest.fn(),
              isConfigured: () => false,
            },
          },
          {
            provide: SmsProvider,
            useValue: {
              sendSms: jest.fn().mockResolvedValue({ success: true }),
              isConfigured: () => false,
            },
          },
          { provide: SmtpProvider, useValue: { isConfigured: () => false } },
          {
            provide: StorageService,
            useValue: { getPublicAssetUrl: jest.fn().mockReturnValue(null) },
          },
          { provide: RealtimeService, useValue: { emitNotification } },
        ],
      }).compile();

      service = module.get<NotificationService>(NotificationService);
    });

    it("createInAppNotification: messageAlerts=false → NEW_MESSAGE için zil+emit+push HEPSİ atlanır", async () => {
      storedSettings = { messageAlerts: false };

      const result = await service.createInAppNotification(
        "user-1",
        NotificationType.NEW_MESSAGE,
        {
          threadId: "t-1",
          senderName: "Ayşe",
          messagePreview: "Merhaba",
        },
      );

      expect(result).toBe(false);
      expect(inAppCreateCount()).toBe(0);
      expect(emitNotification).not.toHaveBeenCalled();
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it("createInAppNotification: pushNotifications=false → zil+emit kalır ama push GİTMEZ", async () => {
      storedSettings = { pushNotifications: false };

      const result = await service.createInAppNotification(
        "user-1",
        NotificationType.ORDER_SHIPPED,
        {
          orderId: "o-1",
          trackingNumber: "TR123",
        },
      );

      expect(result).toBe(true);
      expect(inAppCreateCount()).toBe(1);
      expect(emitNotification).toHaveBeenCalledTimes(1);
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it("createInAppNotification: varsayılan (hepsi açık) → zil + push gider", async () => {
      storedSettings = null;

      await service.createInAppNotification(
        "user-1",
        NotificationType.NEW_MESSAGE,
        {
          threadId: "t-1",
          senderName: "Ayşe",
          messagePreview: "Merhaba",
        },
      );

      expect(inAppCreateCount()).toBe(1);
      expect(sendToUser).toHaveBeenCalledTimes(1);
    });

    it("send(): emailNotifications=false → EMAIL kanalı atlanır", async () => {
      storedSettings = { emailNotifications: false };

      await service.send({
        userId: "user-1",
        type: NotificationType.ORDER_SHIPPED,
        channels: [NotificationChannel.EMAIL],
        data: { orderId: "o-1", trackingNumber: "TR123" },
      });

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("send(): ALWAYS_SEND tipi (password_reset) tüm kanallar kapalı olsa bile gönderilir", async () => {
      storedSettings = {
        emailNotifications: false,
        pushNotifications: false,
        smsNotifications: false,
      };

      await service.send({
        userId: "user-1",
        type: NotificationType.PASSWORD_RESET,
        channels: [NotificationChannel.EMAIL],
        data: { resetToken: "abc" },
      });

      expect(sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("PushWorker.handleSendNotification", () => {
    let worker: PushWorker;
    let storedSettings: Record<string, unknown> | null;
    let fetchMock: jest.Mock;

    const mockPrisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({ notificationSettings: storedSettings }),
        ),
      },
      pushToken: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ token: "ExponentPushToken[xxxxxxxx]" }]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      notificationLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const makeJob = (type: string) =>
      ({
        id: "job-1",
        data: {
          userId: "user-1",
          title: "Başlık",
          body: "Gövde",
          data: { type },
        },
      }) as any;

    beforeEach(() => {
      jest.clearAllMocks();
      storedSettings = null;
      fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ status: "ok" }] }),
      });
      (global as any).fetch = fetchMock;
      worker = new PushWorker({ get: () => "" } as any, mockPrisma as any);
    });

    it("messageAlerts=false → in-app KAYDEDİLMEZ, Expo fetch çağrılmaz, pushSent=false", async () => {
      storedSettings = { messageAlerts: false };

      const res = await worker.handleSendNotification(makeJob("new_message"));

      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res).toMatchObject({
        pushSent: false,
        reason: "Suppressed by user preference",
      });
    });

    it("pushNotifications=false → in-app KAYDEDİLİR ama Expo fetch çağrılmaz", async () => {
      storedSettings = { pushNotifications: false };

      const res = await worker.handleSendNotification(makeJob("order_shipped"));

      expect(mockPrisma.notificationLog.create).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res).toMatchObject({ pushSent: false });
    });

    it("varsayılan (hepsi açık) → in-app kaydedilir ve Expo fetch çağrılır", async () => {
      storedSettings = null;

      await worker.handleSendNotification(makeJob("order_shipped"));

      expect(mockPrisma.notificationLog.create).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
