import { BadRequestException } from "@nestjs/common";
import { AdminNotificationService } from "./admin-notification.service";

/**
 * Duyuru türü kitleyi TÜM kanallarda belirler (S1 — Apple 4.5.4, İYS).
 *
 * Regresyon: tür yalnız e-postayı süzüyordu; "Pazarlama" türündeki duyuru
 * izni olmayan kullanıcıya da zil satırı yazıyor ve push kuyruğuna giriyordu
 * (admin_broadcast push'u ALWAYS_SEND'de). Artık pazarlama türü kitleyi
 * pazarlama iznine göre süzer; duyuru (işlemsel/güvenlik) türü aynen herkese.
 */
describe("AdminNotificationService — pazarlama türü kitlesi", () => {
  const makeService = (consenting: string[] = ["u1"]) => {
    const prisma = {
      notificationLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue(consenting.map((id) => ({ id }))),
      },
    };
    const eventService = {
      emitAdminBroadcast: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const newsletter = {
      resolveMarketingUnsubscribeTokens: jest.fn().mockResolvedValue(new Map()),
    };
    const service = new AdminNotificationService(
      prisma as never,
      eventService as never,
      audit as never,
      newsletter as never,
      {} as never, // media — yükleme bu spec'in konusu değil
    );
    return { service, prisma, eventService };
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

  it("pazarlama: zil satırı ve push yalnız izinli kullanıcıya", async () => {
    const { service, prisma, eventService } = makeService(["u1"]);

    await service.sendNotification(
      "admin-1",
      dto({ mailingType: "marketing" }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["u1", "u2"] },
        isBanned: false,
        acceptsMarketingEmails: true,
      },
      select: { id: true },
    });
    const inApp = rows(prisma).filter((r: any) => r.channel === "in_app");
    expect(inApp.map((r: any) => r.userId)).toEqual(["u1"]);
    expect(eventService.emitAdminBroadcast.mock.calls[0][0].userIds).toEqual([
      "u1",
    ]);
  });

  it("pazarlama + tüm kullanıcılar: kitle filtresine izin kapısı eklenir", async () => {
    const { service, prisma } = makeService(["u1"]);

    await service.sendNotification(
      "admin-1",
      dto({ targetType: "all", userIds: undefined, mailingType: "marketing" }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isBanned: false, acceptsMarketingEmails: true },
      select: { id: true },
    });
  });

  it("pazarlama + segment: segment ölçütü korunur, izin kapısı eklenir", async () => {
    const { service, prisma } = makeService(["u1"]);

    await service.sendNotification(
      "admin-1",
      dto({
        targetType: "segment",
        userIds: undefined,
        segmentCriteria: { isSeller: true },
        mailingType: "marketing",
      }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isBanned: false, isSeller: true, acceptsMarketingEmails: true },
      select: { id: true },
    });
  });

  it("pazarlama kitlesinde izinli kimse yoksa hiçbir şey yazılmaz, anlamlı hata döner", async () => {
    const { service, prisma, eventService } = makeService([]);

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
    const { service, prisma, eventService } = makeService([]);

    await service.sendNotification("admin-1", dto());

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    const inApp = rows(prisma).filter((r: any) => r.channel === "in_app");
    expect(inApp.map((r: any) => r.userId)).toEqual(["u1", "u2"]);
    expect(eventService.emitAdminBroadcast.mock.calls[0][0].userIds).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("duyuru + tüm kullanıcılar: izin kapısı EKLENMEZ", async () => {
    const { service, prisma } = makeService(["u1", "u2"]);

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
      const { service, prisma, eventService } = makeService(["u1", "u2"]);

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
