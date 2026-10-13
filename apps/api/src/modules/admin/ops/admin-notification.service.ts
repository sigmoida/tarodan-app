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
  PROMOTION_PREFERENCE_WHERE,
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
   * (e-posta izni açık olanlar), `promotion` pazarlama push + zil satırının
   * (kampanya bildirim tercihi açık olanlar) ulaşacağı kullanıcı sayısı. Abonelik
   * tablosundaki ayrı çıkış kayıtları sayıya dahil değildir; gönderimde
   * onlar da atlanır, yani gerçek sayı bundan biraz düşük olabilir.
   */
  async countAudience(dto: AudienceCountInput) {
    const where: Prisma.UserWhereInput =
      dto.targetType === "user_ids"
        ? { id: { in: dto.userIds ?? [] }, isBanned: false }
        : audienceUserWhere(dto.targetType, dto.segmentCriteria);
    const [total, marketing, promotion] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({
        where: { ...where, ...MARKETING_CONSENT_WHERE },
      }),
      this.prisma.user.count({
        where: { ...where, ...PROMOTION_PREFERENCE_WHERE },
      }),
    ]);
    return { total, marketing, promotion };
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
   * Hedefin süzülmemiş kullanıcı filtresi (yasaklılar hariç); `user_ids`
   * için açık kimlik listesi, `all`/`segment` için kitle filtresi. Çözülemeyen
   * hedef (segmentsiz `segment`) için `null`.
   */
  private baseAudienceWhere(
    dto: AdminBroadcastInput,
  ): Prisma.UserWhereInput | null {
    if (dto.targetType === "user_ids") {
      return { id: { in: dto.userIds ?? [] }, isBanned: false };
    }
    if (
      dto.targetType === "all" ||
      (dto.targetType === "segment" && dto.segmentCriteria)
    ) {
      return audienceUserWhere(dto.targetType, dto.segmentCriteria);
    }
    return null;
  }

  private async userIdsWhere(where: Prisma.UserWhereInput): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * Yayının alıcıları, kanala göre. Duyuru türünde (işlemsel/güvenlik) herkes
   * her kanalda alıcıdır; `user_ids` listesi olduğu gibi kullanılır.
   *
   * Pazarlama türünde (S1 — Apple 4.5.4, İYS) iki ayrı kapı vardır:
   *  - push + zil satırı: kullanıcının kampanya (PROMOTION) bildirim tercihi
   *    (`PROMOTION_PREFERENCE_WHERE`),
   *  - e-posta: e-posta pazarlama izni (`MARKETING_CONSENT_WHERE`).
   * İkisi de açık olmayan kullanıcı o kanaldan almaz. Yalnız e-posta kanalı
   * seçildiyse zil satırı da yalnız e-posta alıcılarına yazılır (kitle
   * genişlemez).
   */
  private async resolveAudience(
    dto: AdminBroadcastInput,
    isMarketing: boolean,
  ): Promise<{ all: string[]; pushInApp: string[]; email: string[] }> {
    const base = this.baseAudienceWhere(dto);
    if (!base) return { all: [], pushInApp: [], email: [] };

    if (!isMarketing) {
      const ids =
        dto.targetType === "user_ids"
          ? (dto.userIds ?? [])
          : await this.userIdsWhere(base);
      return { all: ids, pushInApp: ids, email: ids };
    }

    const sendsEmail = dto.channels.includes("email");
    const emailOnly = dto.channels.every((c) => c === "email");
    const [promotion, consent] = await Promise.all([
      this.userIdsWhere({ ...base, ...PROMOTION_PREFERENCE_WHERE }),
      sendsEmail
        ? this.userIdsWhere({ ...base, ...MARKETING_CONSENT_WHERE })
        : Promise.resolve([] as string[]),
    ]);
    const consenting = new Set(consent);
    const pushInApp = emailOnly
      ? promotion.filter((id) => consenting.has(id))
      : promotion;
    return {
      all: [...new Set([...pushInApp, ...consent])],
      pushInApp,
      email: consent,
    };
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
      const audience = await this.resolveAudience(dto, isMarketing);
      targetUserIds = audience.all;
      const pushInAppIds = new Set(audience.pushInApp);

      if (targetUserIds.length === 0) {
        throw new BadRequestException(
          i18nMessage(
            isMarketing
              ? "server.admin.notification.noMarketingConsentAudience"
              : "server.admin.notification.targetUserNotFound",
          ),
        );
      }

      // Pazarlama e-postası: yalnız e-posta izni açık, çıkmamış üyeler (+ çıkış
      // token'ı). Duyuruda harita yok → herkese gider (eski davranış).
      const marketingTokens =
        sendsEmail && isMarketing
          ? await this.newsletter.resolveMarketingUnsubscribeTokens(
              audience.email,
            )
          : undefined;
      // Geçmişte "gönderildi" satırı yalnız gerçekten e-posta gidenlere yazılır.
      const emailRecipientCount = sendsEmail
        ? (marketingTokens?.size ?? targetUserIds.length)
        : 0;
      // Geçmiş listesinde "HTML e-postası" rozeti için e-posta satırlarının işareti.
      const emailRowData = {
        ...data,
        ...(emailContent.emailHtml && { hasHtmlEmail: true }),
      };

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
        // (pazarlamada yalnız kampanya tercihi açık kullanıcıya).
        if (pushInAppIds.has(userId)) {
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
        }

        // Create entries for other selected channels (for tracking/audit)
        for (const channel of dto.channels) {
          if (channel === "in_app") continue;
          if (channel === "email") {
            if (marketingTokens && !marketingTokens.has(userId)) continue;
            notificationLogs.push({
              userId,
              channel,
              type: "admin_broadcast",
              // Başlık push ile aynı kalır: aşağıdaki "sent" güncellemesi
              // satırları (title, body) ile eşler.
              title: dto.title,
              body: dto.body,
              data: emailRowData,
              status: "pending",
            });
            continue;
          }
          // Push vb. kanallar zil ile aynı kitleye gider.
          if (!pushInAppIds.has(userId)) continue;
          notificationLogs.push({
            userId,
            channel,
            type: "admin_broadcast",
            title: dto.title,
            body: dto.body,
            data,
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

      // Trigger broadcast events (handles queues for Email/Push and creates In-App logs)
      // Note: emitAdminBroadcast handles its own In-App log creation to ensure consistency,
      // but we created logs above for consistency with the audit log and historical tracking.
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
        // Pazarlamada push yalnız kampanya tercihi açık kullanıcılara gider.
        pushUserIds: isMarketing ? audience.pushInApp : undefined,
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
