import { BadRequestException } from "@nestjs/common";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import {
  AdminNotificationService,
  normalizeBroadcastChannels,
} from "./admin-notification.service";
import { AdminSendNotificationDto } from "../dto/admin-notification.dto";
import { ScheduledNotificationScheduler } from "../jobs/scheduled-notification.scheduler";

/**
 * "Uygulama içi (zil)" açık bir kanal.
 *
 * Regresyon: yalnız e-posta seçilen yayın da her alıcıya zil satırı
 * yazıyordu; admin formu bunu göstermiyordu. Artık zil satırı yalnız kanal
 * seçiliyse yazılır — `inApp` göndermeyen eski çağıranlar ve kolondan önceki
 * zamanlanmış satırlar için varsayılan yine "yaz"dır.
 */
describe("AdminNotificationService — uygulama içi (zil) kanalı", () => {
  const makeService = () => {
    const prisma = {
      notificationLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      scheduledNotification: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: "sch-1",
            ...data,
          }),
        ),
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
      {} as never,
      {} as never,
    );
    return { service, prisma, eventService };
  };

  const dto = (extra: Record<string, unknown> = {}) => ({
    title: "Duyuru",
    body: "Gövde",
    channels: ["email"],
    targetType: "user_ids" as const,
    userIds: ["user-1"],
    emailSubject: "Konu",
    emailHtml: "<p>Selam</p>",
    ...extra,
  });

  const rowChannels = (prisma: ReturnType<typeof makeService>["prisma"]) =>
    (
      prisma.notificationLog.createMany.mock.calls as Array<
        [{ data: Array<{ channel: string }> }]
      >
    ).flatMap(([arg]) => arg.data.map((row) => row.channel));

  describe("normalizeBroadcastChannels — zilin tek kuralı", () => {
    it("inApp verilmezse true (eski çağıranlar)", () => {
      expect(normalizeBroadcastChannels({ channels: ["email"] }).inApp).toBe(
        true,
      );
      expect(normalizeBroadcastChannels({ channels: ["push"] }).inApp).toBe(
        true,
      );
    });

    it('çelişki: inApp false, channels "in_app" içeriyor → inApp kazanır', () => {
      expect(
        normalizeBroadcastChannels({
          channels: ["email", "in_app"],
          inApp: false,
        }),
      ).toEqual({ channels: ["email"], inApp: false, fanOut: true });
    });

    it('"in_app" teslim kanallarından ayıklanır', () => {
      expect(
        normalizeBroadcastChannels({ channels: ["in_app"], inApp: true }),
      ).toEqual({ channels: [], inApp: true, fanOut: false });
    });

    it("zil kapalı ve teslim kanalı yoksa reddedilir", () => {
      expect(() =>
        normalizeBroadcastChannels({ channels: ["in_app"], inApp: false }),
      ).toThrow(BadRequestException);
    });
  });

  it("yalnız e-posta (inApp: false): zil satırı YAZILMAZ", async () => {
    const { service, prisma } = makeService();

    await service.sendNotification("admin-1", dto({ inApp: false }));

    expect(rowChannels(prisma)).toEqual(["email"]);
  });

  it("eski çağıran (inApp yok): yalnız e-postada da zil satırı yazılır", async () => {
    const { service, prisma } = makeService();

    await service.sendNotification("admin-1", dto());

    expect(rowChannels(prisma).sort()).toEqual(["email", "in_app"]);
  });

  it("yalnız zil: zil satırı yazılır, push/e-posta satırı yok", async () => {
    const { service, prisma, eventService } = makeService();

    await service.sendNotification(
      "admin-1",
      dto({ channels: ["in_app"], inApp: true }),
    );

    expect(rowChannels(prisma)).toEqual(["in_app"]);
    // Teslim edilecek push/e-posta yok: dağıtım işi kuyruğa YAZILMAZ.
    expect(eventService.emitAdminBroadcast).not.toHaveBeenCalled();
    expect(prisma.scheduledNotification.updateMany).not.toHaveBeenCalled();
  });

  it("zamanlanmış yalnız zil: satır worker beklenmeden 'sent' olur (ulaşılan = alıcı)", async () => {
    const { service, prisma, eventService } = makeService();

    await service.sendNotification(
      "admin-1",
      dto({
        channels: [],
        inApp: true,
        userIds: ["user-1", "user-2"],
        scheduledNotificationId: "sch-9",
      }),
    );

    expect(eventService.emitAdminBroadcast).not.toHaveBeenCalled();
    expect(prisma.scheduledNotification.updateMany).toHaveBeenCalledWith({
      where: { id: "sch-9", status: "processing" },
      data: expect.objectContaining({ status: "sent", sentCount: 2 }),
    });
  });

  it('push/e-posta varsa dağıtım işi kuyruğa gider, "in_app" iş verisine girmez', async () => {
    const { service, eventService } = makeService();

    await service.sendNotification(
      "admin-1",
      dto({ channels: ["email", "in_app"] }),
    );

    expect(eventService.emitAdminBroadcast).toHaveBeenCalledTimes(1);
    expect(eventService.emitAdminBroadcast.mock.calls[0][0].channels).toEqual([
      "email",
    ]);
  });

  it("hiçbir kanal teslim etmiyorsa reddedilir", async () => {
    const { service, prisma } = makeService();

    await expect(
      service.sendNotification("admin-1", dto({ channels: [], inApp: false })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notificationLog.createMany).not.toHaveBeenCalled();
  });

  it("zamanlama zil seçimini saklar; boş kanal zamanlanamaz", async () => {
    const { service, prisma } = makeService();
    const scheduledFor = new Date(Date.now() + 3_600_000).toISOString();

    await service.scheduleNotification("admin-1", {
      ...dto({ inApp: false }),
      scheduledFor,
    });
    expect(
      prisma.scheduledNotification.create.mock.calls[0][0].data.inApp,
    ).toBe(false);

    await service.scheduleNotification("admin-1", { ...dto(), scheduledFor });
    expect(
      prisma.scheduledNotification.create.mock.calls[1][0].data.inApp,
    ).toBe(true);

    await expect(
      service.scheduleNotification("admin-1", {
        ...dto({ channels: [], inApp: false }),
        scheduledFor,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("DTO: inApp boolean olmalı", async () => {
    const make = (inApp: unknown) =>
      plainToInstance(AdminSendNotificationDto, {
        title: "t",
        body: "b",
        channels: ["email"],
        targetType: "all",
        inApp,
      });
    expect(await validate(make(false))).toHaveLength(0);
    expect(await validate(make(undefined))).toHaveLength(0);
    expect((await validate(make("no"))).map((e) => e.property)).toContain(
      "inApp",
    );
  });

  it("zamanlayıcı satırdaki inApp'i gönderime taşır", async () => {
    const prisma = {
      scheduledNotification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "sch-1",
            title: "Duyuru",
            body: "Gövde",
            channels: ["email"],
            inApp: false,
            targetType: "all",
            targetData: null,
            createdBy: "admin-1",
            emailSubject: null,
            emailHtml: null,
            mailingType: "announcement",
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationLog: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

    await scheduler.runProcessScheduledNotifications();

    expect(adminService.sendNotification.mock.calls[0][1].inApp).toBe(false);
  });
});
