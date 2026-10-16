import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { I18nService } from "../i18n/i18n.service";
import { PrismaService } from "../../prisma";
import { ExpoPushProvider } from "./providers/expo-push.provider";
import { SmsProvider } from "./providers/sms.provider";
import { SmtpProvider } from "../mail/smtp.provider";
import { RealtimeService } from "../websocket/realtime.service";
import { NotificationChannel, NotificationType } from "./dto";

/**
 * B7/B11/B12: ana yol push'u iş isteğini BEKLETMEZ; Android kanalı tipten,
 * iOS rozeti okunmamış zil sayısından gelir. B8: kayıt hatası yutulmaz.
 */
describe("NotificationDispatchService — arka plan push", () => {
  const makeService = async (sendToUser: jest.Mock) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "u1",
          email: "u@example.com",
          notificationSettings: null,
          preferredLanguage: "tr",
        }),
      },
      notificationLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      platformSetting: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const push = {
      isConfigured: () => true,
      sendToUser,
      registerToken: jest.fn(),
      deactivateToken: jest.fn(),
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

  it("Expo yanıtı beklenmeden döner; kanal + rozet seçeneği geçilir", async () => {
    let release: (v: unknown) => void = () => undefined;
    const sendToUser = jest.fn(
      (..._args: unknown[]) => new Promise((resolve) => (release = resolve)),
    );
    const { dispatch } = await makeService(sendToUser);

    await expect(
      dispatch.createInAppNotification("u1", NotificationType.TRADE_COMPLETED, {
        tradeId: "t1",
      }),
    ).resolves.toBe(true);

    // Push başlatıldı ama hâlâ sürüyor — çağıran zaten döndü.
    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(sendToUser.mock.calls[0][4]).toEqual({
      channelId: "trades",
      badge: "unread",
    });
    release([{ success: true }]);
    await dispatch.drainPendingPushes();
  });

  it("send(): push zil kaydından SONRA başlar ve teslim sonucu loglanır", async () => {
    const sendToUser = jest.fn().mockResolvedValue([{ success: false }]);
    const { dispatch, prisma } = await makeService(sendToUser);

    await dispatch.send({
      userId: "u1",
      type: NotificationType.OFFER_EXPIRED_SELLER,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId: "p1", productTitle: "Ürün", offerId: "o1" },
    });
    await dispatch.drainPendingPushes();

    const inAppOrder =
      prisma.notificationLog.create.mock.invocationCallOrder[0];
    expect(sendToUser.mock.invocationCallOrder[0]).toBeGreaterThan(inAppOrder);
    // İkinci create: "push" izleme satırı, başarısız teslimle.
    expect(prisma.notificationLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ channel: "push", status: "failed" }),
    });
  });

  it("sendToUser eşzamanlı fırlatsa da çağıran bozulmaz", async () => {
    const sendToUser = jest.fn(() => {
      throw new Error("boom");
    });
    const { dispatch } = await makeService(sendToUser);

    await expect(
      dispatch.createInAppNotification("u1", NotificationType.TRADE_COMPLETED, {
        tradeId: "t1",
      }),
    ).resolves.toBe(true);
    await dispatch.drainPendingPushes();
  });

  it("kayıt hatası artık 200 {success:false} değil, istisnadır (B8)", async () => {
    const { dispatch, push } = await makeService(jest.fn());
    push.registerToken.mockRejectedValue(new BadRequestException("invalid"));

    await expect(
      dispatch.registerPushToken("u1", { token: "bad", platform: "ios" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deviceModel sağlayıcıya ayrı alan olarak geçer (P8)", async () => {
    const { dispatch, push } = await makeService(jest.fn());

    await dispatch.registerPushToken("u1", {
      token: "ExponentPushToken[x]",
      platform: "android",
      deviceId: "install-1",
      deviceModel: "Pixel 8",
    });

    expect(push.registerToken).toHaveBeenCalledWith(
      "u1",
      "ExponentPushToken[x]",
      "android",
      "install-1",
      "Pixel 8",
    );
  });
});
