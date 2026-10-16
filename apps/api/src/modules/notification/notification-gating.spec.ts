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
    let acceptsMarketing: boolean | undefined;

    const mockPrisma = {
      user: {
        findUnique: jest.fn(({ select }: any) => {
          if (select?.notificationSettings) {
            return Promise.resolve({
              notificationSettings: storedSettings,
              acceptsMarketingEmails: acceptsMarketing,
            });
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
      acceptsMarketing = undefined;

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
          {
            provide: SmtpProvider,
            useValue: { sendEmail, isConfigured: () => false },
          },
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

    it("createInAppNotification: kampanya bildirimi izin kolonunu izler (JSON bayat olsa da)", async () => {
      // Kolon kapalı, bayat JSON açık → zil + push atlanır.
      storedSettings = { marketingEmails: true };
      acceptsMarketing = false;
      const suppressed = await service.createInAppNotification(
        "user-1",
        NotificationType.PROMOTION,
        {},
      );
      expect(suppressed).toBe(false);
      expect(inAppCreateCount()).toBe(0);
      expect(sendToUser).not.toHaveBeenCalled();

      // Kolon açık, JSON'da anahtar kapalı → gider.
      storedSettings = { marketingEmails: false };
      acceptsMarketing = true;
      const delivered = await service.createInAppNotification(
        "user-1",
        NotificationType.PROMOTION,
        {},
      );
      expect(delivered).toBe(true);
      expect(inAppCreateCount()).toBe(1);
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
    let acceptsMarketing: boolean | undefined;
    let fetchMock: jest.Mock;

    const mockPrisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            notificationSettings: storedSettings,
            acceptsMarketingEmails: acceptsMarketing,
          }),
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
      acceptsMarketing = undefined;
      fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ status: "ok" }] }),
      });
      (global as any).fetch = fetchMock;
      // Gerçek gönderim çekirdeği (ExpoPushProvider.sendMessages) — fetch mock'lu.
      worker = new PushWorker(
        mockPrisma as any,
        new ExpoPushProvider({ get: () => "" } as any, mockPrisma as any),
        {} as any,
        { getUnreadCount: jest.fn().mockResolvedValue(0) } as any,
        {} as any,
      );
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

    // S1 — Apple 4.5.4 / İYS: admin duyurusu türüne göre davranır.
    const broadcastJob = (mailingType?: string) =>
      ({
        id: "job-2",
        data: {
          userId: "user-1",
          title: "Duyuru",
          body: "Gövde",
          data: { type: "admin_broadcast", mailingType },
        },
      }) as any;

    it("pazarlama duyurusu + pushNotifications=false → push GİTMEZ, zil yazılmaz", async () => {
      storedSettings = { pushNotifications: false };

      const res = await worker.handleSendNotification(
        broadcastJob("marketing"),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      // Zil satırını admin servisi (izinli kitleye) yazar; worker yazmaz.
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
      expect(res).toMatchObject({
        pushSent: false,
        reason: "Suppressed by user preference",
      });
    });

    it("duyuru (işlemsel/güvenlik) + pushNotifications=false → push yine GİDER", async () => {
      storedSettings = { pushNotifications: false };

      await worker.handleSendNotification(broadcastJob("announcement"));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it("pazarlama duyurusu + izin kolonu kapalı → push GİTMEZ", async () => {
      storedSettings = null;
      acceptsMarketing = false;

      await worker.handleSendNotification(broadcastJob("marketing"));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("pazarlama duyurusu + izin kolonu açık (JSON'da anahtar yok) → push GİDER", async () => {
      storedSettings = null;
      acceptsMarketing = true;

      await worker.handleSendNotification(broadcastJob("marketing"));

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("pazarlama duyurusu: bayat JSON kararı değiştirmez; kolon esastır", async () => {
      // JSON kapalı ama kolon açık → gider.
      storedSettings = { marketingEmails: false };
      acceptsMarketing = true;
      await worker.handleSendNotification(broadcastJob("marketing"));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // JSON açık ama kolon kapalı (bülten çıkışı) → gitmez.
      fetchMock.mockClear();
      storedSettings = { marketingEmails: true };
      acceptsMarketing = false;
      await worker.handleSendNotification(broadcastJob("marketing"));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("duyuru + izin kolonu kapalı → push yine GİDER", async () => {
      acceptsMarketing = false;

      await worker.handleSendNotification(broadcastJob("announcement"));

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("pazarlama duyurusu push'u istemciye type=admin_broadcast olarak gider", async () => {
      acceptsMarketing = true;

      await worker.handleSendNotification(broadcastJob("marketing"));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
      const messages = Array.isArray(sent) ? sent : [sent];
      expect(messages[0].data).toMatchObject({
        type: "admin_broadcast",
        mailingType: "marketing",
      });
    });
  });
});
