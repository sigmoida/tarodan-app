import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AuditLogQueryDto } from './dto';
import { Prisma } from '@prisma/client';

/**
 * Admin audit log yazımı + sorgulama — tüm Admin* alt-servislerinin ortak
 * bağımlılığı. AdminService'ten birebir taşındı; davranış aynı (hata durumunda
 * ana işlemi asla bozmaz, hassas alanları redakte eder). getAuditLogs,
 * AdminService'in AUDIT LOGS bölümünden birebir taşındı.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createAuditLog(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    try {
      // Resolve adminUserId: @CurrentUser('id') returns User.id, but AuditLog expects AdminUser.id
      const adminUser = await this.prisma.adminUser.findFirst({
        where: { userId: adminUserId, isActive: true },
        select: { id: true },
      });
      if (!adminUser) {
        this.logger.warn(`Admin user not found for userId ${adminUserId}, skipping audit log`);
        return Promise.resolve();
      }
      const resolvedAdminUserId = adminUser.id;

      // Fields that must never appear in audit logs
      const SENSITIVE_KEYS = new Set([
        'password', 'passwordHash', 'passwordConfirm', 'newPassword', 'oldPassword', 'currentPassword',
        'token', 'accessToken', 'refreshToken', 'resetToken', 'verifyToken', 'confirmToken', 'idToken',
        'secret', 'apiKey', 'apiSecret', 'clientSecret', 'signingKey',
        'creditCard', 'cardNumber', 'cvv', 'cvc', 'pin', 'otp',
      ]);

      const redactSensitive = (obj: any): any => {
        if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(redactSensitive);
        return Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [
            k,
            SENSITIVE_KEYS.has(k) ? '[GİZLİ]' : redactSensitive(v),
          ]),
        );
      };

      // Serialize values to ensure they can be stored as JSON
      const serializeValue = (value: any) => {
        if (value === null || value === undefined) {
          return null;
        }
        try {
          // Use JSON.parse/stringify to handle Date, Decimal, etc.
          const serialized = JSON.parse(JSON.stringify(value, (key, val) => {
            // Convert Date to ISO string
            if (val instanceof Date) {
              return val.toISOString();
            }
            // Convert Decimal to number (Prisma Decimal has toNumber method)
            if (val && typeof val === 'object' && typeof val.toNumber === 'function') {
              return val.toNumber();
            }
            return val;
          }));
          return redactSensitive(serialized);
        } catch (e) {
          // Fallback: convert to string if serialization fails
          this.logger.warn(`Failed to serialize audit log value for ${entityType}:${entityId}`, e);
          return String(value);
        }
      };

      return await this.prisma.auditLog.create({
        data: {
          adminUserId: resolvedAdminUserId,
          action,
          entityType,
          entityId,
          oldValue: serializeValue(oldValue),
          newValue: serializeValue(newValue),
        },
      });
    } catch (error) {
      // Log error but don't fail the main operation
      this.logger.error(`Failed to create audit log for ${entityType}:${entityId}`, error);
      // Return a promise that resolves to avoid breaking the caller
      return Promise.resolve();
    }
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(query: AuditLogQueryDto) {
    const { action, adminId, fromDate, toDate, page = 1, limit = 50 } = query;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (adminId) {
      where.adminUserId = adminId;
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

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          adminUser: { select: { id: true, user: { select: { email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: logs.map((log) => ({
        ...log,
        admin: log.adminUser
          ? { id: log.adminUser.id, email: log.adminUser.user.email }
          : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
