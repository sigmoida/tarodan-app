/**
 * Notification Service
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Requirement: Push notifications, email, SMS (project.md)
 * Provides unified notification interface with real provider integrations
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import {
  SendNotificationDto,
  NotificationType,
  NotificationChannel,
  RegisterPushTokenDto,
} from './dto';
import { SendGridProvider } from './providers/sendgrid.provider';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { SmsProvider } from './providers/sms.provider';
import { SmtpProvider } from './providers/smtp.provider';

// Notification templates (Turkish)
const NOTIFICATION_TEMPLATES: Record<NotificationType, { title: string; message: string; icon?: string; link?: string }> = {
  // Order notifications
  [NotificationType.ORDER_CREATED]: {
    title: 'Siparişiniz Oluşturuldu',
    message: 'Siparişiniz başarıyla oluşturuldu. Ödeme bekleniyor.',
    icon: '📦',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_PAID]: {
    title: 'Ödeme Alındı',
    message: 'Siparişiniz için ödeme alındı. Satıcı siparişinizi hazırlıyor.',
    icon: '💳',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_SHIPPED]: {
    title: 'Siparişiniz Kargoya Verildi',
    message: 'Siparişiniz kargoya verildi. Takip numaranız: {{trackingNumber}}',
    icon: '🚚',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_DELIVERED]: {
    title: 'Siparişiniz Teslim Edildi',
    message: 'Siparişiniz teslim edildi. Lütfen onaylayın ve değerlendirin.',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_COMPLETED]: {
    title: 'Sipariş Tamamlandı',
    message: 'Siparişiniz başarıyla tamamlandı. Teşekkür ederiz!',
    icon: '🎉',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_CANCELLED]: {
    title: 'Sipariş İptal Edildi',
    message: 'Siparişiniz iptal edildi.',
    icon: '❌',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_REFUNDED]: {
    title: 'İade İşlemi Tamamlandı',
    message: 'Ödemeniz iade edildi. {{amount}} TL hesabınıza aktarılacak.',
    icon: '💰',
    link: '/orders/{{orderId}}',
  },

  // Offer notifications
  [NotificationType.OFFER_RECEIVED]: {
    title: 'Yeni Teklif Aldınız',
    message: '{{productTitle}} ürününüz için {{amount}} TL teklif aldınız.',
    icon: '💵',
    link: '/profile/listings',
  },
  [NotificationType.OFFER_ACCEPTED]: {
    title: 'Teklifiniz Kabul Edildi! 🎉',
    message: '{{productTitle}} için teklifiniz kabul edildi. Hemen ödeyin!',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.OFFER_REJECTED]: {
    title: 'Teklifiniz Reddedildi',
    message: '{{productTitle}} için teklifiniz satıcı tarafından reddedildi.',
    icon: '❌',
    link: '/listings/{{productId}}',
  },
  [NotificationType.OFFER_COUNTER]: {
    title: 'Karşı Teklif Aldınız',
    message: '{{productTitle}} için satıcı {{amount}} TL karşı teklif yaptı.',
    icon: '🔄',
    link: '/listings/{{productId}}',
  },
  [NotificationType.OFFER_EXPIRED]: {
    title: 'Teklifin Süresi Doldu',
    message: '{{productTitle}} için teklifinizin süresi doldu.',
    icon: '⏰',
    link: '/listings/{{productId}}',
  },

  // Product notifications
  [NotificationType.PRODUCT_APPROVED]: {
    title: 'İlanınız Yayında! 🎉',
    message: '{{productTitle}} ilanınız onaylandı ve yayına alındı.',
    icon: '✅',
    link: '/listings/{{productId}}',
  },
  [NotificationType.PRODUCT_REJECTED]: {
    title: 'İlanınız Reddedildi',
    message: '{{productTitle}} ilanınız onaylanmadı. Neden: {{reason}}',
    icon: '❌',
    link: '/profile/listings',
  },
  [NotificationType.PRODUCT_SOLD]: {
    title: 'Ürününüz Satıldı! 🎉',
    message: '{{productTitle}} ürününüz {{amount}} TL\'ye satıldı.',
    icon: '💰',
    link: '/orders/{{orderId}}',
  },

  // Payment notifications
  [NotificationType.PAYMENT_RECEIVED]: {
    title: 'Ödeme Alındı',
    message: '{{productTitle}} satışından {{amount}} TL ödeme alındı.',
    icon: '💳',
    link: '/profile/earnings',
  },
  [NotificationType.PAYMENT_RELEASED]: {
    title: 'Ödemeniz Aktarıldı',
    message: '{{amount}} TL hesabınıza aktarıldı.',
    icon: '🏦',
    link: '/profile/earnings',
  },

  // Trade notifications
  [NotificationType.TRADE_RECEIVED]: {
    title: 'Yeni Takas Teklifi',
    message: 'Ürünleriniz için bir takas teklifi aldınız.',
    icon: '🔄',
    link: '/trades/{{tradeId}}',
  },
  [NotificationType.TRADE_ACCEPTED]: {
    title: 'Takas Kabul Edildi! 🎉',
    message: 'Takas teklifiniz kabul edildi. Lütfen kargoya verin.',
    icon: '✅',
    link: '/trades/{{tradeId}}',
  },
  [NotificationType.TRADE_REJECTED]: {
    title: 'Takas Reddedildi',
    message: 'Takas teklifiniz reddedildi.',
    icon: '❌',
    link: '/trades',
  },
  [NotificationType.TRADE_COUNTER]: {
    title: 'Karşı Takas Teklifi Aldınız',
    message: '{{counterOffererName}} takas teklifinize karşı teklif yaptı.',
    icon: '🔄',
    link: '/trades/{{tradeId}}',
  },
  [NotificationType.TRADE_SHIPPED]: {
    title: 'Takas Kargoya Verildi',
    message: 'Takas paketiniz kargoya verildi. Takip no: {{trackingNumber}}',
    icon: '🚚',
    link: '/trades/{{tradeId}}',
  },
  [NotificationType.TRADE_COMPLETED]: {
    title: 'Takas Tamamlandı! 🎉',
    message: 'Takas işlemi başarıyla tamamlandı!',
    icon: '🎉',
    link: '/trades/{{tradeId}}',
  },

  // Message notifications
  [NotificationType.NEW_MESSAGE]: {
    title: 'Yeni Mesaj',
    message: '{{senderName}}: {{messagePreview}}',
    icon: '💬',
    link: '/messages/{{threadId}}',
  },

  // Wishlist/Favorites notifications
  [NotificationType.PRICE_DROP]: {
    title: 'Fiyat Düştü! 🔥',
    message: '{{productTitle}} ürününün fiyatı {{oldPrice}} TL\'den {{newPrice}} TL\'ye düştü!',
    icon: '📉',
    link: '/listings/{{productId}}',
  },
  [NotificationType.WISHLIST_ITEM_SOLD]: {
    title: 'Kaçırdınız! 😢',
    message: 'Favorilerinize eklediğiniz {{productTitle}} satıldı.',
    icon: '💔',
    link: '/favorites',
  },
  [NotificationType.BACK_IN_STOCK]: {
    title: 'Tekrar Satışta!',
    message: '{{productTitle}} tekrar satışa çıktı.',
    icon: '🔔',
    link: '/listings/{{productId}}',
  },

  // Social notifications
  [NotificationType.NEW_FOLLOWER]: {
    title: 'Yeni Takipçi',
    message: '{{followerName}} sizi takip etmeye başladı.',
    icon: '👤',
    link: '/seller/{{followerId}}',
  },
  [NotificationType.SELLER_NEW_LISTING]: {
    title: 'Yeni İlan',
    message: '{{sellerName}} yeni bir ilan ekledi: {{productTitle}}',
    icon: '🆕',
    link: '/listings/{{productId}}',
  },
  [NotificationType.COLLECTION_LIKED]: {
    title: 'Koleksiyonunuz Beğenildi',
    message: '{{userName}} koleksiyonunuzu beğendi.',
    icon: '❤️',
    link: '/collections/{{collectionId}}',
  },
  [NotificationType.PRODUCT_LIKED]: {
    title: 'Ürününüz Beğenildi ❤️',
    message: '{{userName}} {{productTitle}} ürününüzü favorilere ekledi.',
    icon: '❤️',
    link: '/listings/{{productId}}',
  },
  [NotificationType.WISHLIST_SOLD]: {
    title: 'Favori Ürününüz Satıldı 😢',
    message: 'Favorilerinize eklediğiniz {{productTitle}} satıldı.',
    icon: '💔',
    link: '/listings/{{productId}}',
  },

  // Review notifications
  [NotificationType.REVIEW_RECEIVED]: {
    title: 'Yeni Değerlendirme',
    message: '{{reviewerName}} size {{score}} yıldız verdi.',
    icon: '⭐',
    link: '/profile',
  },

  // Membership notifications
  [NotificationType.MEMBERSHIP_EXPIRING]: {
    title: 'Üyeliğiniz Bitiyor',
    message: '{{tierName}} üyeliğiniz {{daysLeft}} gün içinde sona erecek.',
    icon: '⏰',
    link: '/pricing',
  },
  [NotificationType.MEMBERSHIP_EXPIRED]: {
    title: 'Üyeliğiniz Sona Erdi',
    message: '{{tierName}} üyeliğiniz sona erdi. Yenileyin ve avantajlardan yararlanın!',
    icon: '⚠️',
    link: '/pricing',
  },
  [NotificationType.MEMBERSHIP_UPGRADED]: {
    title: 'Üyeliğiniz Yükseltildi! 🎉',
    message: '{{tierName}} üyeliğine hoş geldiniz! Yeni avantajlarınız aktif.',
    icon: '👑',
    link: '/profile',
  },

  // Listing notifications
  [NotificationType.LISTING_EXPIRING]: {
    title: 'İlanınız Bitiyor',
    message: '{{productTitle}} ilanınız {{daysLeft}} gün içinde sona erecek.',
    icon: '⏰',
    link: '/listings/{{productId}}',
  },
  [NotificationType.LISTING_EXPIRED]: {
    title: 'İlanınız Sona Erdi',
    message: '{{productTitle}} ilanınız sona erdi. Yeniden yayınlayın.',
    icon: '⚠️',
    link: '/profile/listings',
  },
  [NotificationType.LISTING_VIEWS_MILESTONE]: {
    title: 'Tebrikler! 🎉',
    message: '{{productTitle}} ilanınız {{viewCount}} görüntülemeye ulaştı!',
    icon: '👀',
    link: '/listings/{{productId}}',
  },

  // Promotion notifications
  [NotificationType.PROMOTION]: {
    title: '🎁 Özel Kampanya',
    message: '{{promotionTitle}}',
    icon: '🎁',
    link: '{{promotionLink}}',
  },
  [NotificationType.SPECIAL_OFFER]: {
    title: '💎 Özel Teklif',
    message: '{{offerDescription}}',
    icon: '💎',
    link: '{{offerLink}}',
  },

  // General notifications
  [NotificationType.WELCOME]: {
    title: "Tarodan'a Hoş Geldiniz! 🎉",
    message: 'Diecast model araba koleksiyoncuları platformuna hoş geldiniz.',
    icon: '🎉',
    link: '/listings',
  },
  [NotificationType.PASSWORD_RESET]: {
    title: 'Şifre Sıfırlama',
    message: 'Şifrenizi sıfırlamak için linke tıklayın.',
    icon: '🔐',
  },
  [NotificationType.EMAIL_VERIFICATION]: {
    title: 'E-posta Doğrulama',
    message: 'E-postanızı doğrulamak için linke tıklayın.',
    icon: '📧',
  },
  [NotificationType.SYSTEM_ANNOUNCEMENT]: {
    title: '📢 Duyuru',
    message: '{{announcement}}',
    icon: '📢',
    link: '{{announcementLink}}',
  },
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sendGridProvider: SendGridProvider,
    private readonly expoPushProvider: ExpoPushProvider,
    private readonly smsProvider: SmsProvider,
    private readonly smtpProvider: SmtpProvider,
  ) {}

  /**
   * Send notification to a user through specified channels
   * Uses REAL providers: SendGrid for email, Expo for push, Twilio for SMS
   */
  async send(dto: SendNotificationDto) {
    const template = NOTIFICATION_TEMPLATES[dto.type];
    if (!template) {
      this.logger.warn(`Unknown notification type: ${dto.type}`);
      return { success: false, error: 'Unknown notification type' };
    }

    // Get user
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, email: true, displayName: true, phone: true },
    });

    if (!user) {
      this.logger.warn(`User not found: ${dto.userId}`);
      return { success: false, error: 'User not found' };
    }

    // Interpolate template with data
    const title = this.interpolate(template.title, dto.data);
    const message = this.interpolate(template.message, dto.data);

    // Determine channels (default to email + in_app)
    const channels = dto.channels || [NotificationChannel.EMAIL, NotificationChannel.IN_APP];

    const results: Record<string, boolean> = {};

    // Send to each channel using REAL providers
    for (const channel of channels) {
      switch (channel) {
        case NotificationChannel.EMAIL:
          results.email = await this.sendEmailReal(user.email, title, message, dto.data);
          await this.logNotification(dto.userId, 'email', dto.type, title, message, results.email);
          break;

        case NotificationChannel.PUSH:
          results.push = await this.sendPushReal(dto.userId, title, message, dto.data);
          await this.logNotification(dto.userId, 'push', dto.type, title, message, results.push);
          break;

        case NotificationChannel.IN_APP:
          results.in_app = await this.saveInAppNotification(dto.userId, dto.type, title, message, dto.data);
          await this.logNotification(dto.userId, 'in_app', dto.type, title, message, results.in_app);
          break;

        case NotificationChannel.SMS:
          if (user.phone) {
            results.sms = await this.sendSmsReal(user.phone, message);
            await this.logNotification(dto.userId, 'sms', dto.type, title, message, results.sms);
          }
          break;
      }
    }

    this.logger.log(`Notification sent to ${user.email}: ${dto.type}`);

    return { success: true, channels: results };
  }

  /**
   * Send email using SendGrid provider
   */
  private async sendEmailReal(
    to: string,
    subject: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<boolean> {
    try {
      const result = await this.sendGridProvider.sendEmail({
        to,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${subject}</h2>
            <p>${body}</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
              © ${new Date().getFullYear()} Tarodan. Tüm hakları saklıdır.
            </p>
          </div>
        `,
      });

      return result.success;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  }

  /**
   * Send push notification using Expo provider
   */
  private async sendPushReal(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<boolean> {
    try {
      const results = await this.expoPushProvider.sendToUser(userId, title, body, data);
      return results.some((r) => r.success);
    } catch (error) {
      this.logger.error(`Failed to send push to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Send SMS using Twilio provider
   */
  private async sendSmsReal(phone: string, message: string): Promise<boolean> {
    try {
      const result = await this.smsProvider.sendSms({
        to: phone,
        body: message,
      });
      return result.success;
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phone}:`, error);
      return false;
    }
  }

  /**
   * Save in-app notification to database
   */
  private async saveInAppNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<boolean> {
    this.logger.log(`[saveInAppNotification] Saving for userId=${userId}, type=${type}`);
    try {
      const template = NOTIFICATION_TEMPLATES[type];
      let link = template?.link;
      
      // Interpolate link with data
      if (link && data) {
        link = this.interpolate(link, data);
      }

      // Store in NotificationLog as an in-app notification
      const notification = await this.prisma.notificationLog.create({
        data: {
          userId,
          channel: 'in_app',
          type,
          title,
          body: message,
          data: {
            ...(data || {}),
            icon: template?.icon,
            link,
          },
          status: 'sent',
          sentAt: new Date(),
        },
      });

      this.logger.log(`[saveInAppNotification] Successfully saved notification id=${notification.id}`);
      return true;
    } catch (error) {
      this.logger.error(`[saveInAppNotification] Failed to save for ${userId}:`, error);
      return false;
    }
  }

  /**
   * Create in-app notification directly (for use by other services)
   * This method is public and can be called from EventService, OrderService, etc.
   */
  async createInAppNotification(
    userId: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<boolean> {
    this.logger.log(`[createInAppNotification] Called with userId=${userId}, type=${type}, data=${JSON.stringify(data)}`);
    
    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      this.logger.warn(`[createInAppNotification] Unknown notification type: ${type}`);
      return false;
    }

    const title = this.interpolate(template.title, data);
    const message = this.interpolate(template.message, data);
    
    this.logger.log(`[createInAppNotification] Saving notification: title="${title}", message="${message}"`);

    const result = await this.saveInAppNotification(userId, type, title, message, data);
    this.logger.log(`[createInAppNotification] Result: ${result}`);
    return result;
  }

  /**
   * Log notification to database for tracking
   */
  private async logNotification(
    userId: string,
    channel: string,
    type: string,
    title: string,
    body: string,
    success: boolean,
  ): Promise<void> {
    try {
      await this.prisma.notificationLog.create({
        data: {
          userId,
          channel,
          type,
          title,
          body,
          status: success ? 'sent' : 'failed',
          sentAt: success ? new Date() : null,
          errorMessage: success ? null : 'Delivery failed',
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log notification:`, error);
    }
  }

  /**
   * Register push token for a user
   */
  async registerPushToken(userId: string, dto: RegisterPushTokenDto) {
    try {
      await this.expoPushProvider.registerToken(
        userId,
        dto.token,
        dto.platform as 'ios' | 'android',
        dto.deviceId,
      );

      return { success: true, userId, platform: dto.platform };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Interpolate template with data
   */
  private interpolate(template: string, data?: Record<string, any>): string {
    if (!data) return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  /**
   * Get user's in-app notifications
   */
  async getInAppNotifications(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where: { userId, channel: 'in_app' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notificationLog.count({
        where: { userId, channel: 'in_app' },
      }),
      this.prisma.notificationLog.count({
        where: { userId, channel: 'in_app', status: 'sent' },
      }),
    ]);

    // Format notifications with proper structure
    const formattedNotifications = notifications.map((n) => {
      const data = (n.data as Record<string, any>) || {};
      return {
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.body,
        icon: data.icon || this.getDefaultIcon(n.type),
        link: data.link,
        isRead: n.status === 'read',
        createdAt: n.createdAt,
        data: data,
      };
    });

    return {
      notifications: formattedNotifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get default icon for notification type
   */
  private getDefaultIcon(type: string): string {
    const template = NOTIFICATION_TEMPLATES[type as NotificationType];
    return template?.icon || '🔔';
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.notificationLog.updateMany({
        where: { id: notificationId, userId },
        data: { status: 'read' },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notificationLog.updateMany({
      where: { userId, channel: 'in_app', status: 'sent' },
      data: { status: 'read' },
    });
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notificationLog.count({
      where: { userId, channel: 'in_app', status: 'sent' },
    });
  }

  // ==================== CONVENIENCE METHODS ====================

  /**
   * Send order notification
   */
  async notifyOrderCreated(buyerId: string, orderId: string, amount: number) {
    return this.send({
      userId: buyerId,
      type: NotificationType.ORDER_CREATED,
      data: { orderId, amount },
    });
  }

  async notifyOrderPaid(sellerId: string, orderId: string, amount: number) {
    return this.send({
      userId: sellerId,
      type: NotificationType.ORDER_PAID,
      data: { orderId, amount },
    });
  }

  async notifyOrderShipped(buyerId: string, orderId: string, trackingNumber: string) {
    return this.send({
      userId: buyerId,
      type: NotificationType.ORDER_SHIPPED,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId, trackingNumber },
    });
  }

  /**
   * Send offer notification
   */
  async notifyOfferReceived(sellerId: string, productId: string, amount: number) {
    return this.send({
      userId: sellerId,
      type: NotificationType.OFFER_RECEIVED,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId, amount },
    });
  }

  async notifyOfferAccepted(buyerId: string, productId: string, amount: number) {
    return this.send({
      userId: buyerId,
      type: NotificationType.OFFER_ACCEPTED,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId, amount },
    });
  }

  /**
   * Send trade notifications
   */
  async notifyTradeReceived(receiverId: string, tradeId: string) {
    return this.send({
      userId: receiverId,
      type: NotificationType.TRADE_RECEIVED,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId },
    });
  }

  async notifyTradeAccepted(initiatorId: string, tradeId: string) {
    return this.send({
      userId: initiatorId,
      type: NotificationType.TRADE_ACCEPTED,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP, NotificationChannel.SMS],
      data: { tradeId },
    });
  }

  async notifyTradeShipped(receiverId: string, tradeId: string, trackingNumber: string) {
    return this.send({
      userId: receiverId,
      type: NotificationType.TRADE_SHIPPED,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId, trackingNumber },
    });
  }

  async notifyTradeCompleted(userId: string, tradeId: string) {
    return this.send({
      userId,
      type: NotificationType.TRADE_COMPLETED,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId },
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(userId: string) {
    return this.send({
      userId,
      type: NotificationType.WELCOME,
      channels: [NotificationChannel.EMAIL],
    });
  }

  /**
   * Send password reset email using SendGrid or SMTP
   */
  async sendPasswordResetEmail(userId: string, resetToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });

    if (!user) return { success: false, error: 'User not found' };

    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Try SendGrid first, fall back to SMTP
    let result;
    if (this.sendGridProvider.isConfigured()) {
      result = await this.sendGridProvider.sendPasswordResetEmail(user.email, resetUrl);
    } else if (this.smtpProvider.isConfigured()) {
      // Use SMTP as fallback
      result = await this.smtpProvider.sendEmail({
        to: user.email,
        subject: 'Şifre Sıfırlama - Tarodan',
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 40px 20px;">
            <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #f97316; font-size: 28px; margin: 0;">🔐 Tarodan</h1>
              </div>
              
              <h2 style="color: #1f2937; font-size: 24px; margin-bottom: 16px;">Şifre Sıfırlama</h2>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Merhaba${user.displayName ? ` ${user.displayName}` : ''},
              </p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Hesabınız için şifre sıfırlama talebinde bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz.
              </p>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" 
                   style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4);">
                  Şifremi Sıfırla
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                Bu bağlantı <strong>1 saat</strong> içinde geçerliliğini yitirecektir.
              </p>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                Eğer bu isteği siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz. Şifreniz değiştirilmeyecektir.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
              
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.<br/>
                © ${new Date().getFullYear()} Tarodan. Tüm hakları saklıdır.
              </p>
            </div>
          </div>
        `,
      });
    } else {
      this.logger.warn('Neither SendGrid nor SMTP is configured for password reset email');
      result = { success: false, error: 'No email provider configured' };
    }

    await this.logNotification(userId, 'email', 'password_reset', 'Şifre Sıfırlama', '', result.success);
    
    if (result.success) {
      this.logger.log(`Password reset email sent to ${user.email}`);
    } else {
      this.logger.error(`Failed to send password reset email to ${user.email}: ${result.error}`);
    }

    return result;
  }

  /**
   * Send email verification using SendGrid or SMTP
   */
  async sendEmailVerification(userId: string, verificationToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });

    if (!user) return { success: false, error: 'User not found' };

    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;

    // Try SendGrid first, fall back to SMTP
    let result;
    if (this.sendGridProvider.isConfigured()) {
      result = await this.sendGridProvider.sendEmailVerification(user.email, verifyUrl);
    } else if (this.smtpProvider.isConfigured()) {
      result = await this.smtpProvider.sendEmail({
        to: user.email,
        subject: 'E-posta Doğrulama - Tarodan',
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 40px 20px;">
            <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #f97316; font-size: 28px; margin: 0;">✉️ Tarodan</h1>
              </div>
              
              <h2 style="color: #1f2937; font-size: 24px; margin-bottom: 16px;">E-posta Doğrulama</h2>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Merhaba${user.displayName ? ` ${user.displayName}` : ''},
              </p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Tarodan'a hoş geldiniz! E-posta adresinizi doğrulamak için aşağıdaki butona tıklayın.
              </p>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${verifyUrl}" 
                   style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4);">
                  E-postamı Doğrula
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                Bu bağlantı <strong>24 saat</strong> içinde geçerliliğini yitirecektir.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
              
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} Tarodan. Tüm hakları saklıdır.
              </p>
            </div>
          </div>
        `,
      });
    } else {
      this.logger.warn('Neither SendGrid nor SMTP is configured for email verification');
      result = { success: false, error: 'No email provider configured' };
    }

    await this.logNotification(userId, 'email', 'email_verification', 'E-posta Doğrulama', '', result.success);

    return result;
  }

  /**
   * Check if providers are configured
   */
  getProviderStatus() {
    return {
      sendgrid: this.sendGridProvider.isConfigured(),
      expo: this.expoPushProvider.isConfigured(),
      sms: this.smsProvider.isConfigured(),
    };
  }
}
