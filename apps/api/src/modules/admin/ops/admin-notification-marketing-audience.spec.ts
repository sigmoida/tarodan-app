import { BadRequestException } from "@nestjs/common";
import { AdminNotificationService } from "./admin-notification.service";

/**
 * Duyuru türü kitleyi kanala göre belirler (S1 — Apple 4.5.4, İYS).
 *
 * Pazarlama türünde push + zil satırı kullanıcının kampanya (PROMOTION)
 * bildirim tercihine, e-posta `User.acceptsMarketingEmails` iznine bağlıdır;
 * duyuru (işlemsel/güvenlik) türü aynen herkese gider.
 */
describe("AdminNotificationService — pazarlama türü kitlesi", () => {
  const PROMOTION_CANDIDATES = {
    OR: [
      { acceptsMarketingEmails: true },
      {
        notificationSettings: { path: ["marketingEmails"], equals: true },
      },
    ],
  };

  /** Kampanya adayı satırı: JSON anahtarı ve e-posta izni kolonu ayrı verilir. */
  type PromotionRow = {
    id: string;
    notificationSettings?: Record<string, unknown> | null;
    acceptsMarketingEmails?: boolean;
  };
  const promoted = (id: string): PromotionRow => ({
    id,
    notificationSettings: { marketingEmails: true },
    acceptsMarketingEmails: true,
  });

  /**
   * `promotion`: kampanya aday satırları (kimlik verilirse tercihi açık),
   * `consenting`: e-posta izni açık kullanıcılar. Filtreye bakıp ilgili
   * listeyi döner; filtresiz (duyuru) sorgu `everyone` döner.
   */
  const makeService = (
    lists: {
      promotion?: Array<string | PromotionRow>;
      consenting?: string[];
      everyone?: string[];
    } = {},
  ) => {
    const { promotion = ["u1"], consenting = ["u1"], everyone = [] } = lists;
    const prisma = {
      notificationLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.OR) {
            return promotion.map((p) =>
              typeof p === "string" ? promoted(p) : p,
            );
          }
          const ids = where.acceptsMarketingEmails ? consenting : everyone;
          return ids.map((id) => ({ id }));
        }),
      },
    };
    const eventService = {
      emitAdminBroadcast: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const newsletter = {
      resolveMarketingUnsubscribeTokens: jest
        .fn()
        .mockImplementation(
          async (ids: string[]) => new Map(ids.map((id) => [id, `tok-${id}`])),
        ),
    };
    const service = new AdminNotificationService(
      prisma as never,
      eventService as never,
      audit as never,
      newsletter as never,
      {} as never, // media — yükleme bu spec'in konusu değil
    );
    return { service, prisma, eventService, newsletter };
  };

  const dto = (extra: Record<string, unknown> = {}) => ({
    title: "Kampanya",
    body: "Gövde",
    channels: ["push"],
    targetType: "user_ids" as const,
    userIds: ["u1", "u2"],
    ...extra,
  });

  const rows = (prisma: any) =>
    prisma.notificationLog.createMany.mock.calls.flatMap(
      (call: any[]) => call[0].data,
    );

  const channelRows = (prisma: any, channel: string) =>
    rows(prisma)
      .filter((r: any) => r.channel === channel)
      .map((r: any) => r.userId);

  it("pazarlama: zil satırı ve push yalnız kampanya tercihi açık kullanıcıya", async () => {
    const { service, prisma, eventService } = makeService({
      promotion: ["u1"],
    });

    await service.sendNotification(
      "admin-1",
      dto({ channels: ["push"], mailingType: "marketing" }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["u1", "u2"] },
        isBanned: false,
        ...PROMOTION_CANDIDATES,
      },
      select: { id: true },
    });
    expect(channelRows(prisma, "in_app")).toEqual(["u1"]);
    expect(channelRows(prisma, "push")).toEqual(["u1"]);
    const emitted = eventService.emitAdminBroadcast.mock.calls[0][0];
    expect(emitted.userIds).toEqual(["u1"]);
    expect(emitted.pushUserIds).toEqual(["u1"]);
  });

  it("pazarlama: kampanya tercihi kapalı kullanıcı (u2) ne zil ne push alır", async () => {
    const { service, prisma, eventService } = makeService({
      promotion: ["u1"],
      consenting: ["u1", "u2"], // e-posta izni push kitlesine girmez
    });

    await service.sendNotification(
      "admin-1",
      dto({ channels: ["push"], mailingType: "marketing" }),
    );

    expect(channelRows(prisma, "in_app")).not.toContain("u2");
    expect(channelRows(prisma, "push")).not.toContain("u2");
    expect(
      eventService.emitAdminBroadcast.mock.calls[0][0].userIds,
    ).not.toContain("u2");
  });

  it.each([
    ["JSON true", { notificationSettings: { marketingEmails: true } }, true],
    [
      "JSON false + kolon true",
      {
        notificationSettings: { marketingEmails: false },
        acceptsMarketingEmails: true,
      },
      false,
    ],
    [
      "anahtar yok + kolon true",
      { notificationSettings: null, acceptsMarketingEmails: true },
      true,
    ],
    [
      "anahtar yok (başka anahtar var) + kolon true",
      {
        notificationSettings: { orderUpdates: false },
        acceptsMarketingEmails: true,
      },
      true,
    ],
    [
      "anahtar yok + kolon false",
      { notificationSettings: null, acceptsMarketingEmails: false },
      false,
    ],
  ])("pazarlama push+zil kampanya kararı: %s", async (_name, row, expected) => {
    const { service, prisma, eventService } = makeService({
      promotion: [{ id: "u1", ...row }],
    });

    const send = service.sendNotification(
      "admin-1",
      dto({ channels: ["push"], mailingType: "marketing" }),
    );

    if (!expected) {
      await expect(send).rejects.toBeInstanceOf(BadRequestException);
      expect(eventService.emitAdminBroadcast).not.toHaveBeenCalled();
      return;
    }
    await send;
    expect(channelRows(prisma, "in_app")).toEqual(["u1"]);
    expect(channelRows(prisma, "push")).toEqual(["u1"]);
    expect(
      eventService.emitAdminBroadcast.mock.calls[0][0].pushUserIds,
    ).toEqual(["u1"]);
  });

  it("pazarlama: e-posta e-posta iznine uyar, push+zil kampanya tercihine uyar", async () => {
    const { service, prisma, eventService, newsletter } = makeService({
      promotion: ["u1"],
      consenting: ["u2"],
    });

    await service.sendNotification(
      "admin-1",
      dto({ channels: ["push", "email"], mailingType: "marketing" }),
    );

    expect(channelRows(prisma, "in_app")).toEqual(["u1"]);
    expect(channelRows(prisma, "push")).toEqual(["u1"]);
    expect(channelRows(prisma, "email")).toEqual(["u2"]);
    expect(newsletter.resolveMarketingUnsubscribeTokens).toHaveBeenCalledWith([
      "u2",
    ]);
    const emitted = eventService.emitAdminBroadcast.mock.calls[0][0];
    expect([...emitted.userIds].sort()).toEqual(["u1", "u2"]);
    expect(emitted.pushUserIds).toEqual(["u1"]);
    expect([...emitted.marketingUnsubscribeTokens.keys()]).toEqual(["u2"]);
  });

  it("pazarlama + yalnız e-posta: e-posta alıcısı olmayan kampanya-tercihli kullanıcıya zil yazılmaz", async () => {
    const { service, prisma } = makeService({
      promotion: ["u1", "u2"],
      consenting: ["u1"],
    });

    await service.sendNotification(
      "admin-1",
      dto({ channels: ["email"], mailingType: "marketing" }),
    );

    expect(channelRows(prisma, "email")).toEqual(["u1"]);
    expect(channelRows(prisma, "in_app")).toEqual(["u1"]);
  });

  it("pazarlama + tüm kullanıcılar: kitle filtresine kampanya tercihi eklenir", async () => {
    const { service, prisma } = makeService();

    await service.sendNotification(
      "admin-1",
      dto({
        channels: ["push"],
        targetType: "all",
        userIds: undefined,
        mailingType: "marketing",
      }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isBanned: false, ...PROMOTION_CANDIDATES },
      select: { id: true },
    });
  });

  it("pazarlama + segment: segment ölçütü korunur, kampanya tercihi eklenir", async () => {
    const { service, prisma } = makeService();

    await service.sendNotification(
      "admin-1",
      dto({
        channels: ["push"],
        targetType: "segment",
        userIds: undefined,
        segmentCriteria: { isSeller: true },
        mailingType: "marketing",
      }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isBanned: false, isSeller: true, ...PROMOTION_CANDIDATES },
      select: { id: true },
    });
  });

  it("pazarlama + e-posta kanalı: e-posta kitlesi e-posta iznine göre süzülür", async () => {
    const { service, prisma } = makeService();

    await service.sendNotification(
      "admin-1",
      dto({ channels: ["email"], mailingType: "marketing" }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["u1", "u2"] },
        isBanned: false,
        acceptsMarketingEmails: true,
      },
      select: { id: true },
    });
  });

  it("pazarlama kitlesinde alıcı yoksa hiçbir şey yazılmaz, anlamlı hata döner", async () => {
    const { service, prisma, eventService } = makeService({
      promotion: [],
      consenting: [],
    });

    const error = await service
      .sendNotification("admin-1", dto({ mailingType: "marketing" }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      i18nKey: "server.admin.notification.noMarketingConsentAudience",
    });
    expect(prisma.notificationLog.createMany).not.toHaveBeenCalled();
    expect(eventService.emitAdminBroadcast).not.toHaveBeenCalled();
  });

  it("duyuru (varsayılan): kimlik listesi aynen kullanılır, izin sorgusu yok", async () => {
    const { service, prisma, eventService } = makeService({ everyone: [] });

    await service.sendNotification("admin-1", dto());

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    const inApp = rows(prisma).filter((r: any) => r.channel === "in_app");
    expect(inApp.map((r: any) => r.userId)).toEqual(["u1", "u2"]);
    expect(eventService.emitAdminBroadcast.mock.calls[0][0].userIds).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("duyuru: kampanya tercihi kapalı kullanıcı da zil + push alır, push kitlesi daraltılmaz", async () => {
    const { service, prisma, eventService } = makeService({
      promotion: [], // kimsenin kampanya tercihi açık değil
      consenting: [],
    });

    await service.sendNotification(
      "admin-1",
      dto({ channels: ["push"], mailingType: "announcement" }),
    );

    expect(channelRows(prisma, "in_app")).toEqual(["u1", "u2"]);
    expect(channelRows(prisma, "push")).toEqual(["u1", "u2"]);
    expect(
      eventService.emitAdminBroadcast.mock.calls[0][0].pushUserIds,
    ).toBeUndefined();
  });

  it("duyuru + tüm kullanıcılar: izin kapısı EKLENMEZ", async () => {
    const { service, prisma } = makeService({
      everyone: ["u1", "u2"],
      promotion: ["u1", "u2"],
    });

    await service.sendNotification(
      "admin-1",
      dto({
        targetType: "all",
        userIds: undefined,
        mailingType: "announcement",
      }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isBanned: false },
      select: { id: true },
    });
  });

  it.each(["announcement", "marketing"] as const)(
    "tür (%s) her satıra ve push payload'ına yazılır; dışarıdan gelen değer ezilir",
    async (mailingType) => {
      const { service, prisma, eventService } = makeService({
        everyone: ["u1", "u2"],
        promotion: ["u1", "u2"],
      });

      await service.sendNotification(
        "admin-1",
        dto({ mailingType, data: { mailingType: "sahte", campaignId: "c1" } }),
      );

      for (const row of rows(prisma)) {
        expect(row.data.mailingType).toBe(mailingType);
        expect(row.data.campaignId).toBe("c1");
      }
      expect(eventService.emitAdminBroadcast.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ mailingType }),
      );
    },
  );

  it("tür verilmeyen eski çağıran duyuru olarak işaretlenir", async () => {
    const { service, eventService } = makeService();

    await service.sendNotification("admin-1", dto());

    expect(
      eventService.emitAdminBroadcast.mock.calls[0][0].data.mailingType,
    ).toBe("announcement");
  });
});
