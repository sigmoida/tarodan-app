/**
 * Push Notification Worker
 * Processes push notifications via Expo Push API
 */
import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
} from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma";
import {
  resolveSettings,
  shouldDeliver,
} from "../modules/notification/notification-preferences";
import { NotificationType } from "../modules/notification/dto";
import {
  isKnownNotificationType,
  resolveWebNotificationLink,
} from "../modules/notification/notification-link";

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
  title: string;
  body: string;
  data?: {
    type: OrderNotificationType | string;
    orderId?: string;
    orderNumber?: string;
    [key: string]: any;
  };
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: "default" | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: Record<string, any>;
}

@Processor("push")
export class PushWorker {
  private readonly logger = new Logger(PushWorker.name);
  private readonly expoPushUrl = "https://exp.host/--/api/v2/push/send";
  private readonly expoAccessToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.expoAccessToken = this.configService.get<string>(
      "EXPO_ACCESS_TOKEN",
      "",
    );
  }

  /**
   * Build headers for the Expo Push API. Adds the bearer token when
   * EXPO_ACCESS_TOKEN is configured (required once "Enhanced Security for
   * Push Notifications" is enabled in the Expo dashboard).
   */
  private buildExpoHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    if (this.expoAccessToken) {
      headers["Authorization"] = `Bearer ${this.expoAccessToken}`;
    }
    return headers;
  }

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

    // Build Expo push messages
    const messages: ExpoPushMessage[] = pushTokens
      .filter((token) => /^Expo(nent)?PushToken\[.+\]$/.test(token))
      .map((token) => ({
        to: token,
        title,
        body,
        data,
        badge,
        sound: sound ?? "default",
        channelId: channelId ?? "default",
        priority: priority ?? "high",
        ttl: ttl ?? 86400,
      }));

    if (messages.length === 0) {
      this.logger.warn(`No valid Expo push tokens for user ${job.data.userId}`);
      return { success: false, reason: "No valid Expo tokens" };
    }

    try {
      // Send to Expo Push API in chunks of 100
      const chunks = this.chunkArray(messages, 100);
      const results: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        const response = await fetch(this.expoPushUrl, {
          method: "POST",
          headers: this.buildExpoHeaders(),
          body: JSON.stringify(chunk),
        });

        if (!response.ok) {
          throw new Error(`Expo Push API error: ${response.status}`);
        }

        const responseData = await response.json();
        results.push(...(responseData.data || []));
      }

      const successCount = results.filter((r) => r.status === "ok").length;
      const failCount = results.filter((r) => r.status === "error").length;

      this.logger.log(
        `Push notification sent: ${successCount} success, ${failCount} failed`,
      );

      return {
        success: true,
        sent: successCount,
        failed: failCount,
        tickets: results,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send push notification: ${error.message}`);
      throw error;
    }
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

    const { userId, title, body, data } = job.data;
    const notificationType = data?.type || "general";

    // Kullanıcı bildirim tercihleri (Bulgu #9): event.service → pushQueue yolu da
    // tercihe uymalı. Kategori kapalıysa zil + push birlikte atlanır; kategori
    // açık ama push master kapalıysa zil kalır, push atlanır.
    const settings = resolveSettings(
      (
        await this.prisma.user.findUnique({
          where: { id: userId },
          select: { notificationSettings: true },
        })
      )?.notificationSettings,
    );
    const inAppAllowed = shouldDeliver(settings, notificationType, "in_app");

    // 1. Store as in-app notification — skip for admin_broadcast because
    // admin.service.ts already creates the in_app log before queuing this job.
    if (data?.type !== "admin_broadcast") {
      if (inAppAllowed) {
        try {
          await this.saveInAppNotification(userId, title, body, data);
          this.logger.log(`In-app notification stored for user ${userId}`);
        } catch (error: any) {
          this.logger.error(
            `Failed to store in-app notification: ${error.message}`,
          );
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

      // Get push tokens
      const pushTokens: string[] = tokens.map((t) => t.token);

      if (pushTokens.length === 0) {
        this.logger.warn(`No push tokens for user ${userId}`);
        return {
          success: true,
          inAppStored: true,
          pushSent: false,
          reason: "No push tokens",
        };
      }

      // Determine channel based on notification type
      let channelId = "default";
      if (data?.type) {
        if (data.type.includes("order") || data.type.includes("payment")) {
          channelId = "orders";
        } else if (data.type.includes("trade")) {
          channelId = "trades";
        } else if (data.type.includes("message")) {
          channelId = "messages";
        }
      }

      // Build Expo push messages directly
      const messages: ExpoPushMessage[] = pushTokens
        .filter((token) => /^Expo(nent)?PushToken\[.+\]$/.test(token))
        .map((token) => ({
          to: token,
          title,
          body,
          data,
          sound: "default",
          channelId,
          priority: "high" as const,
          ttl: 86400,
        }));

      if (messages.length === 0) {
        this.logger.warn(`No valid Expo push tokens for user ${userId}`);
        return {
          success: true,
          inAppStored: true,
          pushSent: false,
          reason: "No valid Expo tokens",
        };
      }

      // Send to Expo Push API
      const response = await fetch(this.expoPushUrl, {
        method: "POST",
        headers: this.buildExpoHeaders(),
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        throw new Error(`Expo Push API error: ${response.status}`);
      }

      const responseData = await response.json();
      const results: ExpoPushTicket[] = responseData.data || [];
      const successCount = results.filter((r) => r.status === "ok").length;

      // Ölü token temizliği: Expo bir cihaz için 'DeviceNotRegistered' dönerse
      // (uygulama silinmiş / token geçersiz) o token'ı deaktive et ki bir daha
      // denenmesin ve push_tokens şişmesin. results, messages ile aynı sıradadır.
      const deadTokens = results
        .map((ticket, i) =>
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
            ? messages[i]?.to
            : null,
        )
        .filter((t): t is string => !!t);
      if (deadTokens.length > 0) {
        await this.prisma.pushToken.updateMany({
          where: { token: { in: deadTokens } },
          data: { isActive: false },
        });
        this.logger.log(
          `Deactivated ${deadTokens.length} dead push token(s) for user ${userId}`,
        );
      }

      return {
        success: true,
        inAppStored: true,
        pushSent: successCount > 0,
        sent: successCount,
        tickets: results,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to process push notification: ${error.message}`,
      );
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
  ): Promise<void> {
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
        return;
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

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
