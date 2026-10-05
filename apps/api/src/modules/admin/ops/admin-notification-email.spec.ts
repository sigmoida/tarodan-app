import { BadRequestException } from "@nestjs/common";
import { AdminNotificationService } from "./admin-notification.service";

/**
 * Toplu bildirimde HTML e-posta + duyuru/pazarlama türü.
 *
 * Kurallar: HTML sunucuda süzülür; varsayılan tür duyurudur (eski davranış:
 * herkese); pazarlama yalnız izinli üyelere gider; zamanlanmış gönderim aynı
 * içeriği taşır; HTML göndermeyen çağıran (mobil/eski) etkilenmez.
 */
describe("AdminNotificationService — HTML e-posta", () => {
  const makeService = () => {
    const prisma = {
      notificationLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      scheduledNotification: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "sch-1",
          ...data,
        })),
      },
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const eventService = {
      emitAdminBroadcast: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const newsletter = {
      resolveMarketingUnsubscribeTokens: jest
        .fn()
        .mockResolvedValue(new Map([["u1", "tok-1"]])),
    };
    const service = new AdminNotificationService(
      prisma as never,
      eventService as never,
      audit as never,
      newsletter as never,
    );
    return { service, prisma, eventService, newsletter, audit };
  };

  const dto = (extra: Record<string, unknown> = {}) => ({
    title: "Duyuru",
    body: "Gövde",
    channels: ["email"],
    targetType: "user_ids" as const,
    userIds: ["u1", "u2"],
    ...extra,
  });

  const emailRows = (prisma: any) =>
    prisma.notificationLog.createMany.mock.calls
      .flatMap((call: any[]) => call[0].data)
      .filter((row: any) => row.channel === "email");

  describe("süzme", () => {
    it("HTML sunucuda süzülüp kuyruğa o hâliyle verilir", async () => {
      const { service, eventService } = makeService();

      await service.sendNotification(
        "admin-1",
        dto({
          emailSubject: "Konu",
          emailHtml: '<p onclick="x()">Selam</p><script>alert(1)</script>',
        }),
      );

      const emitted = eventService.emitAdminBroadcast.mock.calls[0][0];
      expect(emitted.emailHtml).toBe("<p>Selam</p>");
      expect(emitted.emailSubject).toBe("Konu");
    });

    it("yalnız aktif içerikten oluşan HTML reddedilir (sessizce düz metne düşmez)", async () => {
      const { service, eventService } = makeService();

      await expect(
        service.sendNotification(
          "admin-1",
          dto({ emailHtml: "<script>alert(1)</script>" }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(eventService.emitAdminBroadcast).not.toHaveBeenCalled();
    });
  });

  describe("duyuru (varsayılan) — davranış değişmez", () => {
    it("tür verilmezse duyurudur: herkese gider, çıkış haritası yok", async () => {
      const { service, eventService, newsletter } = makeService();

      const result = await service.sendNotification(
        "admin-1",
        dto({ emailHtml: "<p>x</p>" }),
      );

      expect(newsletter.resolveMarketingUnsubscribeTokens).not.toHaveBeenCalled();
      const emitted = eventService.emitAdminBroadcast.mock.calls[0][0];
      expect(emitted.marketingUnsubscribeTokens).toBeUndefined();
      expect(emitted.userIds).toEqual(["u1", "u2"]);
      expect(result.emailRecipientCount).toBe(2);
    });

    it("HTML göndermeyen çağıran (eski yol) aynen çalışır", async () => {
      const { service, prisma, eventService } = makeService();

      await service.sendNotification("admin-1", dto());

      const emitted = eventService.emitAdminBroadcast.mock.calls[0][0];
      expect(emitted.emailHtml).toBeUndefined();
      expect(emitted.emailSubject).toBeUndefined();
      expect(emailRows(prisma)).toHaveLength(2);
    });

    it("yalnız push kanalında e-posta üretimi/süzgeci devreye girmez", async () => {
      const { service, newsletter, eventService } = makeService();

      await service.sendNotification(
        "admin-1",
        dto({ channels: ["push"], mailingType: "marketing" }),
      );

      expect(newsletter.resolveMarketingUnsubscribeTokens).not.toHaveBeenCalled();
      expect(
        eventService.emitAdminBroadcast.mock.calls[0][0]
          .marketingUnsubscribeTokens,
      ).toBeUndefined();
    });
  });

  describe("pazarlama", () => {
    it("yalnız izinli üyeler alıcıdır; e-posta geçmiş satırı yalnız onlara yazılır", async () => {
      const { service, prisma, eventService, newsletter } = makeService();

      const result = await service.sendNotification(
        "admin-1",
        dto({ mailingType: "marketing", emailHtml: "<p>x</p>" }),
      );

      expect(newsletter.resolveMarketingUnsubscribeTokens).toHaveBeenCalledWith([
        "u1",
        "u2",
      ]);
      const emitted = eventService.emitAdminBroadcast.mock.calls[0][0];
      expect([...emitted.marketingUnsubscribeTokens.keys()]).toEqual(["u1"]);

      const rows = emailRows(prisma);
      expect(rows.map((row: any) => row.userId)).toEqual(["u1"]);
      expect(rows[0].data).toEqual(
        expect.objectContaining({
          mailingType: "marketing",
          hasHtmlEmail: true,
        }),
      );
      expect(result.emailRecipientCount).toBe(1);
    });

    it("push satırları pazarlama süzgecinden etkilenmez", async () => {
      const { service, prisma } = makeService();

      await service.sendNotification(
        "admin-1",
        dto({ channels: ["push", "email"], mailingType: "marketing" }),
      );

      const pushRows = prisma.notificationLog.createMany.mock.calls
        .flatMap((call: any[]) => call[0].data)
        .filter((row: any) => row.channel === "push");
      expect(pushRows.map((row: any) => row.userId)).toEqual(["u1", "u2"]);
    });
  });

  describe("zamanlanmış gönderim", () => {
    const future = () => new Date(Date.now() + 3_600_000).toISOString();

    it("süzülmüş HTML, konu ve tür satıra yazılır; liste yanıtında gövde yok", async () => {
      const { service, prisma } = makeService();

      const result = await service.scheduleNotification("admin-1", {
        ...dto({
          emailSubject: "Konu",
          emailHtml: '<p>Selam</p><script>alert(1)</script>',
          mailingType: "marketing",
        }),
        scheduledFor: future(),
      });

      const created = prisma.scheduledNotification.create.mock.calls[0][0].data;
      expect(created.emailHtml).toBe("<p>Selam</p>");
      expect(created.emailSubject).toBe("Konu");
      expect(created.mailingType).toBe("marketing");
      expect(result).not.toHaveProperty("emailHtml");
      expect(result.hasEmailHtml).toBe(true);
    });

    it("HTML yoksa tür varsayılan duyuru, rozet kapalı", async () => {
      const { service, prisma } = makeService();

      const result = await service.scheduleNotification("admin-1", {
        ...dto(),
        scheduledFor: future(),
      });

      const created = prisma.scheduledNotification.create.mock.calls[0][0].data;
      expect(created.mailingType).toBe("announcement");
      expect(created.emailHtml).toBeUndefined();
      expect(result.hasEmailHtml).toBe(false);
    });
  });

  describe("önizleme", () => {
    it("gönderimle aynı üreticiyi kullanır: süzülmüş + iskeletli", () => {
      const { service } = makeService();

      const preview = service.previewBroadcastEmail({
        title: "Başlık",
        body: "Gövde",
        emailSubject: "Konu",
        emailHtml: '<h1>Merhaba</h1><script>alert(1)</script>',
      });

      expect(preview.subject).toBe("Konu");
      expect(preview.html).toContain("<h1>Merhaba</h1>");
      expect(preview.html).not.toContain("<script");
      expect(preview.html).toContain("destek@tarodan.com.tr");
      expect(preview.html).not.toContain("abonelikten çıkabilirsiniz");
    });

    it("pazarlamada çıkış linki önizlemede de görünür", () => {
      const { service } = makeService();

      const preview = service.previewBroadcastEmail({
        title: "Başlık",
        body: "Gövde",
        emailHtml: "<p>x</p>",
        mailingType: "marketing",
      });

      expect(preview.html).toContain("abonelikten çıkabilirsiniz");
    });
  });

  describe("kitle sayacı", () => {
    it("toplam ve pazarlama-izinli sayıyı ayrı döner", async () => {
      const { service, prisma } = makeService();
      prisma.user.count
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(45);

      const result = await service.countAudience({ targetType: "all" });

      expect(result).toEqual({ total: 120, marketing: 45 });
      expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
        where: { isBanned: false },
      });
      expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
        where: { isBanned: false, acceptsMarketingEmails: true },
      });
    });

    it("segment ölçütleri gönderimle aynı filtreden geçer", async () => {
      const { service, prisma } = makeService();

      await service.countAudience({
        targetType: "segment",
        segmentCriteria: { isSeller: true },
      });

      expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
        where: { isBanned: false, isSeller: true },
      });
    });
  });
});
