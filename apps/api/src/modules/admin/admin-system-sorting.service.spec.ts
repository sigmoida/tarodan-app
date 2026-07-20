/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminAuditService } from "./admin-audit.service";
import { AdminLogsService } from "./admin-logs.service";
import { AdminNotificationService } from "./admin-notification.service";
import { AdminSellerApplicationService } from "./admin-seller-application.service";
import { AdminUserService } from "./admin-user.service";
import { SupportService } from "../support/support.service";
import { UserReportService } from "../user-report/user-report.service";

function createDelegate(extra: Record<string, jest.Mock> = {}) {
  return {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    ...extra,
  };
}

describe("admin system and user list sorting", () => {
  it("preserves the user default and keeps null logins last for explicit sorting", async () => {
    const user = createDelegate();
    const service = new AdminUserService(
      { user } as any,
      {} as any,
      undefined as any,
    );

    await service.getUsers({ page: 2, limit: 5 });
    expect(user.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [
          { lastLoginAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: 5,
        take: 5,
      }),
    );

    await service.getUsers({ sortBy: "lastLoginAt", sortOrder: "asc" });
    expect(user.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: { lastLoginAt: { sort: "asc", nulls: "last" } },
      }),
    );
  });

  it("sorts seller applications by a user scalar", async () => {
    const user = createDelegate();
    const service = new AdminSellerApplicationService(
      { user } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.getSellerApplications({
      page: 3,
      limit: 10,
      sortBy: "companyName",
      sortOrder: "asc",
    });

    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { companyName: "asc" },
        skip: 20,
        take: 10,
      }),
    );
  });

  it("sorts audit logs and preserves their fifty-row default", async () => {
    const auditLog = createDelegate();
    const service = new AdminAuditService({ auditLog } as any);

    await service.getAuditLogs({ sortBy: "action", sortOrder: "asc" });

    expect(auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { action: "asc" },
        skip: 0,
        take: 50,
      }),
    );
  });

  it("sorts error, security, and email logs by scalar fields", async () => {
    const errorLog = createDelegate({
      groupBy: jest.fn().mockResolvedValue([]),
    });
    const securityLog = createDelegate({
      groupBy: jest.fn().mockResolvedValue([]),
    });
    const emailLog = createDelegate({
      groupBy: jest.fn().mockResolvedValue([]),
    });
    const service = new AdminLogsService(
      { errorLog, securityLog, emailLog } as any,
      {} as any,
    );

    await service.getErrorLogs({ sortBy: "severity", sortOrder: "asc" });
    await service.getSecurityLogs({
      sortBy: "eventType",
      sortOrder: "desc",
    });
    await service.getEmailLogs({ sortBy: "to", sortOrder: "asc" });

    expect(errorLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { severity: "asc" } }),
    );
    expect(securityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { eventType: "desc" } }),
    );
    expect(emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { to: "asc" } }),
    );
  });

  it("sorts notification history and scheduled notifications", async () => {
    const notificationLog = createDelegate();
    const scheduledNotification = createDelegate();
    const service = new AdminNotificationService(
      {
        notificationLog,
        scheduledNotification,
        user: { findMany: jest.fn().mockResolvedValue([]) },
      } as any,
      {} as any,
      {} as any,
    );

    await service.getNotificationHistory({
      sortBy: "status",
      sortOrder: "asc",
    });
    await service.getScheduledNotifications({
      sortBy: "scheduledFor",
      sortOrder: "desc",
    });

    expect(notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { status: "asc" } }),
    );
    expect(scheduledNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { scheduledFor: "desc" } }),
    );
  });

  it("sorts support tickets while using standardized pagination", async () => {
    const supportTicket = createDelegate();
    const service = new SupportService(
      { supportTicket } as any,
      {} as any,
      {} as any,
    );

    await service.getAllTickets({
      page: 2,
      limit: 8,
      sortBy: "priority",
      sortOrder: "asc",
    });

    expect(supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { priority: "asc" },
        skip: 8,
        take: 8,
      }),
    );
  });

  it("sorts user reports by type", async () => {
    const report = createDelegate();
    const service = new UserReportService({ report } as any);

    await service.getAllReports({ sortBy: "type", sortOrder: "desc" });

    expect(report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { type: "desc" },
        skip: 0,
        take: 20,
      }),
    );
  });
});
