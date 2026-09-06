import { Test } from "@nestjs/testing";
import { UserReportService } from "./user-report.service";
import { PrismaService } from "../../prisma";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { ReportStatus } from "./dto";

/**
 * Şikayet kapandığında şikayet eden haberdar edilir. Bu kapanmadan önce hiç
 * geri bildirim yoktu: kullanıcı şikayetini gönderiyor ve sonucunu asla
 * öğrenmiyordu.
 */
describe("UserReportService updateReportStatus → reporter notification", () => {
  let service: UserReportService;

  const existing = {
    id: "r1",
    reporterId: "u1",
    type: "product",
    targetId: "p1",
    reason: "spam",
    description: null,
    status: "pending",
    createdAt: new Date("2026-07-03T12:00:00Z"),
    resolvedAt: null,
    adminNote: null,
  };

  const prisma = {
    report: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const notifications = {
    createInAppNotification: jest.fn(),
    sendTemplateEmailToUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.report.findUnique.mockResolvedValue(existing);
    prisma.user.findUnique.mockResolvedValue({ displayName: "Ayşe" });
    notifications.createInAppNotification.mockResolvedValue(true);
    notifications.sendTemplateEmailToUser.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        UserReportService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();
    service = module.get(UserReportService);
  });

  const resolveWith = (status: ReportStatus, adminNote?: string) => {
    prisma.report.update.mockResolvedValue({
      ...existing,
      status,
      adminNote: adminNote ?? null,
      resolvedAt: new Date(),
    });
    return service.updateReportStatus("r1", "admin1", { status, adminNote });
  };

  it("notifies the reporter in-app and by email when the report is resolved", async () => {
    await resolveWith(ReportStatus.RESOLVED, "İlan yayından kaldırıldı.");

    expect(notifications.createInAppNotification).toHaveBeenCalledTimes(1);
    const [userId, type, data] =
      notifications.createInAppNotification.mock.calls[0];
    expect(userId).toBe("u1");
    expect(type).toBe(NotificationType.REPORT_RESOLVED);
    expect(data).toMatchObject({
      reportId: "r1",
      type: "product",
      status: "resolved",
      hasNote: "yes",
      note: "İlan yayından kaldırıldı.",
    });

    expect(notifications.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    const [emailUserId, templateKey, templateData] =
      notifications.sendTemplateEmailToUser.mock.calls[0];
    expect(emailUserId).toBe("u1");
    expect(templateKey).toBe("report-resolved");
    expect(templateData).toMatchObject({
      reporterName: "Ayşe",
      type: "product",
      reason: "spam",
      status: "resolved",
      adminNote: "İlan yayından kaldırıldı.",
    });
  });

  it("notifies on dismissal too — a rejected report is still a decision", async () => {
    await resolveWith(ReportStatus.DISMISSED);

    expect(notifications.createInAppNotification).toHaveBeenCalledTimes(1);
    const [, , data] = notifications.createInAppNotification.mock.calls[0];
    expect(data).toMatchObject({ status: "dismissed", hasNote: "no" });
  });

  it("stays quiet while the report is only under review", async () => {
    await resolveWith(ReportStatus.UNDER_REVIEW);

    expect(notifications.createInAppNotification).not.toHaveBeenCalled();
    expect(notifications.sendTemplateEmailToUser).not.toHaveBeenCalled();
  });

  it("still closes the report when notifying fails", async () => {
    notifications.createInAppNotification.mockRejectedValueOnce(
      new Error("boom"),
    );
    notifications.sendTemplateEmailToUser.mockRejectedValueOnce(
      new Error("smtp down"),
    );

    const result = await resolveWith(ReportStatus.RESOLVED);

    expect(result.status).toBe(ReportStatus.RESOLVED);
  });
});
