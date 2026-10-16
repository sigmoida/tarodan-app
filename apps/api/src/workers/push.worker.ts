/**
 * Push Notification Worker
 * Processes push notifications via Expo Push API
 *
 * Gönderim, ölü token temizliği ve makbuz (receipt) planlaması TEK çekirdekten
 * geçer: `ExpoPushProvider.sendMessages`. Bu worker yalnız kuyruk işlerini
 * (kişi başı bildirim, yönetici yayını dağıtımı, makbuz kontrolü) yönetir.
 */
import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
} from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { defaultLocale, isLocale, type Locale } from "@tarodan/i18n";
import { PrismaService } from "../prisma";
import {
  preferenceTypeFor,
  resolveSettings,
  shouldDeliver,
} from "../modules/notification/helpers/notification-preferences";
import {
  isKnownNotificationType,
  resolveWebNotificationLink,
  withDefaultAudience,
} from "../modules/notification/helpers/notification-link";
import {
  ExpoPushProvider,
  type ExpoPushMessage,
  type PushSendOutcome,
} from "../modules/notification/providers/expo-push.provider";
import {
  PUSH_RECEIPT_JOB,
  isExpoPushToken,
  pushChannelFor,
  type PushReceiptJobData,
} from "../modules/notification/helpers/push-delivery";
import {
  renderQueuedNotificationText,
  type QueuedNotificationCopy,
} from "../modules/notification/helpers/notification-event-copy";
import { markBroadcastLogRows } from "../modules/notification/helpers/broadcast-delivery";
import {
  ADMIN_BROADCAST_JOB,
  EventService,
  type AdminBroadcastJobData,
} from "../modules/events/event.service";

export interface PushJobData {
  userId: string;
  pushTokens?: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: "default" | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
}

/**
 * Notification types for order flow
 */
export type OrderNotificationType =
  | "order_created"
  | "payment_confirmed"
  | "payment_received"
  | "order_shipped"
  | "order_delivered"
  | "order_completed";

export interface PushNotificationJobData {
  userId: string;
  /**
   * Varsayılan dilde (tr) düz metin. `copy` varsa worker metni ALICININ
   * dilinde katalogdan render eder; bu alanlar yalnız eski işler (deploy
   * anında kuyrukta kalanlar) ve yönetici yayını içindir.
   */
  title?: string;
  body?: string;
  copy?: QueuedNotificationCopy;
  data?: {
    type: OrderNotificationType | string;
    orderId?: string;
    orderNumber?: string;
    [key: string]: any;
  };
  /** Yönetici yayını: push teslim izleme satırını sonuçtan günceller. */
  broadcastId?: string;
}

/** Zil kaydının sonucu — mükerrerde push da GİTMEZ. */
type InAppSaveResult = "created" | "duplicate";

@Processor("push")
export class PushWorker {
  private readonly logger = new Logger(PushWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushProvider,
    private readonly events: EventService,
  ) {}

  @Process("send")
  async handleSend(job: Job<PushJobData>) {
    this.logger.log(
      `Processing push notification job ${job.id} for user ${job.data.userId}`,
    );

    const {
      pushTokens,
      title,
      body,
      data,
      badge,
      sound,
      channelId,
      priority,
      ttl,
    } = job.data;

    if (!pushTokens || pushTokens.length === 0) {
      this.logger.warn(`No push tokens for user ${job.data.userId}`);
      return { success: false, reason: "No push tokens" };
    }

    const messages: ExpoPushMessage[] = pushTokens
      .filter((token) => isExpoPushToken(token))
      .map((token) => ({
        to: token,
        title,
        body,
        data,
        badge,
        sound: sound ?? "default",
        channelId: channelId ?? pushChannelFor(data?.type),
        priority: priority ?? "high",
        ttl: ttl ?? 86400,
      }));

    if (messages.length === 0) {
      this.logger.warn(`No valid Expo push tokens for user ${job.data.userId}`);
      return { success: false, reason: "No valid Expo tokens" };
    }

    // HTTP hatası fırlatılır → Bull yeniden dener.
    const outcome = await this.expoPush.sendMessages(messages);
    this.logger.log(
      `Push notification sent: ${outcome.sent} success, ${outcome.failed} failed`,
    );
    return {
      success: true,
      sent: outcome.sent,
      failed: outcome.failed,
      tickets: outcome.tickets,
    };
  }

  /**
   * Process notification by fetching user's push tokens from database
   * Used by EventService for order notifications
   * Also stores in-app notification for web/mobile app
   */
  @Process("send-notification")
  async handleSendNotification(job: Job<PushNotificationJobData>) {
    this.logger.log(
      `Processing send-notification job ${job.id} for user ${job.data.userId}`,
    );

    const { userId, broadcastId } = job.data;
    const rawType = job.data.data?.type;
    // Satıcıya giden tiplerde hedef kitle tipten eklenir (dispatch yoluyla
    // aynı kural): push dokunuşu satıcı ekranını açsın.
    const data = isKnownNotificationType(rawType)
      ? (withDefaultAudience(rawType, job.data.data) as
          PushNotificationJobData["data"] | undefined)
      : job.data.data;
    // Tercih kararı tipi: pazarlama türündeki admin duyurusu ALWAYS_SEND'den
    // yararlanmaz (S1) — `data.type` istemciye aynen gider.
    const notificationType = preferenceTypeFor(data);

    // Kullanıcı bildirim tercihleri (Bulgu #9): event.service → pushQueue yolu da
    // tercihe uymalı. Kategori kapalıysa zil + push birlikte atlanır; kategori
    // açık ama push master kapalıysa zil kalır, push atlanır.
    // Kampanya düğmesinin tek kaynağı e-posta izni kolonudur (resolveSettings).
    // Dil tercihi: metin alıcının dilinde render edilir.
    const prefs = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        notificationSettings: true,
        acceptsMarketingEmails: true,
        preferredLanguage: true,
      },
    });
    const settings = resolveSettings(
      prefs?.notificationSettings,
      prefs?.acceptsMarketingEmails,
    );
    const locale: Locale = isLocale(prefs?.preferredLanguage)
      ? prefs.preferredLanguage
      : defaultLocale;
    const { title, body } = renderQueuedNotificationText(job.data, locale);
    const inAppAllowed = shouldDeliver(settings, notificationType, "in_app");

    const finishBroadcast = async (delivered: boolean, error?: string) => {
      if (!broadcastId) return;
      await markBroadcastLogRows(this.prisma, {
        broadcastId,
        userIds: [userId],
        channels: ["push"],
        delivered,
        error,
      }).catch((err: unknown) =>
        this.logger.warn(
          `Broadcast log update failed (${broadcastId}): ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    };

    // 1. Store as in-app notification — skip for admin_broadcast because
    // admin.service.ts already creates the in_app log before queuing this job.
    if (data?.type !== "admin_broadcast") {
      if (inAppAllowed) {
        let saved: InAppSaveResult | null = null;
        try {
          saved = await this.saveInAppNotification(userId, title, body, data);
          this.logger.log(`In-app notification stored for user ${userId}`);
        } catch (error: any) {
          this.logger.error(
            `Failed to store in-app notification: ${error.message}`,
          );
        }
        // Aynı olay dispatch yolundan (ya da önceki bir denemeden) zaten
        // bildirildiyse push da TEKRARLANMAZ — eskiden zil satırı elenip push
        // yine gidiyordu ("teklif kabul edildi" iki kez geliyordu).
        if (saved === "duplicate") {
          return {
            success: true,
            inAppStored: false,
            pushSent: false,
            reason: "Duplicate notification",
          };
        }
      } else {
        this.logger.log(
          `In-app notification suppressed by user preference: user=${userId} type=${notificationType}`,
        );
      }
    }

    // 1b. Push tercihe uymuyorsa hiç gönderme (in-app yukarıda ele alındı).
    if (!shouldDeliver(settings, notificationType, "push")) {
      this.logger.log(
        `Push suppressed by user preference: user=${userId} type=${notificationType}`,
      );
      await finishBroadcast(false, "Suppressed by user preference");
      return {
        success: true,
        inAppStored: inAppAllowed,
        pushSent: false,
        reason: "Suppressed by user preference",
      };
    }

    // 2. Try to send push notification
    try {
      // Fetch the user's active Expo push tokens. Devices register these via
      // POST /notifications/push-token (ExpoPushProvider.registerToken), which
      // writes to the push_tokens table — NOT user.fcmToken. A single user may
      // have multiple devices, so we send to every active token.
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId, isActive: true },
        select: { token: true },
      });
      const pushTokens = tokens
        .map((t) => t.token)
        .filter((token) => isExpoPushToken(token));

      if (pushTokens.length === 0) {
        this.logger.warn(`No valid push tokens for user ${userId}`);
        await finishBroadcast(false, "No active device");
        return {
          success: true,
          inAppStored: true,
          pushSent: false,
          reason: "No push tokens",
        };
      }

      // iOS rozeti: okunmamış zil sayısı (yeni satır yukarıda yazıldı).
      const badge = await this.expoPush.unreadBadgeCount(userId);
      // Android kanalı tipten (mobil istemcinin kanallarıyla aynı kimlikler).
      const channelId = pushChannelFor(data?.type);

      const outcome: PushSendOutcome = await this.expoPush.sendMessages(
        pushTokens.map((token) => ({
          to: token,
          title,
          body,
          data,
          badge,
          sound: "default" as const,
          channelId,
          priority: "high" as const,
          ttl: 86400,
        })),
      );
      await finishBroadcast(
        outcome.sent > 0,
        outcome.sent > 0 ? undefined : "Rejected by Expo",
      );

      return {
        success: true,
        inAppStored: true,
        pushSent: outcome.sent > 0,
        sent: outcome.sent,
        tickets: outcome.tickets,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to process push notification: ${error.message}`,
      );
      await finishBroadcast(false, error?.message);
      // Return success because in-app notification was stored
      return {
        success: true,
        inAppStored: true,
        pushSent: false,
        error: error.message,
      };
    }
  }

  /**
   * Store in-app notification to database
   */
  private async saveInAppNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<InAppSaveResult> {
    const notificationType = data?.type || "general";

    // Hedef MERKEZÎ çözümleyiciden gelir. Burada `data` alanlarına bakarak
    // link kurulmuştu ve üretilen yolların çoğu web'de YOKTU (`/orders/:id`,
    // `/offers?tab=received`, `/trades/:id`, `/messages?thread=`): tıklanan
    // bildirim 404'e gidiyordu. Ayrıca hedefi entity önceliğine göre seçmek
    // yanlıştır — aynı sipariş alıcıya ve satıcıya farklı ekran açar.
    const link = isKnownNotificationType(notificationType)
      ? (resolveWebNotificationLink(notificationType, data) ?? undefined)
      : undefined;
    if (!isKnownNotificationType(notificationType)) {
      // Cast YOK: `as NotificationType` desteklenmeyen bir tipin sessizce
      // linksiz kaydedilmesine yol açıyordu.
      this.logger.warn(
        `Bilinmeyen bildirim tipi, hedef üretilemedi: ${String(notificationType)}`,
      );
    }

    // Get icon based on notification type
    const icon = this.getNotificationIcon(notificationType);

    // Mükerrer in-app bildirimi engelle: aynı kullanıcı + tip + ilgili varlık
    // (teklif/takas/ürün/sipariş) için son 60 dk içinde zaten bir bildirim varsa
    // tekrar oluşturma. (payment-scheduler sweep'i iptal edilmiş teklif/takasları
    // tekrar bildirdiği için "Teklifiniz iptal edildi" / "Takas İptal" çiftleniyordu.)
    const dedupField = data?.offerId
      ? "offerId"
      : data?.tradeId
        ? "tradeId"
        : data?.productId
          ? "productId"
          : data?.orderId
            ? "orderId"
            : null;
    const dedupValue = dedupField ? data?.[dedupField] : null;
    if (dedupField && dedupValue) {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const existing = await this.prisma.notificationLog.findFirst({
        where: {
          userId,
          channel: "in_app",
          type: notificationType,
          createdAt: { gte: since },
          data: { path: [dedupField], equals: dedupValue },
        },
        select: { id: true },
      });
      if (existing) {
        this.logger.log(
          `Skipping duplicate in-app notification (${notificationType}/${dedupField}=${dedupValue}) for user ${userId}`,
        );
        return "duplicate";
      }
    }

    await this.prisma.notificationLog.create({
      data: {
        userId,
        channel: "in_app",
        type: notificationType,
        title,
        body,
        data: {
          ...data,
          icon,
          link,
        },
        status: "sent",
        sentAt: new Date(),
      },
    });
    return "created";
  }

  /**
   * Get icon emoji for notification type
   */
  private getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      order_created: "📦",
      payment_confirmed: "💳",
      payment_received: "💰",
      order_shipped: "🚚",
      order_delivered: "✅",
      order_completed: "🎉",
      offer_received: "💵",
      offer_accepted: "✅",
      offer_rejected: "❌",
      trade_received: "🔄",
      trade_accepted: "✅",
      trade_completed: "🎉",
      new_message: "💬",
      review_received: "⭐",
      price_drop: "📉",
      new_follower: "👤",
      collection_liked: "❤️",
      product_approved: "✅",
      product_sold: "💰",
      membership_expiring: "⏰",
      membership_renewal_card_required: "💳",
      listing_expiring: "⏰",
      listing_views_milestone: "👀",
      welcome: "🎉",
      promotion: "🎁",
    };
    return icons[type] || "🔔";
  }

  @Process("send-bulk")
  async handleSendBulk(job: Job<{ notifications: PushJobData[] }>) {
    this.logger.log(`Processing bulk push notification job ${job.id}`);

    const results = [];
    for (const notification of job.data.notifications) {
      try {
        // Create a mock job object for the notification
        const mockJob = {
          id: job.id,
          data: notification,
        } as Job<PushJobData>;

        const result = await this.handleSend(mockJob);
        results.push({ userId: notification.userId, ...result });
      } catch (error: any) {
        results.push({
          userId: notification.userId,
          success: false,
          error: error.message,
        });
      }
    }

    return { results };
  }

  /**
   * Yönetici yayınının dağıtımı (EventService.emitAdminBroadcast kuyruğa
   * yazar). İlerleme `job.progress` ile parça parça kaydedilir: yeniden
   * denemede tamamlanmış parçalar atlanır, kullanıcı aynı duyuruyu iki kez
   * almaz. Zamanlanmış gönderimin durumu (sent/failed) burada, dağıtım
   * SONUCUNDAN yazılır.
   */
  @Process(ADMIN_BROADCAST_JOB)
  async handleBroadcast(job: Job<AdminBroadcastJobData>) {
    const progress = Number(job.progress());
    const startChunk = Number.isFinite(progress) && progress > 0 ? progress : 0;
    try {
      const stats = await this.events.runAdminBroadcastFanout(job.data, {
        startChunk,
        onChunkDone: async (done) => {
          await job.progress(done);
        },
      });
      if (job.data.scheduledNotificationId) {
        const channels = job.data.channels;
        // Yalnız e-posta seçildiyse ulaşanlar e-posta alıcılarıdır (pazarlamada
        // izinsiz/çıkmış kullanıcılar elenir); aksi halde dağıtılan kullanıcılar.
        const reached =
          channels.length > 0 && channels.every((c) => c === "email")
            ? stats.emailsQueued
            : stats.users;
        await this.prisma.scheduledNotification.updateMany({
          where: { id: job.data.scheduledNotificationId, status: "processing" },
          data: { status: "sent", sentAt: new Date(), sentCount: reached },
        });
      }
      return stats;
    } catch (error) {
      const finalAttempt =
        (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1);
      if (finalAttempt && job.data.scheduledNotificationId) {
        await this.prisma.scheduledNotification
          .updateMany({
            where: {
              id: job.data.scheduledNotificationId,
              status: "processing",
            },
            data: { status: "failed", sentAt: new Date(), errorCount: 1 },
          })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * Gecikmeli makbuz kontrolü (ExpoPushProvider.sendMessages planlar).
   * HTTP hatasında fırlatır → Bull yeniden dener (makbuzlar 24 saat durur).
   */
  @Process(PUSH_RECEIPT_JOB)
  async handleCheckReceipts(job: Job<PushReceiptJobData>) {
    const outcome = await this.expoPush.checkReceipts(job.data.tickets ?? []);
    if (outcome.failed > 0) {
      this.logger.log(
        `Push receipts: ${outcome.checked} checked, ${outcome.failed} failed, ${outcome.deactivated} token row(s) deactivated`,
      );
    }
    return outcome;
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Push notification job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Push notification job ${job.id} failed: ${error.message}`,
    );
  }
}
