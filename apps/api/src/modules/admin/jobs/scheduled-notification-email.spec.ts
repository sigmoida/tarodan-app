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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  it("satırı atomik sahiplenir; başka süreç aldıysa göndermez (çoklu worker)", async () => {
    const { scheduler, prisma, adminService } = makeScheduler(row());
    prisma.scheduledNotification.updateMany.mockResolvedValue({ count: 0 });

    await scheduler.runProcessScheduledNotifications();

    expect(prisma.scheduledNotification.updateMany).toHaveBeenCalledWith({
      where: { id: "sch-1", status: "pending" },
      data: { status: "processing" },
    });
    expect(adminService.sendNotification).not.toHaveBeenCalled();
  });

  it("saklanan data (hedef link) ve satır kimliği gönderime taşınır; 'sent' worker'a kalır", async () => {
    const { scheduler, prisma, adminService } = makeScheduler(
      row({ channels: ["push"], data: { link: "/listings/p1" } }),
    );

    await scheduler.runProcessScheduledNotifications();

    expect(adminService.sendNotification).toHaveBeenCalledWith(
      "admin-1",
      expect.objectContaining({
        data: { link: "/listings/p1" },
        scheduledNotificationId: "sch-1",
      }),
    );
    // İyimser "sent" yazılmaz: dağıtımı yapan worker sonucu yazar.
    expect(prisma.scheduledNotification.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "sent" }),
      }),
    );
  });

  it("gönderim başlatılamazsa satır 'failed' olur", async () => {
    const { scheduler, prisma, adminService } = makeScheduler(row());
    adminService.sendNotification.mockRejectedValue(new Error("x"));

    await scheduler.runProcessScheduledNotifications();

    expect(prisma.scheduledNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});
