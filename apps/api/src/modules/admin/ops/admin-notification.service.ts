import { randomUUID } from "node:crypto";
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { EventService } from "../../events/event.service";
import { isSafeFreeLink } from "../../notification/helpers/notification-link-safety";
import { AdminAuditService } from "./admin-audit.service";
import {
  Prisma,
  type NotificationLog,
  type ScheduledNotification,
} from "@prisma/client";
import {
  NotificationHistoryQueryDto,
  ScheduledNotificationQueryDto,
} from "../dto";
import {
  paginate,
  paginateComputedRows,
  resolveOrderBy,
} from "../../../common/list";
import {
  errorMessage,
  errorStack,
} from "../../../common/helpers/error-message";
import { i18nMessage } from "../../i18n";
import { NewsletterService } from "../../marketing/newsletter.service";
import {
  audienceUserWhere,
  MARKETING_CONSENT_WHERE,
} from "./notification-audience";
import { sanitizeEmailHtml } from "../../../common/helpers/email-html-sanitizer";
import {
  buildBroadcastEmail,
  isMarketingMailing,
  newsletterUnsubscribeUrl,
} from "../../../common/helpers/broadcast-email";
import { DEFAULT_MAILING_TYPE, type MailingType } from "@tarodan/types";
import { MediaService, type UploadResult } from "../../media/media.service";
import { NOTIFICATION_IMAGE_UPLOAD } from "./notification-image-upload.constants";

/** Yayının hedef + e-posta alanları; anında ve zamanlanmış gönderim ortak kullanır. */
export interface AdminBroadcastInput {
  title: string;
  body: string;
  channels: string[];
  targetType: "all" | "segment" | "user_ids";
  userIds?: string[];
  segmentCriteria?: Record<string, any>;
  data?: Record<string, any>;
  emailSubject?: string;
  emailHtml?: string;
  mailingType?: MailingType;
  /**
   * Zamanlanmış gönderimden geliyorsa satırın kimliği: dağıtımı yapan worker
   * satırın durumunu (sent/failed) SONUÇTAN yazar.
   */
  scheduledNotificationId?: string;
}

export interface PreviewBroadcastEmailInput {
  title: string;
  body: string;
  emailSubject?: string;
  emailHtml?: string;
  mailingType?: MailingType;
}

export interface AudienceCountInput {
  targetType: "all" | "segment" | "user_ids";
  userIds?: string[];
  segmentCriteria?: Record<string, any>;
}

/**
 * Zamanlanmış satırı liste yanıtına çevirir: büyük HTML gövdesi tabloya
 * taşınmaz, yalnız "HTML e-postası var" bilgisi gider.
 */
function toScheduledListRow<T extends { emailHtml?: string | null }>(row: T) {
  const { emailHtml, ...rest } = row;
  return { ...rest, hasEmailHtml: Boolean(emailHtml) };
}

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
    private readonly newsletter: NewsletterService,
    private readonly media: MediaService,
  ) {}

  /**
   * Bildirim görseli yükler (`file` multipart alanı). Yalnız jpeg/png/webp,
   * en çok 5 MB; public URL döner — gönderim formu onu bildirime yazar.
   */
  async uploadImage(
    file: Express.Multer.File | undefined,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException(i18nMessage("server.admin.fileMissing"));
    }
    return this.media.upload(file, NOTIFICATION_IMAGE_UPLOAD);
  }

  /**
   * E-posta alanlarını ve duyuru türünü normalleştirir. Tür yoksa duyurudur
   * (eski çağıranlar için güvenli varsayılan); tür push ve zili de belirler.
   * HTML SUNUCUDA süzülür (istemciye güvenilmez); verilmişse ama süzülünce
   * boş kalıyorsa (yalnız script vb.) sessizce düz metne düşmek yerine istek
   * reddedilir.
   */
  private normalizeEmailContent(dto: {
    emailSubject?: string;
    emailHtml?: string;
    mailingType?: MailingType;
  }) {
    const rawHtml = dto.emailHtml?.trim();
    const emailHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : undefined;
    if (rawHtml && !emailHtml) {
      throw new BadRequestException(
        i18nMessage("server.admin.notification.emailHtmlEmpty"),
      );
    }
    return {
      emailSubject: dto.emailSubject?.trim() || undefined,
      emailHtml,
      mailingType: dto.mailingType ?? DEFAULT_MAILING_TYPE,
    };
  }

  /**
   * Önizleme: gönderimle AYNI üretici (`buildBroadcastEmail`) — süzülmüş,
   * iskeletli, pazarlamada çıkış linkli hâli döner.
   */
  previewBroadcastEmail(dto: PreviewBroadcastEmailInput) {
    const content = this.normalizeEmailContent(dto);
    return buildBroadcastEmail({
      title: dto.title,
      body: dto.body,
      emailSubject: content.emailSubject,
      emailHtml: content.emailHtml,
      to: "ornek@tarodan.com.tr",
      unsubscribeUrl: isMarketingMailing(content.mailingType)
        ? newsletterUnsubscribeUrl("onizleme")
        : undefined,
    });
  }

  /**
   * Kitle sayacı: `total` duyurunun, `marketing` pazarlama e-postasının
   * ulaşacağı kullanıcı sayısı (izin bayrağı açık olanlar). Abonelik
   * tablosundaki ayrı çıkış kayıtları sayıya dahil değildir; gönderimde
   * onlar da atlanır, yani gerçek sayı bundan biraz düşük olabilir.
   */
  async countAudience(dto: AudienceCountInput) {
    const where: Prisma.UserWhereInput =
      dto.targetType === "user_ids"
        ? { id: { in: dto.userIds ?? [] }, isBanned: false }
        : audienceUserWhere(dto.targetType, dto.segmentCriteria);
    const [total, marketing] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({
        where: { ...where, ...MARKETING_CONSENT_WHERE },
      }),
    ]);
    return { total, marketing };
  }

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
        { channel: { contains: trimmedSearch, mode: "insensitive" } },
        { status: { contains: trimmedSearch, mode: "insensitive" } },
        { type: { contains: trimmedSearch, mode: "insensitive" } },
        { errorMessage: { contains: trimmedSearch, mode: "insensitive" } },
        ...(matchingUserIds.length > 0
          ? [{ userId: { in: matchingUserIds } }]
          : []),
      ];
    }

    let users: Array<{ id: string; displayName: string; email: string }> = [];
    let usersLoaded = false;
    let result;
    if (query.sortBy === "user.displayName") {
      const allLogs = await this.prisma.notificationLog.findMany({ where });
      const allUserIds = [...new Set(allLogs.map((log) => log.userId))];
      users = await this.prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, displayName: true, email: true },
      });
      usersLoaded = true;
      const names = new Map(
        users.map((user) => [user.id, user.displayName || user.email]),
      );
      result = paginateComputedRows(allLogs, (log) => names.get(log.userId), {
        ...query,
        sortType: "text",
      });
    } else {
      const orderBy =
        resolveOrderBy<Prisma.NotificationLogOrderByWithRelationInput>(
          "NotificationLog",
          query,
          { defaultSort: { createdAt: "desc" } },
        );
      result = await paginate(
        this.prisma.notificationLog,
        { where, orderBy },
        query,
      );
    }
    const logs = result.data as NotificationLog[];

    // Get user info for logs
    const userIds = [...new Set(logs.map((l) => l.userId))];
    if (!usersLoaded) {
      users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, email: true },
      });
    }
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
   * Yayının alıcıları. Pazarlama türünde (S1 — Apple 4.5.4, İYS) kitle
   * pazarlama iznine göre süzülür: izni olmayan kullanıcıya ne push ne zil
   * satırı ne e-posta gider. Duyuru türünde davranış değişmez — `user_ids`
   * listesi olduğu gibi kullanılır.
   */
  private async resolveTargetUserIds(
    dto: AdminBroadcastInput,
    isMarketing: boolean,
  ): Promise<string[]> {
    if (dto.targetType === "user_ids") {
      const userIds = dto.userIds || [];
      if (!isMarketing || userIds.length === 0) return userIds;
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: userIds },
          isBanned: false,
          ...MARKETING_CONSENT_WHERE,
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    if (
      dto.targetType === "all" ||
      (dto.targetType === "segment" && dto.segmentCriteria)
    ) {
      const users = await this.prisma.user.findMany({
        where: {
          ...audienceUserWhere(dto.targetType, dto.segmentCriteria),
          ...(isMarketing ? MARKETING_CONSENT_WHERE : {}),
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    return [];
  }

  /**
   * Send notification to users
   */
  async sendNotification(adminId: string, dto: AdminBroadcastInput) {
    let targetUserIds: string[] = [];
    const emailContent = this.normalizeEmailContent(dto);
    const sendsEmail = dto.channels.includes("email");
    const isMarketing = isMarketingMailing(emailContent.mailingType);

    // ADMIN_BROADCAST serbest link taşır (harita: free("link")). DTO kapısına
    // (SafeNotificationLinkData) ek olarak burada da süzülür: bu servis iç
    // çağrılarla DTO doğrulamasından geçmeden de kullanılabiliyor. Güvensiz
    // link (javascript:, dış http, site dışı yol...) SATIRI düşürmez — yalnız
    // link alanı atılır, duyurunun kendisi linksiz ulaşır.
    const data: Record<string, any> = { ...(dto.data ?? {}) };
    if (
      data.link !== undefined &&
      (typeof data.link !== "string" || !isSafeFreeLink(data.link))
    ) {
      this.logger.warn(
        "admin_broadcast: güvensiz bildirim linki düşürüldü (satır korunuyor)",
      );
      delete data.link;
    }
    // Tür her satırda ve push payload'ında taşınır: push kuyruğu pazarlama
    // duyurusunu ALWAYS_SEND dışında değerlendirir (preferenceTypeFor),
    // istemci de duyuruyu kampanyadan ayırabilir. Dışarıdan gelen değer ezilir.
    data.mailingType = emailContent.mailingType;

    try {
      targetUserIds = await this.resolveTargetUserIds(dto, isMarketing);

      if (targetUserIds.length === 0) {
        throw new BadRequestException(
          i18nMessage(
            isMarketing
              ? "server.admin.notification.noMarketingConsentAudience"
              : "server.admin.notification.targetUserNotFound",
          ),
        );
      }

      // Pazarlama e-postası: yalnız izni açık, çıkmamış üyeler (+ çıkış token'ı).
      // Duyuruda harita yok → herkese gider (eski davranış).
      const marketingTokens =
        sendsEmail && isMarketing
          ? await this.newsletter.resolveMarketingUnsubscribeTokens(
              targetUserIds,
            )
          : undefined;
      // Geçmişte "gönderildi" satırı yalnız gerçekten e-posta gidenlere yazılır.
      const emailRecipientCount = sendsEmail
        ? (marketingTokens?.size ?? targetUserIds.length)
        : 0;
      // Teslim izleme: push/e-posta satırları bu kimlikle eşlenir ve durumları
      // worker SONUCUNDAN yazılır (eskiden kuyruğa yazılır yazılmaz "sent").
      const broadcastId = randomUUID();
      const trackedRowData = { ...data, broadcastId };
      // Geçmiş listesinde "HTML e-postası" rozeti için e-posta satırlarının işareti.
      const emailRowData = {
        ...trackedRowData,
        ...(emailContent.emailHtml && { hasHtmlEmail: true }),
      };

      // Create notification logs - always include in_app for user visibility
      const notificationLogs: Array<{
        userId: string;
        channel: string;
        type: string;
        title: string;
        body: string;
        data: Prisma.InputJsonValue;
        status: string;
        sentAt?: Date;
        errorMessage?: string;
      }> = [];

      for (const userId of targetUserIds) {
        // Always create an in_app entry so users see it in their notification center
        notificationLogs.push({
          userId,
          channel: "in_app",
          type: "admin_broadcast",
          title: dto.title,
          body: dto.body,
          data,
          status: "sent",
          sentAt: new Date(),
        });

        // Create entries for other selected channels (for tracking/audit)
        for (const channel of dto.channels) {
          if (channel === "in_app") continue;
          if (channel === "email") {
            if (marketingTokens && !marketingTokens.has(userId)) continue;
            notificationLogs.push({
              userId,
              channel,
              type: "admin_broadcast",
              title: dto.title,
              body: dto.body,
              data: emailRowData,
              status: "pending",
            });
            continue;
          }
          if (channel !== "push") {
            // Yayın dağıtımı yalnız push + e-posta gönderir (SMS altyapısı
            // yok). Bu satır asla gönderilmeyecek: "pending"de kalmasın.
            notificationLogs.push({
              userId,
              channel,
              type: "admin_broadcast",
              title: dto.title,
              body: dto.body,
              data: trackedRowData,
              status: "failed",
              errorMessage: "Channel not supported for broadcasts",
            });
            continue;
          }
          notificationLogs.push({
            userId,
            channel,
            type: "admin_broadcast",
            title: dto.title,
            body: dto.body,
            data: trackedRowData,
            status: "pending",
          });
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

      // Dağıtım worker'da: tek `send-broadcast` işi kuyruğa yazılır. Push ve
      // e-posta satırları "pending" kalır; kişi başı işler sonuçlandıkça
      // "sent"/"failed" olur (iyimser toplu "sent" güncellemesi kaldırıldı).
      await this.eventService.emitAdminBroadcast({
        userIds: targetUserIds,
        title: dto.title,
        body: dto.body,
        channels: dto.channels,
        // Süzülmüş data: push payload'ına da ham link sızmasın.
        data,
        emailSubject: emailContent.emailSubject,
        emailHtml: emailContent.emailHtml,
        marketingUnsubscribeTokens: marketingTokens,
        broadcastId,
        scheduledNotificationId: dto.scheduledNotificationId,
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
          mailingType: emailContent.mailingType,
          hasHtmlEmail: Boolean(emailContent.emailHtml),
          emailRecipientCount,
        },
      );

      this.logger.log(
        `Admin ${adminId} sent notification to ${targetUserIds.length} users via ${dto.channels.join(", ")}`,
      );

      return {
        success: true,
        targetCount: targetUserIds.length,
        channels: dto.channels,
        emailRecipientCount,
        message: `Bildirim ${targetUserIds.length} kullanıcıya gönderildi`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send notification: ${errorMessage(error)}`,
        errorStack(error),
      );
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        i18nMessage("server.admin.notification.sendFailed"),
      );
    }
  }

  /**
   * Schedule a notification
   */
  async scheduleNotification(
    adminId: string,
    dto: AdminBroadcastInput & { scheduledFor: string },
  ) {
    const scheduledDate = new Date(dto.scheduledFor);
    if (scheduledDate <= new Date()) {
      throw new BadRequestException(
        i18nMessage("server.admin.notification.scheduleInFuture"),
      );
    }
    // Süzülmüş HTML saklanır: zamanlanmış gönderim, anındakiyle aynı içeriği
    // taşır ve gönderim anında bir daha ham girdiye güvenilmez.
    const emailContent = this.normalizeEmailContent(dto);

    const scheduled = await this.prisma.scheduledNotification.create({
      data: {
        title: dto.title,
        body: dto.body,
        emailSubject: emailContent.emailSubject,
        emailHtml: emailContent.emailHtml,
        mailingType: emailContent.mailingType,
        channels: dto.channels,
        targetType: dto.targetType,
        targetData:
          dto.targetType === "user_ids"
            ? (dto.userIds as any)
            : (dto.segmentCriteria as any) || Prisma.JsonNull,
        // Hedef link vb. — gönderim anında aynı süzgeçten (sendNotification)
        // yeniden geçer. Eskiden saklanmıyordu: zamanlanmış push linksiz gidiyordu.
        data:
          dto.data && Object.keys(dto.data).length > 0
            ? (dto.data as Prisma.InputJsonObject)
            : Prisma.JsonNull,
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
      toScheduledListRow(scheduled),
    );

    this.logger.log(
      `Notification scheduled for ${dto.scheduledFor} by admin ${adminId}`,
    );

    return toScheduledListRow(scheduled);
  }

  /**
   * Get scheduled notifications
   */
  async getScheduledNotifications(query: ScheduledNotificationQueryDto = {}) {
    const where: Prisma.ScheduledNotificationWhereInput = {};

    if (query?.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { body: { contains: search, mode: "insensitive" } },
        { targetType: { contains: search, mode: "insensitive" } },
        { status: { contains: search, mode: "insensitive" } },
        { channels: { has: search.toLowerCase() } },
      ];
    }

    if (query.sortBy === "channels") {
      const rows = await this.prisma.scheduledNotification.findMany({ where });
      const sorted = paginateComputedRows(
        rows,
        (notification) => notification.channels.join(", "),
        { ...query, sortType: "text" },
      );
      return { ...sorted, data: sorted.data.map(toScheduledListRow) };
    }

    const orderBy =
      resolveOrderBy<Prisma.ScheduledNotificationOrderByWithRelationInput>(
        "ScheduledNotification",
        query,
        { defaultSort: { scheduledFor: "asc" } },
      );
    const page = await paginate(
      this.prisma.scheduledNotification,
      { where, orderBy },
      query,
    );
    return {
      ...page,
      data: (page.data as ScheduledNotification[]).map(toScheduledListRow),
    };
  }

  /**
   * Cancel scheduled notification
   */
  async cancelScheduledNotification(adminId: string, notificationId: string) {
    const existing = await this.prisma.scheduledNotification.findUnique({
      where: { id: notificationId },
    });

    if (!existing) {
      throw new NotFoundException(
        i18nMessage("server.admin.notification.scheduledNotFound"),
      );
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
      toScheduledListRow(existing),
      toScheduledListRow(updated),
    );

    return { success: true };
  }
}
