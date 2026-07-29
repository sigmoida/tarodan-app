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

  it("sorts the general user list by total buyer and seller orders", async () => {
    const user = createDelegate({
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          { id: "user-a", _count: { buyerOrders: 1, sellerOrders: 1 } },
          { id: "user-b", _count: { buyerOrders: 0, sellerOrders: 5 } },
        ])
        .mockResolvedValueOnce([{ id: "user-b" }, { id: "user-a" }]),
    });
    const order = {
      groupBy: jest.fn().mockResolvedValue([]),
    };
    const service = new AdminUserService(
      { user, order } as any,
      {} as any,
      undefined as any,
    );

    const result = await service.getUsers({
      sortBy: "ordersCount",
      sortOrder: "desc",
      page: 1,
      limit: 20,
    });

    expect(user.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ["user-b", "user-a"] } },
      }),
    );
    expect(result.meta).toEqual({
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it("sorts seller performance by seller order count", async () => {
    const user = createDelegate();
    const service = new AdminUserService(
      { user } as any,
      {} as any,
      undefined as any,
    );

    await service.getUsers({
      isSeller: true,
      sortBy: "_count.sellerOrders",
      sortOrder: "asc",
    });

    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { sellerOrders: { _count: "asc" } },
      }),
    );
  });

  it("sorts seller performance by the displayed product count accessor", async () => {
    const user = createDelegate();
    const service = new AdminUserService(
      { user } as any,
      {} as any,
      undefined as any,
    );

    await service.getUsers({
      isSeller: true,
      sortBy: "_count.products",
      sortOrder: "desc",
    });

    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { products: { _count: "desc" } },
      }),
    );
  });

  it("sorts corporate applications by a scalar", async () => {
    const corporateApplication = createDelegate();
    const service = new AdminSellerApplicationService(
      { corporateApplication } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.getSellerApplications({
      page: 3,
      limit: 10,
      sortBy: "companyTitle",
      sortOrder: "asc",
    });

    expect(corporateApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { companyTitle: "asc" },
        skip: 20,
        take: 10,
      }),
    );
  });

  it("sorts and searches audit logs with the standard twenty-row default", async () => {
    const auditLog = createDelegate();
    const service = new AdminAuditService({ auditLog } as any);

    await service.getAuditLogs({
      search: "admin@example.com",
      sortBy: "action",
      sortOrder: "asc",
    });

    expect(auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { action: "asc" },
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              adminUser: {
                user: {
                  email: {
                    contains: "admin@example.com",
                    mode: "insensitive",
                  },
                },
              },
            },
          ]),
        }),
        skip: 0,
        take: 20,
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

  it("sorts the displayed HTTP status stored in error metadata", async () => {
    const errorLog = createDelegate({
      findMany: jest.fn().mockResolvedValue([
        { id: "server", metadata: { status: 500 } },
        { id: "client", metadata: { status: 400 } },
        { id: "empty", metadata: null },
      ]),
      groupBy: jest.fn().mockResolvedValue([]),
    });
    const service = new AdminLogsService({ errorLog } as any, {} as any);

    const result = await service.getErrorLogs({
      sortBy: "metadata.status",
      sortOrder: "asc",
      sortType: "number",
    });

    expect(result.data.map((row) => row.id)).toEqual([
      "client",
      "server",
      "empty",
    ]);
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

  it("searches and sorts scheduled notification channels before pagination", async () => {
    const scheduledNotification = createDelegate({
      findMany: jest.fn().mockResolvedValue([
        { id: "sms", channels: ["sms"] },
        { id: "email", channels: ["email"] },
      ]),
    });
    const service = new AdminNotificationService(
      { scheduledNotification } as any,
      {} as any,
      {} as any,
    );

    const result = await service.getScheduledNotifications({
      search: "email",
      sortBy: "channels",
      sortOrder: "asc",
    });

    expect(scheduledNotification.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ channels: { has: "email" } }]),
      }),
    });
    expect(result.data.map((row) => row.id)).toEqual(["email", "sms"]);
  });

  it("sorts notification history by the displayed user name", async () => {
    const notificationLog = createDelegate({
      findMany: jest.fn().mockResolvedValue([
        { id: "n1", userId: "u1" },
        { id: "n2", userId: "u2" },
      ]),
    });
    const user = {
      findMany: jest.fn().mockResolvedValue([
        { id: "u1", displayName: "Zeynep", email: "z@example.com" },
        { id: "u2", displayName: "Ali", email: "a@example.com" },
      ]),
    };
    const service = new AdminNotificationService(
      { notificationLog, user } as any,
      {} as any,
      {} as any,
    );

    const result = await service.getNotificationHistory({
      sortBy: "user.displayName",
      sortOrder: "asc",
    });

    expect(result.data.map((row) => row.id)).toEqual(["n2", "n1"]);
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

  it("sorts support tickets by the displayed creator name", async () => {
    const supportTicket = createDelegate();
    const service = new SupportService(
      { supportTicket } as any,
      {} as any,
      {} as any,
    );

    await service.getAllTickets({
      sortBy: "creatorName",
      sortOrder: "asc",
    });

    expect(supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { creator: { displayName: "asc" } },
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
