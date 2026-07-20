import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { EventService } from "../events/event.service";
import { AdminAuditService } from "./admin-audit.service";
import { Prisma } from "@prisma/client";
import {
  NotificationHistoryQueryDto,
  ScheduledNotificationQueryDto,
} from "./dto";
import { paginate, resolveOrderBy } from "../../common/list";

/**
 * Bildirim admin operasyonları (geçmiş, toplu gönderim, zamanlama) —
 * AdminService'in NOTIFICATION MANAGEMENT bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly audit: AdminAuditService,
  ) {}

  // ==================== NOTIFICATION MANAGEMENT ====================

  /**
   * Get notification history
   */
  async getNotificationHistory(query: NotificationHistoryQueryDto) {
    const where: Prisma.NotificationLogWhereInput = {};

    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;
    if (query.type) where.type = query.type;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    // Başlık/içerik veya alıcı kullanıcı ad/e-posta araması (case-insensitive).
    // userId NotificationLog'da düz alan (ilişki yok) → eşleşen kullanıcıları
    // ayrı sorgulayıp id'lerini OR'a ekliyoruz.
    const trimmedSearch = query.search?.trim();
    if (trimmedSearch) {
      const matchingUsers = await this.prisma.user.findMany({
        where: {
          OR: [
            { displayName: { contains: trimmedSearch, mode: "insensitive" } },
            { email: { contains: trimmedSearch, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      const matchingUserIds = matchingUsers.map((u) => u.id);
      where.OR = [
        { title: { contains: trimmedSearch, mode: "insensitive" } },
        { body: { contains: trimmedSearch, mode: "insensitive" } },
        ...(matchingUserIds.length > 0
          ? [{ userId: { in: matchingUserIds } }]
          : []),
      ];
    }

    const orderBy =
      resolveOrderBy<Prisma.NotificationLogOrderByWithRelationInput>(
        "NotificationLog",
        query,
        { defaultSort: { createdAt: "desc" } },
      );
    const result = await paginate(
      this.prisma.notificationLog,
      {
        where,
        orderBy,
      },
      query,
    );
    const logs = result.data;

    // Get user info for logs
    const userIds = [...new Set(logs.map((l) => l.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      ...result,
      data: logs.map((l) => ({
        ...l,
        user: userMap.get(l.userId) || null,
      })),
    };
  }

  /**
   * Send notification to users
   */
  async sendNotification(
    adminId: string,
    dto: {
      title: string;
      body: string;
      channels: string[];
      targetType: "all" | "segment" | "user_ids";
      userIds?: string[];
      segmentCriteria?: Record<string, any>;
      data?: Record<string, any>;
    },
  ) {
    let targetUserIds: string[] = [];

    try {
      if (dto.targetType === "user_ids") {
        targetUserIds = dto.userIds || [];
      } else if (dto.targetType === "all") {
        const users = await this.prisma.user.findMany({
          where: { isBanned: false },
          select: { id: true },
        });
        targetUserIds = users.map((u) => u.id);
      } else if (dto.targetType === "segment" && dto.segmentCriteria) {
        const where: Prisma.UserWhereInput = { isBanned: false };
        if (dto.segmentCriteria.isSeller !== undefined) {
          where.isSeller = dto.segmentCriteria.isSeller;
        }
        if (dto.segmentCriteria.membershipTier) {
          where.membership = {
            tier: { type: dto.segmentCriteria.membershipTier as any },
          };
        }
        const users = await this.prisma.user.findMany({
          where,
          select: { id: true },
        });
        targetUserIds = users.map((u) => u.id);
      }

      if (targetUserIds.length === 0) {
        throw new BadRequestException("Hedef kullanıcı bulunamadı");
      }

      // Create notification logs - always include in_app for user visibility
      const notificationLogs: Array<{
        userId: string;
        channel: string;
        type: string;
        title: string;
        body: string;
        data: any;
        status: string;
        sentAt?: Date;
      }> = [];

      for (const userId of targetUserIds) {
        // Always create an in_app entry so users see it in their notification center
        notificationLogs.push({
          userId,
          channel: "in_app",
          type: "admin_broadcast",
          title: dto.title,
          body: dto.body,
          data: dto.data || ({} as any),
          status: "sent",
          sentAt: new Date(),
        });

        // Create entries for other selected channels (for tracking/audit)
        for (const channel of dto.channels) {
          if (channel !== "in_app") {
            notificationLogs.push({
              userId,
              channel,
              type: "admin_broadcast",
              title: dto.title,
              body: dto.body,
              data: dto.data || ({} as any),
              status: "pending",
            });
          }
        }
      }

      // Chunk the createMany operation to avoid parameter limit issues in PostgreSQL
      const chunkSize = 5000;
      for (let i = 0; i < notificationLogs.length; i += chunkSize) {
        const chunk = notificationLogs.slice(i, i + chunkSize);
        await this.prisma.notificationLog.createMany({
          data: chunk,
        });
      }

      // Trigger broadcast events (handles queues for Email/Push and creates In-App logs)
      // Note: emitAdminBroadcast handles its own In-App log creation to ensure consistency,
      // but we created logs above for consistency with the audit log and historical tracking.
      await this.eventService.emitAdminBroadcast({
        userIds: targetUserIds,
        title: dto.title,
        body: dto.body,
        channels: dto.channels,
        data: dto.data,
      });

      // Update the logs we created to 'sent' status since we just emitted them
      await this.prisma.notificationLog.updateMany({
        where: {
          userId: { in: targetUserIds },
          channel: { in: dto.channels },
          title: dto.title,
          body: dto.body,
          status: "pending",
        },
        data: {
          status: "sent",
          sentAt: new Date(),
        },
      });

      // Log the action
      await this.audit.createAuditLog(
        adminId,
        "notification_send",
        "NotificationLog",
        "bulk",
        null,
        {
          targetCount: targetUserIds.length,
          channels: dto.channels,
          title: dto.title,
          targetType: dto.targetType,
        },
      );

      this.logger.log(
        `Admin ${adminId} sent notification to ${targetUserIds.length} users via ${dto.channels.join(", ")}`,
      );

      return {
        success: true,
        targetCount: targetUserIds.length,
        channels: dto.channels,
        message: `Bildirim ${targetUserIds.length} kullanıcıya gönderildi`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send notification: ${error.message}`,
        error.stack,
      );
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("Bildirim gönderilemedi");
    }
  }

  /**
   * Schedule a notification
   */
  async scheduleNotification(
    adminId: string,
    dto: {
      title: string;
      body: string;
      channels: string[];
      targetType: "all" | "segment" | "user_ids";
      userIds?: string[];
      segmentCriteria?: Record<string, any>;
      scheduledFor: string;
    },
  ) {
    const scheduledDate = new Date(dto.scheduledFor);
    if (scheduledDate <= new Date()) {
      throw new BadRequestException("Zamanlama tarihi gelecekte olmalıdır");
    }

    const scheduled = await this.prisma.scheduledNotification.create({
      data: {
        title: dto.title,
        body: dto.body,
        channels: dto.channels,
        targetType: dto.targetType,
        targetData:
          dto.targetType === "user_ids"
            ? (dto.userIds as any)
            : (dto.segmentCriteria as any) || Prisma.JsonNull,
        scheduledFor: scheduledDate,
        createdBy: adminId,
        status: "pending",
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "notification_schedule",
      "ScheduledNotification",
      scheduled.id,
      null,
      scheduled,
    );

    this.logger.log(
      `Notification scheduled for ${dto.scheduledFor} by admin ${adminId}`,
    );

    return scheduled;
  }

  /**
   * Get scheduled notifications
   */
  async getScheduledNotifications(query: ScheduledNotificationQueryDto = {}) {
    const where: Prisma.ScheduledNotificationWhereInput = {};

    if (query?.status) {
      where.status = query.status;
    }

    const orderBy =
      resolveOrderBy<Prisma.ScheduledNotificationOrderByWithRelationInput>(
        "ScheduledNotification",
        query,
        { defaultSort: { scheduledFor: "asc" } },
      );
    return paginate(
      this.prisma.scheduledNotification,
      { where, orderBy },
      query,
    );
  }

  /**
   * Cancel scheduled notification
   */
  async cancelScheduledNotification(adminId: string, notificationId: string) {
    const existing = await this.prisma.scheduledNotification.findUnique({
      where: { id: notificationId },
    });

    if (!existing) {
      throw new NotFoundException("Zamanlanmış bildirim bulunamadı");
    }

    if (existing.status !== "pending") {
      throw new BadRequestException(
        "Sadece bekleyen bildirimler iptal edilebilir",
      );
    }

    const updated = await this.prisma.scheduledNotification.update({
      where: { id: notificationId },
      data: { status: "cancelled" },
    });

    await this.audit.createAuditLog(
      adminId,
      "notification_cancel",
      "ScheduledNotification",
      notificationId,
      existing,
      updated,
    );

    return { success: true };
  }
}
