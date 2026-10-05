import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationType } from "./dto";
import { NOTIFICATION_TEMPLATES } from "./helpers/notification-templates";
import { resolveWebNotificationLink } from "./helpers/notification-link";
import { translateMessage } from "../i18n/translate";
import { renderEmailTemplate } from "../../common/helpers/email-template-renderer";
import { isEmailTemplateKey } from "../../common/email/email-template-registry";

/**
 * Platform (admin) takas iptali duyurusu: TEK alıcıya TEK kanaldan (outbox
 * satırı = alıcı × kanal). Gerekçe katalog etiketidir (in-app'te alıcının
 * dilinde), iade yalnız ödeyen tarafa söylenir; adminin iç notu sözleşmede
 * yoktur. Gönderim gerçekleşmezse fırlatır (outbox yalnız o satırı yeniden
 * dener); gönderilecek bir şey yoksa fırlatmaz.
 */
describe("NotificationCommerceService.sendTradeCancelledByPlatformNotice", () => {
  const base = {
    tradeId: "t1",
    tradeNumber: "TKS-1",
    reasonCode: "stock_error" as const,
  };
  const users: Record<string, Record<string, unknown>> = {
    u1: {
      email: "ayse@example.com",
      displayName: "Ayşe",
      preferredLanguage: "tr",
      notificationSettings: null,
    },
    u2: {
      email: "john@example.com",
      displayName: "John",
      preferredLanguage: "en",
      notificationSettings: null,
    },
  };

  const makeService = (
    opts: { emailConfigured?: boolean; user?: Record<string, unknown> } = {},
  ) => {
    const dispatch = {
      createInAppNotification: jest.fn().mockResolvedValue(true),
      sendTemplateEmailToAddress: jest
        .fn()
        .mockResolvedValue({ success: true }),
      getProviderStatus: jest.fn().mockReturnValue({
        email: opts.emailConfigured ?? true,
        expo: true,
        sms: false,
      }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          opts.user !== undefined ? opts.user : (users[where.id] ?? null),
        ),
      },
    };
    const service = new NotificationCommerceService(
      dispatch as never,
      prisma as never,
      {} as never,
    );
    return { service, dispatch, prisma };
  };

  it("in-app: platform iptali tipi, alıcının dilinde etiket, kendi iadesi; e-posta gönderilmez", async () => {
    const { service, dispatch } = makeService();

    await service.sendTradeCancelledByPlatformNotice({
      ...base,
      userId: "u1",
      refundAmount: 230,
      channel: "in_app",
    });
    await service.sendTradeCancelledByPlatformNotice({
      ...base,
      userId: "u2",
      refundAmount: 0,
      channel: "in_app",
    });

    expect(dispatch.createInAppNotification).toHaveBeenCalledTimes(2);
    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "u1",
      NotificationType.TRADE_CANCELLED_BY_PLATFORM,
      {
        tradeId: "t1",
        tradeNumber: "TKS-1",
        reason: "Stok hatası",
        hasRefund: "yes",
        refundAmount: 230,
      },
      // Kayıt yazılamazsa push da gitmez → yeniden deneme push tekrarlamaz.
      { pushRequiresRecord: true },
    );
    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "u2",
      NotificationType.TRADE_CANCELLED_BY_PLATFORM,
      {
        tradeId: "t1",
        tradeNumber: "TKS-1",
        reason: "Stock error",
        hasRefund: "no",
        refundAmount: 0,
      },
      { pushRequiresRecord: true },
    );
    expect(dispatch.sendTemplateEmailToAddress).not.toHaveBeenCalled();
  });

  it("e-posta: yönetilen şablon, varsayılan dilde etiket, takas linki; in-app gönderilmez", async () => {
    const { service, dispatch } = makeService();

    await service.sendTradeCancelledByPlatformNotice({
      ...base,
      userId: "u1",
      refundAmount: 230,
      channel: "email",
    });

    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledTimes(1);
    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
      "ayse@example.com",
      "trade-cancelled-platform",
      expect.objectContaining({
        name: "Ayşe",
        tradeNumber: "TKS-1",
        reason: "Stok hatası",
        refundAmount: 230,
        tradeUrl: expect.stringMatching(/\/profile\/trades\/t1$/),
      }),
    );
    expect(dispatch.createInAppNotification).not.toHaveBeenCalled();
    expect(isEmailTemplateKey("trade-cancelled-platform")).toBe(true);
  });

  it("kullanıcı okunamazsa (gönderimden önce) fırlatır → outbox yeniden dener", async () => {
    const { service, prisma, dispatch } = makeService();
    prisma.user.findUnique.mockRejectedValueOnce(new Error("db down"));

    await expect(
      service.sendTradeCancelledByPlatformNotice({
        ...base,
        userId: "u1",
        refundAmount: 230,
        channel: "in_app",
      }),
    ).rejects.toThrow("db down");
    expect(dispatch.createInAppNotification).not.toHaveBeenCalled();
  });

  it("in-app kaydedilemezse fırlatır", async () => {
    const { service, dispatch } = makeService();
    dispatch.createInAppNotification.mockResolvedValueOnce(false);

    await expect(
      service.sendTradeCancelledByPlatformNotice({
        ...base,
        userId: "u1",
        refundAmount: 0,
        channel: "in_app",
      }),
    ).rejects.toThrow();
  });

  it("e-posta sağlayıcıda başarısızsa fırlatır", async () => {
    const { service, dispatch } = makeService();
    dispatch.sendTemplateEmailToAddress.mockResolvedValueOnce({
      success: false,
      error: "SMTP 421",
    });

    await expect(
      service.sendTradeCancelledByPlatformNotice({
        ...base,
        userId: "u1",
        refundAmount: 0,
        channel: "email",
      }),
    ).rejects.toThrow("SMTP 421");
  });

  it("gönderilecek bir şey yoksa fırlatmaz: kullanıcı yok / bildirim kategorisi kapalı / e-posta sağlayıcısı yok", async () => {
    const missing = makeService({ user: null as never });
    await expect(
      missing.service.sendTradeCancelledByPlatformNotice({
        ...base,
        userId: "ghost",
        refundAmount: 0,
        channel: "in_app",
      }),
    ).resolves.toBeUndefined();

    const optedOut = makeService({
      user: {
        ...users.u1,
        notificationSettings: { orderUpdates: false },
      },
    });
    await expect(
      optedOut.service.sendTradeCancelledByPlatformNotice({
        ...base,
        userId: "u1",
        refundAmount: 0,
        channel: "in_app",
      }),
    ).resolves.toBeUndefined();
    expect(optedOut.dispatch.createInAppNotification).not.toHaveBeenCalled();

    const noProvider = makeService({ emailConfigured: false });
    noProvider.dispatch.sendTemplateEmailToAddress.mockResolvedValueOnce({
      success: false,
      error: "No email provider configured",
    });
    await expect(
      noProvider.service.sendTradeCancelledByPlatformNotice({
        ...base,
        userId: "u1",
        refundAmount: 0,
        channel: "email",
      }),
    ).resolves.toBeUndefined();
  });

  it("taraf yüklerinin hiçbirinde iç not alanı yoktur", async () => {
    const { service, dispatch } = makeService();

    for (const channel of ["in_app", "email"] as const) {
      await service.sendTradeCancelledByPlatformNotice({
        ...base,
        userId: "u1",
        refundAmount: 230,
        channel,
      });
    }

    const payloads = [
      ...dispatch.createInAppNotification.mock.calls.map((call) => call[2]),
      ...dispatch.sendTemplateEmailToAddress.mock.calls.map((call) => call[2]),
    ];
    expect(payloads).toHaveLength(2);
    for (const payload of payloads) {
      expect(Object.keys(payload)).not.toContain("note");
    }
  });
});

describe("platform iptali bildirim metni ve hedefi", () => {
  const template =
    NOTIFICATION_TEMPLATES[NotificationType.TRADE_CANCELLED_BY_PLATFORM]!;

  it("ödeyen tarafa tutar, ödemeyene yalnız iptal + ürünlerin serbestliği söylenir", () => {
    const paid = translateMessage(template.messageKey, "tr", {
      tradeNumber: "TKS-1",
      reason: "Stok hatası",
      hasRefund: "yes",
      refundAmount: 230,
    });
    const unpaid = translateMessage(template.messageKey, "en", {
      tradeNumber: "TKS-1",
      reason: "Stock error",
      hasRefund: "no",
      refundAmount: 0,
    });

    expect(paid).toContain("Tarodan tarafından iptal edildi");
    expect(paid).toContain("Stok hatası");
    expect(paid).toContain("230");
    expect(paid).toContain("serbest");
    expect(unpaid).toContain("cancelled by Tarodan");
    expect(unpaid).toContain("Stock error");
    expect(unpaid).not.toContain("refunded");
    expect(unpaid).toContain("free again");
  });

  it("bildirim takas dosyasına gider", () => {
    expect(
      resolveWebNotificationLink(NotificationType.TRADE_CANCELLED_BY_PLATFORM, {
        tradeId: "t1",
      }),
    ).toBe("/profile/trades/t1");
  });
});

describe("trade-cancelled-platform e-postası", () => {
  const brand = { frontendUrl: "https://tarodan.com.tr" };

  it("iadeli tarafa tutarı ve tam iade notunu basar", () => {
    const html = renderEmailTemplate(
      "trade-cancelled-platform",
      {
        name: "Ayşe",
        tradeNumber: "TKS-1",
        reason: "Stok hatası",
        refundAmount: 230,
        tradeUrl: "https://tarodan.com.tr/profile/trades/t1",
      },
      brand,
    );
    expect(html).toContain("Tarodan Tarafından İptal Edildi");
    expect(html).toContain("Stok hatası");
    expect(html).toContain("230,00 TL");
    expect(html).toContain("tamamı");
    expect(html).toContain("yeniden serbest");
  });

  it("iadesi olmayan tarafa tutar satırı basmaz", () => {
    const html = renderEmailTemplate(
      "trade-cancelled-platform",
      {
        name: "John",
        tradeNumber: "TKS-1",
        reason: "Stok hatası",
        refundAmount: 0,
      },
      brand,
    );
    expect(html).not.toContain("İade Tutarı");
    expect(html).toContain("yeniden serbest");
  });
});
