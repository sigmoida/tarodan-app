/**
 * Push Notification Worker
 * Processes push notifications via Expo Push API
 */
import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';

export interface PushJobData {
  userId: string;
  pushTokens?: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

/**
 * Notification types for order flow
 */
export type OrderNotificationType = 
  | 'order_created'
  | 'payment_confirmed'
  | 'payment_received'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_completed';

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
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, any>;
}

@Processor('push')
export class PushWorker {
  private readonly logger = new Logger(PushWorker.name);
  private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Process('send')
  async handleSend(job: Job<PushJobData>) {
    this.logger.log(`Processing push notification job ${job.id} for user ${job.data.userId}`);

    const { pushTokens, title, body, data, badge, sound, channelId, priority, ttl } = job.data;

    if (!pushTokens || pushTokens.length === 0) {
      this.logger.warn(`No push tokens for user ${job.data.userId}`);
      return { success: false, reason: 'No push tokens' };
    }

    // Build Expo push messages
    const messages: ExpoPushMessage[] = pushTokens
      .filter((token) => token.startsWith('ExponentPushToken'))
      .map((token) => ({
        to: token,
        title,
        body,
        data,
        badge,
        sound: sound ?? 'default',
        channelId: channelId ?? 'default',
        priority: priority ?? 'high',
        ttl: ttl ?? 86400,
      }));

    if (messages.length === 0) {
      this.logger.warn(`No valid Expo push tokens for user ${job.data.userId}`);
      return { success: false, reason: 'No valid Expo tokens' };
    }

    try {
      // Send to Expo Push API in chunks of 100
      const chunks = this.chunkArray(messages, 100);
      const results: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        const response = await fetch(this.expoPushUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });

        if (!response.ok) {
          throw new Error(`Expo Push API error: ${response.status}`);
        }

        const responseData = await response.json();
        results.push(...(responseData.data || []));
      }

      const successCount = results.filter((r) => r.status === 'ok').length;
      const failCount = results.filter((r) => r.status === 'error').length;

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
  @Process('send-notification')
  async handleSendNotification(job: Job<PushNotificationJobData>) {
    this.logger.log(`Processing send-notification job ${job.id} for user ${job.data.userId}`);

    const { userId, title, body, data } = job.data;

    // 1. Always store as in-app notification (for web and mobile app notification centers)
    try {
      await this.saveInAppNotification(userId, title, body, data);
      this.logger.log(`In-app notification stored for user ${userId}`);
    } catch (error: any) {
      this.logger.error(`Failed to store in-app notification: ${error.message}`);
    }

    // 2. Try to send push notification
    try {
      // Fetch user's FCM token from database
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          fcmToken: true,
        },
      });

      if (!user) {
        this.logger.warn(`User ${userId} not found`);
        return { success: true, inAppStored: true, pushSent: false, reason: 'User not found' };
      }

      // Get push token
      const pushTokens: string[] = user.fcmToken ? [user.fcmToken] : [];
      
      if (pushTokens.length === 0) {
        this.logger.warn(`No push tokens for user ${userId}`);
        return { success: true, inAppStored: true, pushSent: false, reason: 'No push tokens' };
      }

      // Determine channel based on notification type
      let channelId = 'default';
      if (data?.type) {
        if (data.type.includes('order') || data.type.includes('payment')) {
          channelId = 'orders';
        } else if (data.type.includes('message')) {
          channelId = 'messages';
        }
      }

      // Build Expo push messages directly
      const messages: ExpoPushMessage[] = pushTokens
        .filter((token) => token.startsWith('ExponentPushToken'))
        .map((token) => ({
          to: token,
          title,
          body,
          data,
          sound: 'default',
          channelId,
          priority: 'high' as const,
          ttl: 86400,
        }));

      if (messages.length === 0) {
        this.logger.warn(`No valid Expo push tokens for user ${userId}`);
        return { success: true, inAppStored: true, pushSent: false, reason: 'No valid Expo tokens' };
      }

      // Send to Expo Push API
      const response = await fetch(this.expoPushUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        throw new Error(`Expo Push API error: ${response.status}`);
      }

      const responseData = await response.json();
      const results: ExpoPushTicket[] = responseData.data || [];
      const successCount = results.filter((r) => r.status === 'ok').length;

      return {
        success: true,
        inAppStored: true,
        pushSent: successCount > 0,
        sent: successCount,
        tickets: results,
      };
    } catch (error: any) {
      this.logger.error(`Failed to process push notification: ${error.message}`);
      // Return success because in-app notification was stored
      return { success: true, inAppStored: true, pushSent: false, error: error.message };
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
    const notificationType = data?.type || 'general';
    
    // Generate link based on notification type
    let link: string | undefined;
    if (data?.orderId) {
      link = `/orders/${data.orderId}`;
    } else if (data?.productId) {
      link = `/listings/${data.productId}`;
    } else if (data?.tradeId) {
      link = `/trades/${data.tradeId}`;
    } else if (data?.threadId) {
      link = `/messages/${data.threadId}`;
    } else if (data?.collectionId) {
      link = `/collections/${data.collectionId}`;
    }

    // Get icon based on notification type
    const icon = this.getNotificationIcon(notificationType);

    await this.prisma.notificationLog.create({
      data: {
        userId,
        channel: 'in_app',
        type: notificationType,
        title,
        body,
        data: {
          ...data,
          icon,
          link,
        },
        status: 'sent',
        sentAt: new Date(),
      },
    });
  }

  /**
   * Get icon emoji for notification type
   */
  private getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      order_created: '📦',
      payment_confirmed: '💳',
      payment_received: '💰',
      order_shipped: '🚚',
      order_delivered: '✅',
      order_completed: '🎉',
      offer_received: '💵',
      offer_accepted: '✅',
      offer_rejected: '❌',
      trade_received: '🔄',
      trade_accepted: '✅',
      trade_completed: '🎉',
      new_message: '💬',
      review_received: '⭐',
      price_drop: '📉',
      new_follower: '👤',
      collection_liked: '❤️',
      product_approved: '✅',
      product_sold: '💰',
      membership_expiring: '⏰',
      listing_expiring: '⏰',
      listing_views_milestone: '👀',
      welcome: '🎉',
      promotion: '🎁',
    };
    return icons[type] || '🔔';
  }

  @Process('send-bulk')
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
    this.logger.error(`Push notification job ${job.id} failed: ${error.message}`);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
