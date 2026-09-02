import { Test } from "@nestjs/testing";
import { UserReportService } from "./user-report.service";
import { PrismaService } from "../../prisma";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { ReportReason, ReportType } from "./dto";

describe("UserReportService createReport → admin notification", () => {
  let service: UserReportService;
  const prisma = {
    product: { findUnique: jest.fn().mockResolvedValue({ id: "p1" }) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ displayName: "Ayşe" }),
    },
    report: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "r1",
        type: "product",
        targetId: "p1",
        reason: "spam",
        description: null,
        status: "pending",
        createdAt: new Date(),
        resolvedAt: null,
        adminNote: null,
      }),
    },
  };
  const notifications = { notifyAllAdmins: jest.fn().mockResolvedValue(1) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UserReportService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();
    service = module.get(UserReportService);
  });

  const dto = {
    type: ReportType.PRODUCT,
    targetId: "p1",
    reason: ReportReason.SPAM,
  };

  it("fans the report out to admins with a deep link", async () => {
    await service.createReport("u1", dto);

    expect(notifications.notifyAllAdmins).toHaveBeenCalledTimes(1);
    const [type, data] = notifications.notifyAllAdmins.mock.calls[0];
    expect(type).toBe(NotificationType.USER_REPORTED_ADMIN);
    expect(data).toMatchObject({
      reportId: "r1",
      reporterId: "u1",
      reporterName: "Ayşe",
      type: "product",
      targetId: "p1",
      reason: "spam",
    });
    expect(data.adminLink).toContain("/accounts/reports");
  });

  it("still returns the report when the notification fails", async () => {
    notifications.notifyAllAdmins.mockRejectedValueOnce(new Error("boom"));
    const result = await service.createReport("u1", dto);
    expect(result.id).toBe("r1");
  });
});
