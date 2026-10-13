import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { I18nService } from "../i18n/i18n.service";
import { PrismaService } from "../../prisma";
import { ExpoPushProvider } from "./providers/expo-push.provider";
import { SmsProvider } from "./providers/sms.provider";
import { SmtpProvider } from "../mail/smtp.provider";
import { RealtimeService } from "../websocket/realtime.service";
import { NotificationChannel, NotificationType } from "./dto/notification.dto";

/**
 * Satıcıya giden sipariş bildirimleri `audience: "seller"` taşır — özellikle
 * PUSH payload'ında: payload `{ ...data, type }`'tir ve `link` yalnız zil
 * kaydında durur, bu yüzden mobil push dokunuşunda hedef kitleyi tip adından
 * tahmin ediyordu. Alıcıya giden tiplerin verisi değişmez.
 */
describe("bildirim dağıtımı — satıcı hedef kitlesi", () => {
  const makeService = async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "u1",
          email: "u1@example.com",
          displayName: "U1",
          phone: null,
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
    const realtime = { emitNotification: jest.fn() };
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
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();
    return {
      dispatch: module.get(NotificationDispatchService),
      prisma,
      push,
      realtime,
    };
  };

  const pushData = (push: { sendToUser: jest.Mock }) =>
    push.sendToUser.mock.calls[0][3] as Record<string, unknown>;

  describe("createInAppNotification", () => {
    it.each([
      NotificationType.PRODUCT_SOLD,
      NotificationType.ORDER_CANCELLED_SELLER,
      NotificationType.CARGO_MOVEMENT_MISSING,
      NotificationType.REFUND_COMPLETED_SELLER,
      // Kendi kalıbıyla /seller/orders'a giden tipler
      NotificationType.SELLER_ADDRESS_REQUIRED,
      NotificationType.CARGO_CODE_READY,
      NotificationType.OFFER_COUNTER_ACCEPTED,
    ])(
      "%s: push, zil kaydı ve realtime olayı audience=seller taşır",
      async (type) => {
        const { dispatch, prisma, push, realtime } = await makeService();

        await dispatch.createInAppNotification("u1", type, { orderId: "o1" });

        expect(pushData(push)).toMatchObject({
          orderId: "o1",
          audience: "seller",
          type,
        });
        expect(
          prisma.notificationLog.create.mock.calls[0][0].data.data,
        ).toEqual(
          expect.objectContaining({ orderId: "o1", audience: "seller" }),
        );
        expect(realtime.emitNotification.mock.calls[0][1].data).toMatchObject({
          audience: "seller",
        });
      },
    );

    it("üreticinin açıkça verdiği audience'a dokunmaz", async () => {
      const { dispatch, push } = await makeService();

      await dispatch.createInAppNotification(
        "u1",
        NotificationType.PRODUCT_SOLD,
        { orderId: "o1", audience: "buyer" },
      );

      expect(pushData(push).audience).toBe("buyer");
    });

    it("alıcıya giden tipin verisini DEĞİŞTİRMEZ", async () => {
      const { dispatch, push } = await makeService();

      await dispatch.createInAppNotification(
        "u1",
        NotificationType.ORDER_SHIPPED,
        { orderId: "o1" },
      );

      expect(pushData(push)).not.toHaveProperty("audience");
    });
  });

  describe("send", () => {
    it("PUSH kanalı satıcı tipinde audience=seller taşır", async () => {
      const { dispatch, push } = await makeService();

      await dispatch.send({
        userId: "u1",
        type: NotificationType.PRODUCT_SOLD,
        data: { orderId: "o1" },
        channels: [NotificationChannel.PUSH],
      } as never);

      expect(pushData(push)).toMatchObject({
        orderId: "o1",
        audience: "seller",
        type: NotificationType.PRODUCT_SOLD,
      });
    });
  });
});
