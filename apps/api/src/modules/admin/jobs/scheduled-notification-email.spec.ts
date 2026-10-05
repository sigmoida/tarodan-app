import { ScheduledNotificationScheduler } from "./scheduled-notification.scheduler";

/**
 * Zamanlanmış gönderim, zamanlanırken saklanan e-posta içeriğini ve türünü
 * gönderim anında aynen taşımalı; kitle filtresi anlık gönderimle aynı olmalı.
 */
describe("ScheduledNotificationScheduler — e-posta içeriği", () => {
  const makeScheduler = (row: Record<string, unknown>) => {
    const prisma = {
      scheduledNotification: {
        findMany: jest.fn().mockResolvedValue([row]),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: "u1" }, { id: "u2" }]),
      },
    };
    const adminService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new ScheduledNotificationScheduler(
      prisma as never,
      adminService as never,
      {} as never,
    );
    return { scheduler, prisma, adminService };
  };

  const row = (extra: Record<string, unknown> = {}) => ({
    id: "sch-1",
    title: "Duyuru",
    body: "Gövde",
    channels: ["email"],
    targetType: "all",
    targetData: null,
    createdBy: "admin-1",
    emailSubject: "Konu",
    emailHtml: "<p>Selam</p>",
    mailingType: "marketing",
    ...extra,
  });

  it("konu, HTML ve türü sendNotification'a taşır", async () => {
    const { scheduler, adminService } = makeScheduler(row());

    await scheduler.runProcessScheduledNotifications();

    expect(adminService.sendNotification).toHaveBeenCalledWith(
      "admin-1",
      expect.objectContaining({
        emailSubject: "Konu",
        emailHtml: "<p>Selam</p>",
        mailingType: "marketing",
        userIds: ["u1", "u2"],
      }),
    );
  });

  it("eski satır (e-posta alanı NULL): düz metin yolu, duyuru türü", async () => {
    const { scheduler, adminService } = makeScheduler(
      row({ emailSubject: null, emailHtml: null, mailingType: "announcement" }),
    );

    await scheduler.runProcessScheduledNotifications();

    const dto = adminService.sendNotification.mock.calls[0][1];
    expect(dto.emailHtml).toBeUndefined();
    expect(dto.emailSubject).toBeUndefined();
    expect(dto.mailingType).toBe("announcement");
  });

  it("segment hedefi anlık gönderimle aynı kullanıcı filtresini kullanır", async () => {
    const { scheduler, prisma } = makeScheduler(
      row({ targetType: "segment", targetData: { isSeller: true } }),
    );

    await scheduler.runProcessScheduledNotifications();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isBanned: false, isSeller: true },
      }),
    );
  });
});
