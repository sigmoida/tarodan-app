import { validate } from "class-validator";
import { AdminNotificationService } from "./admin-notification.service";
import {
  NotificationTargetType,
  SendNotificationDto as AdminSendNotificationDto,
} from "./dto/notifications-admin.dto";

/**
 * ADMIN_BROADCAST satırları link güvenlik kapısından geçer.
 *
 * Regresyon: sendNotification NotificationLog satırlarını DOĞRUDAN, ham
 * `dto.data` ile yazıyordu ve admin DTO'sunun `data` alanı doğrulanmıyordu —
 * kullanıcı DTO'sundaki SafeNotificationLinkData kapısının aksine. Böylece
 * `javascript:` ya da dış-site linki kalıcı yazılıp push payload'ına da
 * sızabiliyordu. Artık: (1) DTO sınırında aynı kapı, (2) serviste süzme —
 * güvensiz link satırı düşürmez, yalnız link alanı atılır.
 */
describe("AdminNotificationService — yayın linki güvenliği", () => {
  const makeService = () => {
    const prisma = {
      notificationLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const eventService = {
      emitAdminBroadcast: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminNotificationService(
      prisma as never,
      eventService as never,
      audit as never,
    );
    return { service, prisma, eventService };
  };

  const baseDto = (data: Record<string, any>) => ({
    title: "Duyuru",
    body: "Gövde",
    channels: ["push"],
    targetType: "user_ids" as const,
    userIds: ["user-1"],
    data,
  });

  const persistedRows = (prisma: any) =>
    prisma.notificationLog.createMany.mock.calls.flatMap(
      (call: any[]) => call[0].data,
    );

  it.each(["javascript:alert(1)", "//evil.example.com", "/olmayan-bir-sayfa"])(
    "güvensiz link düşürülür ama SATIR yazılır: %s",
    async (link) => {
      const { service, prisma, eventService } = makeService();

      await service.sendNotification(
        "admin-1",
        baseDto({ link, campaignId: "c1" }),
      );

      const rows = persistedRows(prisma);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        // Duyurunun kendisi ulaşır; yalnız güvensiz hedef atılır.
        expect(row.data.link).toBeUndefined();
        expect(row.data.campaignId).toBe("c1");
      }
      // Push kuyruğuna giden payload'a da ham link sızmaz.
      const emitted = eventService.emitAdminBroadcast.mock.calls[0][0];
      expect(emitted.data.link).toBeUndefined();
    },
  );

  it("güvenli site-içi link korunur", async () => {
    const { service, prisma, eventService } = makeService();

    await service.sendNotification("admin-1", baseDto({ link: "/listings" }));

    for (const row of persistedRows(prisma)) {
      expect(row.data.link).toBe("/listings");
    }
    expect(eventService.emitAdminBroadcast.mock.calls[0][0].data.link).toBe(
      "/listings",
    );
  });

  it("HTTPS dış link korunur", async () => {
    const { service, prisma } = makeService();

    await service.sendNotification(
      "admin-1",
      baseDto({ link: "https://tarodan.com.tr/duyuru" }),
    );

    for (const row of persistedRows(prisma)) {
      expect(row.data.link).toBe("https://tarodan.com.tr/duyuru");
    }
  });

  describe("DTO kapısı (SendNotificationDto.data)", () => {
    const makeDto = (data?: Record<string, any>) => {
      const dto = new AdminSendNotificationDto();
      dto.title = "Duyuru";
      dto.body = "Gövde";
      dto.channels = ["push"];
      dto.targetType = NotificationTargetType.ALL;
      dto.data = data;
      return dto;
    };

    it("güvensiz link DTO sınırında reddedilir", async () => {
      const errors = await validate(makeDto({ link: "javascript:alert(1)" }));
      expect(errors.map((e) => e.property)).toContain("data");
    });

    it("güvenli link ve linksiz data geçer", async () => {
      expect(await validate(makeDto({ link: "/listings" }))).toHaveLength(0);
      expect(await validate(makeDto({ campaignId: "c1" }))).toHaveLength(0);
      expect(await validate(makeDto())).toHaveLength(0);
    });
  });
});
