/**
 * Notification Dispatch Service (shared engine)
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Multi-channel delivery core: email/push/sms/in-app dispatch, template
 * rendering, user-preference gating and notification logging. Notifier
 * sub-services (commerce/account) and the NotificationService facade delegate
 * to this single engine.
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
import { RealtimeService } from '../websocket/realtime.service';
import { renderEmailTemplate, getEmailTemplateSubject } from '../../common/helpers/email-template-renderer';
import {
  resolveSettings,
  shouldDeliver,
  DeliveryChannel,
} from './notification-preferences';
import { NotificationSettings } from '../user/dto/notification-settings.dto';
import { NOTIFICATION_TEMPLATES } from './notification-templates';
import { type Locale, type MessageValues, defaultLocale, isLocale } from '@tarodan/i18n';
import { I18nService } from '../i18n/i18n.service';

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sendGridProvider: SendGridProvider,
    private readonly expoPushProvider: ExpoPushProvider,
    private readonly smsProvider: SmsProvider,
    private readonly smtpProvider: SmtpProvider,
    private readonly realtime: RealtimeService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Kullanıcının bildirim tercihlerini yükle (varsayılanlarla birleştirilmiş).
   * Gönderim yolları bununla tercihe uyup uymadığını kontrol eder (Bulgu #9).
   * #224: alıcının kayıtlı dil tercihi de aynı sorguyla gelir — şablonlar bu
   * locale ile render edilir.
   */
  private async loadRecipientPrefs(
    userId: string,
  ): Promise<{ settings: NotificationSettings; locale: Locale }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationSettings: true, preferredLanguage: true },
    });
    return {
      settings: resolveSettings(user?.notificationSettings),
      locale: isLocale(user?.preferredLanguage) ? user.preferredLanguage : defaultLocale,
    };
  }

  /** Şablonu alıcının dilinde render et (ICU; eksik değerlerde anahtara düşer). */
  private renderTemplate(
    template: { titleKey: string; messageKey: string },
    locale: Locale,
    data?: Record<string, any>,
  ): { title: string; message: string } {
    const values = data as MessageValues | undefined;
    return {
      title: this.i18n.translate(template.titleKey, locale, values),
      message: this.i18n.translate(template.messageKey, locale, values),
    };
  }

  substituteTemplateVariables(text: string, data: Record<string, any>): string {
    return text.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const val = key.includes('.')
        ? key.split('.').reduce((o: any, k: string) => (o != null ? o[k] : undefined), data)
        : data[key];
      return val != null ? String(val) : `{{${key}}}`;
    });
  }

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

    // Kullanıcı bildirim tercihleri (Bulgu #9) + dil tercihi (#224).
    const { settings, locale } = await this.loadRecipientPrefs(dto.userId);

    // Render the catalog template in the recipient's locale (#224).
    const { title, message } = this.renderTemplate(template, locale, dto.data);

    // Determine channels (default to email + in_app)
    const channels = dto.channels || [NotificationChannel.EMAIL, NotificationChannel.IN_APP];

    const results: Record<string, boolean> = {};

    // Send to each channel using REAL providers
    for (const channel of channels) {
      if (!shouldDeliver(settings, dto.type, channel as unknown as DeliveryChannel)) {
        this.logger.log(
          `Notification suppressed by user preference: user=${dto.userId} type=${dto.type} channel=${channel}`,
        );
        results[channel] = false;
        continue;
      }
      switch (channel) {
        case NotificationChannel.EMAIL:
          results.email = await this.sendEmailReal(user.email, title, message, dto.data);
          await this.logNotification(dto.userId, 'email', dto.type, title, message, results.email);
          break;

        case NotificationChannel.PUSH:
          // `type`'ı push payload'ına ekle: mobil deep-link routing (push.ts
          // routeFromNotification) önce type'a bakıyor; yoksa tüm push'lar genel
          // bildirim sekmesine düşüyordu. dto.data zaten ilgili id'leri içeriyor.
          results.push = await this.sendPushReal(
            dto.userId,
            title,
            message,
            { ...dto.data, type: dto.type },
          );
          await this.logNotification(dto.userId, 'push', dto.type, title, message, results.push);
          break;

        case NotificationChannel.IN_APP:
          // saveInAppNotification already persists the canonical in_app row
          // (status='sent', with link+icon). Do NOT also call logNotification
          // here — it would write a second channel='in_app' row and
          // getInAppNotifications() would surface the notification twice in the
          // bell. logNotification is only a delivery tracker for the external
          // channels (email/push/sms).
          results.in_app = !!(await this.saveInAppNotification(dto.userId, dto.type, title, message, dto.data));
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
  ): Promise<string | null> {
    this.logger.log(`[saveInAppNotification] Saving for userId=${userId}, type=${type}`);
    try {
      const template = NOTIFICATION_TEMPLATES[type];
      let link = template?.link;
      
      // Interpolate link with data
      if (link && data) {
        link = this.interpolate(link, data);
      }

      // Collapse NEW_MESSAGE per thread: if the user already has an UNREAD
      // notification for this thread, update it (latest preview + count)
      // instead of stacking a new row for every message. Once read, the next
      // message starts a fresh notification.
      if (type === NotificationType.NEW_MESSAGE && data?.threadId) {
        const existing = await this.prisma.notificationLog.findFirst({
          where: {
            userId,
            channel: 'in_app',
            type,
            status: 'sent',
            data: { path: ['threadId'], equals: data.threadId },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          const previousCount =
            Number((existing.data as Record<string, any>)?.messageCount) || 1;
          const messageCount = previousCount + 1;
          const now = new Date();

          await this.prisma.notificationLog.update({
            where: { id: existing.id },
            data: {
              title: `${title} (${messageCount})`,
              body: message,
              data: {
                ...(data || {}),
                messageCount,
                icon: template?.icon,
                link,
              },
              sentAt: now,
              // Bell list is ordered by createdAt desc; bump so the
              // collapsed notification surfaces as the most recent one.
              createdAt: now,
            },
          });

          this.logger.log(
            `[saveInAppNotification] Collapsed into existing notification id=${existing.id} (messageCount=${messageCount})`,
          );
          return existing.id;
        }
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
      return notification.id;
    } catch (error) {
      this.logger.error(`[saveInAppNotification] Failed to save for ${userId}:`, error);
      return null;
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

    // Bildirim tercihleri (Bulgu #9). Kategori kapalıysa zil + push birlikte
    // atlanır; kategori açık ama push master kapalıysa yalnız push atlanır.
    const { settings, locale } = await this.loadRecipientPrefs(userId);
    if (!shouldDeliver(settings, type, 'in_app')) {
      this.logger.log(
        `[createInAppNotification] suppressed by user preference: user=${userId} type=${type}`,
      );
      return false;
    }

    // Şablonu alıcının dilinde render et (#224).
    const { title, message } = this.renderTemplate(template, locale, data);

    this.logger.log(`[createInAppNotification] Saving notification: title="${title}", message="${message}"`);

    const notificationId = await this.saveInAppNotification(userId, type, title, message, data);
    this.logger.log(`[createInAppNotification] Result: ${notificationId}`);

    if (notificationId) {
      try {
        this.realtime.emitNotification(userId, {
          id: notificationId,
          type,
          title,
          message,
          data,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        this.logger.warn(`[createInAppNotification] realtime emit failed: ${e}`);
      }
    }

    // Push: her in-app bildirimi aynı zamanda cihaza push olarak da gönder.
    // Bu tek nokta sayesinde createInAppNotification kullanan TÜM akışlar (mesaj,
    // teklif, takas, sipariş, rating, takip, beğeni, wishlist, iade...) push kazanır.
    // event.service ayrı pushQueue yolunu kullandığından çift-push olmaz.
    // type'ı data'ya ekliyoruz → mobil deep-link routing doğru ekrana gider.
    // Best-effort: push hatası in-app bildirimi etkilemez.
    // Push master anahtarı kapalıysa zil kalır ama cihaza push gönderilmez.
    if (shouldDeliver(settings, type, 'push')) {
      try {
        await this.sendPushReal(userId, title, message, { ...data, type });
      } catch (e) {
        this.logger.warn(`[createInAppNotification] push failed: ${e}`);
      }
    } else {
      this.logger.log(
        `[createInAppNotification] push suppressed by user preference: user=${userId} type=${type}`,
      );
    }

    return !!notificationId;
  }

  /**
   * Log notification to database for tracking
   */
  async logNotification(
    userId: string,
    channel: string,
    type: string,
    title: string,
    body: string,
    success: boolean,
  ): Promise<void> {
    // in_app notifications are persisted by saveInAppNotification (the
    // canonical store the bell reads). Guard against any caller logging an
    // in_app delivery row here, which would duplicate the notification.
    if (channel === 'in_app') return;
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
      // Logout path: the device asks us to deactivate its token instead of
      // registering it, so the user stops receiving push on a signed-out device.
      if (dto.revoke) {
        await this.expoPushProvider.deactivateToken(dto.token);
        return { success: true, userId, revoked: true };
      }

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

  async sendTemplateEmailToUser(userId: string, templateKey: string, templateData: Record<string, any>): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) return;
      await this.sendTemplateEmailToAddress(user.email, templateKey, templateData);
    } catch (err) {
      this.logger.error(`Failed to send ${templateKey} email to user ${userId}:`, err);
    }
  }

  async sendTemplateEmailToAddress(email: string, templateKey: string, templateData: Record<string, any>): Promise<void> {
    try {
      const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://tarodan.com';
      // Placeholder takma adları: göndericiler farklı anahtar adları geçebiliyor
      // (ör. welcome 'name'/'verifyUrl' geçer ama DB şablonu {{displayName}}/{{frontendUrl}}
      // bekler). Eşdeğer anahtarları doldur ki ham {{...}} kalmasın. Mevcut değerler
      // ezilmez (yalnız eksikse eklenir).
      const enriched: Record<string, any> = {
        frontendUrl,
        ...templateData,
      };
      if (enriched.displayName == null && enriched.name != null) enriched.displayName = enriched.name;
      if (enriched.name == null && enriched.displayName != null) enriched.name = enriched.displayName;
      templateData = enriched;
      const dbTemplate = await this.prisma.emailTemplate.findUnique({ where: { key: templateKey } });
      let html: string;
      let subject: string;
      if (dbTemplate?.bodyHtml) {
        html = this.substituteTemplateVariables(dbTemplate.bodyHtml, templateData);
        subject = dbTemplate.subject
          ? this.substituteTemplateVariables(dbTemplate.subject, templateData)
          : getEmailTemplateSubject(templateKey, templateData);
      } else {
        html = renderEmailTemplate(templateKey, templateData, frontendUrl);
        subject = getEmailTemplateSubject(templateKey, templateData);
      }
      if (this.sendGridProvider.isConfigured()) {
        await this.sendGridProvider.sendEmail({ to: email, subject, html });
      } else if (this.smtpProvider.isConfigured()) {
        await this.smtpProvider.sendEmail({ to: email, subject, html });
      }
    } catch (err) {
      this.logger.error(`Failed to send ${templateKey} email to ${email}:`, err);
    }
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
