import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AuditLogQueryDto } from "../dto";
import { Prisma } from "@prisma/client";
import { paginate, resolveOrderBy } from "../../../common/list";

/**
 * Admin audit log yazımı + sorgulama — tüm Admin* alt-servislerinin ortak
 * bağımlılığı. Kritik para/politika işlemleri createRequiredAuditLog ile
 * fail-closed çalışır; düşük riskli işlemler createAuditLog ile eski best-effort
 * davranışını korur. Hassas alanlar her iki yolda da redakte edilir.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createRequiredAuditLog(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    return this.writeAuditLog(
      adminUserId,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
    );
  }

  async createAuditLog(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    try {
      return await this.writeAuditLog(
        adminUserId,
        action,
        entityType,
        entityId,
        oldValue,
        newValue,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create audit log for ${entityType}:${entityId}`,
        error,
      );
      return Promise.resolve();
    }
  }

  private async writeAuditLog(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    const adminUser = await this.prisma.adminUser.findFirst({
      where: { userId: adminUserId, isActive: true },
      select: { id: true },
    });
    if (!adminUser) {
      throw new Error(`Active admin user not found for userId ${adminUserId}`);
    }

    const sensitiveKeys = new Set([
      "password",
      "passwordHash",
      "passwordConfirm",
      "newPassword",
      "oldPassword",
      "currentPassword",
      "token",
      "accessToken",
      "refreshToken",
      "resetToken",
      "verifyToken",
      "confirmToken",
      "idToken",
      "secret",
      "apiKey",
      "apiSecret",
      "clientSecret",
      "signingKey",
      "creditCard",
      "cardNumber",
      "cvv",
      "cvc",
      "pin",
      "otp",
    ]);

    const redactSensitive = (obj: any): any => {
      if (obj === null || obj === undefined || typeof obj !== "object") {
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(redactSensitive);
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          key,
          sensitiveKeys.has(key) ? "[GİZLİ]" : redactSensitive(value),
        ]),
      );
    };

    const serializeValue = (value: any) => {
      if (value === null || value === undefined) return null;
      try {
        const serialized = JSON.parse(
          JSON.stringify(value, (_key, val) => {
            if (val instanceof Date) return val.toISOString();
            if (
              val &&
              typeof val === "object" &&
              typeof val.toNumber === "function"
            ) {
              return val.toNumber();
            }
            return val;
          }),
        );
        return redactSensitive(serialized);
      } catch (error) {
        this.logger.warn(
          `Failed to serialize audit log value for ${entityType}:${entityId}`,
          error,
        );
        return String(value);
      }
    };

    return this.prisma.auditLog.create({
      data: {
        adminUserId: adminUser.id,
        action,
        entityType,
        entityId,
        oldValue: serializeValue(oldValue),
        newValue: serializeValue(newValue),
      },
    });
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(query: AuditLogQueryDto) {
    const { action, adminId, entityType, fromDate, toDate, search } = query;

    const where: Prisma.AuditLogWhereInput = {};

    if (entityType) {
      where.entityType = entityType;
    }

    if (action) {
      where.action = action;
    }

    if (adminId) {
      where.adminUserId = adminId;
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { entityType: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
        {
          adminUser: {
            user: { email: { contains: search, mode: "insensitive" } },
          },
        },
      ];
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const orderBy = resolveOrderBy<Prisma.AuditLogOrderByWithRelationInput>(
      "AuditLog",
      query,
      {
        defaultSort: { createdAt: "desc" },
        // The admin's email lives two relations deep (AuditLog → adminUser → user).
        sortMap: {
          "admin.email": (direction) => ({
            adminUser: { user: { email: direction } },
          }),
        },
      },
    );
    const result = await paginate(
      this.prisma.auditLog,
      {
        where,
        include: {
          adminUser: {
            select: { id: true, user: { select: { email: true } } },
          },
        },
        orderBy,
      },
      { ...query, limit: query.limit ?? 20 },
    );

    return {
      ...result,
      data: result.data.map((log) => ({
        ...log,
        admin: log.adminUser
          ? { id: log.adminUser.id, email: log.adminUser.user.email }
          : null,
      })),
    };
  }
}
