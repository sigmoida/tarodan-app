import { NotificationDispatchService } from "./notification-dispatch.service";
import { I18nService } from "../i18n/i18n.service";
import { NotificationType } from "./dto";
import { TIMING_RULES } from "@tarodan/types";

/**
 * Bildirim metinlerindeki süreler ("14 gün", "24 saat"…) gönderim anında
 * Süreler ve Kurallar'dan okunur. Admin değeri değiştirdiğinde kullanıcı eski
 * sayıyı okumaz; her iki dilde doğru çoğul biçimiyle basılır.
 */
describe("notification copy follows the configured durations", () => {
  const settingRows = (values: Record<string, string>) =>
    Object.entries(values).map(([settingKey, settingValue]) => ({
      settingKey,
      settingValue,
      // `updatedBy` dolu = Süreler ve Kurallar ekranından yazılmış satır (kazanır).
      updatedBy: "admin-1",
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    }));

  const makeService = (
    locale: "tr" | "en",
    rows: ReturnType<typeof settingRows> | "fail",
  ) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          notificationSettings: null,
          preferredLanguage: locale,
        }),
      },
      platformSetting: {
        findMany:
          rows === "fail"
            ? jest.fn().mockRejectedValue(new Error("db down"))
            : jest.fn().mockResolvedValue(rows),
      },
      notificationLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const realtime = { emitNotification: jest.fn() };
    const service = new NotificationDispatchService(
      prisma as any,
      { sendToUser: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      realtime as any,
      new I18nService(),
    );
    // Push gönderimi bu testin konusu değil.
    (service as any).sendPushReal = jest.fn().mockResolvedValue(true);
    return { service, prisma, realtime };
  };

  const storedMessage = (prisma: {
    notificationLog: { create: jest.Mock };
  }): string => prisma.notificationLog.create.mock.calls[0][0].data.body;

  it("tr: teslim bildirimi yapılandırılmış iade penceresini basar", async () => {
    const { service, prisma } = makeService(
      "tr",
      settingRows({
        [TIMING_RULES.returnWindowDays.settingKey]: "30",
      }),
    );

    await service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_DELIVERED,
      { orderId: "o1" },
    );

    expect(storedMessage(prisma)).toContain("30 gün içinde koşulsuz iade");
    expect(storedMessage(prisma)).not.toContain("14 gün");
  });

  it("en: çoğul biçimi doğru (1 day / 30 days)", async () => {
    const one = makeService(
      "en",
      settingRows({ [TIMING_RULES.returnWindowDays.settingKey]: "1" }),
    );
    await one.service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_DELIVERED,
      { orderId: "o1" },
    );
    expect(storedMessage(one.prisma)).toContain(
      "right of return for 1 day from",
    );

    const many = makeService(
      "en",
      settingRows({ [TIMING_RULES.returnWindowDays.settingKey]: "30" }),
    );
    await many.service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_DELIVERED,
      { orderId: "o1" },
    );
    expect(storedMessage(many.prisma)).toContain(
      "right of return for 30 days from",
    );
  });

  it("teklif ödeme bildirimi ödeme penceresini (saat) basar", async () => {
    const { service, prisma } = makeService(
      "tr",
      settingRows({
        [TIMING_RULES.orderPaymentWindowHours.settingKey]: "48",
      }),
    );

    await service.createInAppNotification(
      "seller-1",
      NotificationType.OFFER_COUNTER_ACCEPTED,
      { productTitle: "Ferrari", amount: "500" },
    );

    expect(storedMessage(prisma)).toContain("Ödeme yapması için 48 saati var");
  });

  it("süre alanı bildirim verisine (data JSON) sızmaz", async () => {
    const { service, prisma } = makeService("tr", settingRows({}));

    await service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_DELIVERED,
      { orderId: "o1" },
    );

    const stored = prisma.notificationLog.create.mock.calls[0][0].data.data;
    expect(stored).not.toHaveProperty("returnWindowDays");
    expect(stored.orderId).toBe("o1");
  });

  it("ayar satırı yoksa kayıt varsayılanını basar", async () => {
    const { service, prisma } = makeService("tr", settingRows({}));

    await service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_DELIVERED,
      { orderId: "o1" },
    );

    expect(storedMessage(prisma)).toContain(
      `${TIMING_RULES.returnWindowDays.default} gün içinde koşulsuz iade`,
    );
  });

  it("süreler okunamazsa bildirim yine gider (varsayılanlarla)", async () => {
    const { service, prisma } = makeService("tr", "fail");

    const sent = await service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_DELIVERED,
      { orderId: "o1" },
    );

    expect(sent).toBe(true);
    expect(storedMessage(prisma)).toContain(
      `${TIMING_RULES.returnWindowDays.default} gün içinde koşulsuz iade`,
    );
  });

  it("çağıranın verdiği değer süre parametresini ezer", async () => {
    const { service, prisma } = makeService(
      "tr",
      settingRows({ [TIMING_RULES.returnWindowDays.settingKey]: "30" }),
    );

    await service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_DELIVERED,
      { orderId: "o1", returnWindowDays: 7 },
    );

    expect(storedMessage(prisma)).toContain("7 gün içinde koşulsuz iade");
  });
});
