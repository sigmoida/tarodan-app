import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationType } from "./dto";
import { NOTIFICATION_TEMPLATES } from "./helpers/notification-templates";
import { resolveWebNotificationLink } from "./helpers/notification-link";
import { translateMessage } from "../i18n/translate";
import { renderEmailTemplate } from "../../common/helpers/email-template-renderer";
import { isEmailTemplateKey } from "../../common/email/email-template-registry";

/**
 * Platform (admin) takas iptali duyurusu: her tarafa TEK in-app bildirim ve TEK
 * e-posta. Gerekçe katalog etiketidir (alıcının dilinde), iade yalnız ödeyen
 * tarafa söylenir; adminin iç notu sözleşmede yoktur, hiçbir yüke giremez.
 */
describe("NotificationCommerceService.notifyTradeCancelledByPlatform", () => {
  const notice = {
    tradeId: "t1",
    tradeNumber: "TKS-1",
    reasonCode: "stock_error" as const,
    parties: [
      { userId: "u1", refundAmount: 230 },
      { userId: "u2", refundAmount: 0 },
    ],
  };

  const makeService = () => {
    const dispatch = {
      createInAppNotification: jest.fn().mockResolvedValue(true),
      sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: "u1", displayName: "Ayşe", preferredLanguage: "tr" },
          { id: "u2", displayName: "John", preferredLanguage: "en" },
        ]),
      },
    };
    const service = new NotificationCommerceService(
      dispatch as never,
      prisma as never,
      {} as never,
    );
    return { service, dispatch };
  };

  it("her tarafa tam olarak bir in-app ve bir e-posta", async () => {
    const { service, dispatch } = makeService();

    await service.notifyTradeCancelledByPlatform(notice);

    expect(dispatch.createInAppNotification).toHaveBeenCalledTimes(2);
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledTimes(2);
    for (const userId of ["u1", "u2"]) {
      expect(
        dispatch.createInAppNotification.mock.calls.filter(
          ([target]) => target === userId,
        ),
      ).toHaveLength(1);
      expect(
        dispatch.sendTemplateEmailToUser.mock.calls.filter(
          ([target]) => target === userId,
        ),
      ).toHaveLength(1);
    }
  });

  it("in-app: platform iptali tipi, alıcının dilinde etiket, yalnız kendi iadesi", async () => {
    const { service, dispatch } = makeService();

    await service.notifyTradeCancelledByPlatform(notice);

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
    );
  });

  it("e-posta: yönetilen şablon, varsayılan dilde etiket, takas linki", async () => {
    const { service, dispatch } = makeService();

    await service.notifyTradeCancelledByPlatform(notice);

    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "u1",
      "trade-cancelled-platform",
      expect.objectContaining({
        name: "Ayşe",
        tradeNumber: "TKS-1",
        reason: "Stok hatası",
        refundAmount: 230,
        tradeUrl: expect.stringMatching(/\/profile\/trades\/t1$/),
      }),
    );
    expect(isEmailTemplateKey("trade-cancelled-platform")).toBe(true);
  });

  it("bir tarafın in-app hatası diğer tarafı ve e-postaları engellemez (fırlatmaz)", async () => {
    const { service, dispatch } = makeService();
    dispatch.createInAppNotification.mockRejectedValueOnce(new Error("db"));

    await expect(
      service.notifyTradeCancelledByPlatform(notice),
    ).resolves.toBeUndefined();
    expect(dispatch.createInAppNotification).toHaveBeenCalledTimes(2);
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledTimes(2);
  });

  it("taraf yüklerinin hiçbirinde iç not alanı yoktur", async () => {
    const { service, dispatch } = makeService();

    await service.notifyTradeCancelledByPlatform(notice);

    const payloads = [
      ...dispatch.createInAppNotification.mock.calls.map((call) => call[2]),
      ...dispatch.sendTemplateEmailToUser.mock.calls.map((call) => call[2]),
    ];
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
