import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { I18nService } from "../i18n/i18n.service";
import { PrismaService } from "../../prisma";
import { ExpoPushProvider } from "./providers/expo-push.provider";
import { SmsProvider } from "./providers/sms.provider";
import { SmtpProvider } from "../mail/smtp.provider";
import { RealtimeService } from "../websocket/realtime.service";
import { NotificationType } from "./dto/notification.dto";

/**
 * Outbox'tan yeniden denenen in-app bildirimi push'u TEKRARLAMAMALI.
 * `createInAppNotification` kayıt yazılamasa da push atıyordu; kaydın
 * başarısızlığını "gönderilemedi" sayıp yeniden deneyen çağıran (platform
 * iptali duyurusu) her denemede cihaza yeniden push atardı.
 * `pushRequiresRecord`: push yalnız kayıt yazıldığında gider.
 */
describe("NotificationDispatchService.createInAppNotification — pushRequiresRecord", () => {
  const TYPE = NotificationType.TRADE_CANCELLED_BY_PLATFORM;
  const DATA = {
    tradeId: "t1",
    tradeNumber: "TKS-1",
    reason: "Stok hatası",
    hasRefund: "no",
    refundAmount: 0,
  };

  const makeService = async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "u1",
          notificationSettings: null,
          preferredLanguage: "tr",
        }),
      },
      notificationLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const push = {
      isConfigured: () => true,
      sendToUser: jest.fn().mockResolvedValue([{ success: true }]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        I18nService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: ExpoPushProvider, useValue: push },
        { provide: SmsProvider, useValue: { isConfigured: () => false } },
        {
          provide: SmtpProvider,
          useValue: { sendEmail: jest.fn(), isConfigured: () => false },
        },
        { provide: RealtimeService, useValue: { emitNotification: jest.fn() } },
      ],
    }).compile();
    return { dispatch: module.get(NotificationDispatchService), prisma, push };
  };

  it("kayıt yazılamazsa push GİTMEZ ve false döner (çağıran yeniden dener)", async () => {
    const { dispatch, prisma, push } = await makeService();
    prisma.notificationLog.create.mockRejectedValueOnce(new Error("db down"));

    await expect(
      dispatch.createInAppNotification("u1", TYPE, DATA, {
        pushRequiresRecord: true,
      }),
    ).resolves.toBe(false);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it("başarısız denemeden sonra başarılı deneme push'u TAM BİR kez gönderir", async () => {
    const { dispatch, prisma, push } = await makeService();
    prisma.notificationLog.create.mockRejectedValueOnce(new Error("db down"));

    for (let attempt = 0; attempt < 2; attempt++) {
      await dispatch.createInAppNotification("u1", TYPE, DATA, {
        pushRequiresRecord: true,
      });
    }

    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(2);
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
  });

  it("seçenek verilmezse bugünkü davranış: kayıt yazılamasa da push gider", async () => {
    const { dispatch, prisma, push } = await makeService();
    prisma.notificationLog.create.mockRejectedValueOnce(new Error("db down"));

    await expect(
      dispatch.createInAppNotification("u1", TYPE, DATA),
    ).resolves.toBe(false);
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
  });
});
