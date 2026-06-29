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
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../websocket/realtime.service';
import { renderEmailTemplate, getEmailTemplateSubject } from '../../common/helpers/email-template-renderer';
import {
  resolveSettings,
  shouldDeliver,
  DeliveryChannel,
} from './notification-preferences';
import { NotificationSettings } from '../user/dto/notification-settings.dto';

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
    message: 'Siparişiniz teslim edildi; teslim tarihinden itibaren 14 gün içinde koşulsuz iade hakkınız var.',
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
  [NotificationType.ORDER_CANCELLED_OUT_OF_STOCK]: {
    title: 'Siparişiniz iptal edildi: stok tükendi',
    message: '{{productTitle}} adlı ürün başka bir alıcı tarafından satın alındı. Benzer ürünlere göz atabilirsiniz.',
    icon: '❌',
    link: '/products/unavailable/{{productId}}',
  },
  [NotificationType.ORDER_REFUNDED]: {
    title: 'İade İşlemi Tamamlandı',
    message: 'Ödemeniz iade edildi. {{amount}} TL hesabınıza aktarılacak.',
    icon: '💰',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_PREPARING_DEADLINE_WARNING]: {
    title: 'Kargo Süresi Dolmak Üzere',
    message: '"{{productTitle}}" siparişini {{deadline}} tarihine kadar kargoya vermeniz gerekmektedir. Aksi halde sipariş otomatik iptal edilecektir.',
    icon: '⚠️',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_RESERVATION_RELEASED]: {
    title: 'Stok rezervasyonunuz kaldırıldı',
    message: '{{productTitle}} için 30 dakika içinde ödeme tamamlanmadığı için stok rezervasyonu kaldırıldı. Ürün stoktaysa 24 saat içinde tekrar ödeme yapabilirsiniz.',
    icon: '⏳',
    link: '/orders/{{orderId}}',
  },

  // 48h pencere (Faz 3B.1)
  [NotificationType.ORDER_DELIVERED_CONFIRM]: {
    title: 'Siparişin teslim edildi',
    message: 'Siparişiniz teslim edildi; teslim tarihinden itibaren 14 gün içinde koşulsuz iade hakkınız var. Süre dolunca sipariş otomatik tamamlanır.',
    icon: '📦',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_AUTO_COMPLETED]: {
    title: 'Sipariş otomatik tamamlandı',
    message: '48 saatlik kontrol süresi doldu; sipariş tamamlandı.',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_MANUALLY_CONFIRMED]: {
    title: 'Alıcı siparişini onayladı',
    message: 'Alıcı siparişi onayladı. Ödemeniz, teslimden 14 gün sonra (iade süresi dolunca) hesabınıza aktarılır.',
    icon: '💸',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN]: {
    title: 'Sipariş yönetici tarafından tamamlandı',
    message: 'Bir yönetici siparişini manuel olarak tamamladı.',
    icon: '🛡️',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.SELLER_DID_NOT_SHIP_REFUNDED]: {
    title: 'Sipariş iptal edildi',
    message: 'Satıcı belirlenen süre içinde kargoya vermediği için sipariş iptal edildi ve tam iade işlemi başlatıldı.',
    icon: '↩️',
    link: '/orders/{{orderId}}',
  },

  // Offer notifications
  [NotificationType.OFFER_RECEIVED]: {
    title: 'Yeni Teklif Aldınız',
    message: '{{productTitle}} ürününüz için {{amount}} TL teklif aldınız.',
    icon: '💵',
    link: '/offers?tab=received',
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
    link: '/offers?tab=sent',
  },
  [NotificationType.OFFER_COUNTER_DECLINED]: {
    title: 'Karşı Teklif Reddedildi',
    message: '{{productTitle}} için alıcı karşı teklifinizi kabul etmedi.',
    icon: '❌',
    link: '/listings/{{productId}}',
  },
  [NotificationType.OFFER_EXPIRED]: {
    title: 'Teklifin Süresi Doldu',
    message: '{{productTitle}} için teklifinizin süresi doldu.',
    icon: '⏰',
    link: '/listings/{{productId}}',
  },
  [NotificationType.OFFER_CANCELLED_OUT_OF_STOCK]: {
    title: 'Teklifiniz iptal edildi: ürün stokta kalmadı',
    message: '{{productTitle}} adlı ürün için verdiğiniz teklif, ürün satıldığı için iptal edildi.',
    icon: '❌',
    link: '/products/unavailable/{{productId}}',
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
    // Messages live on a single /messages page that opens a thread via ?thread=<id>.
    // There is no /messages/<id> route, so a path-style link would 404.
    link: '/messages?thread={{threadId}}',
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
  [NotificationType.BOOST_EXPIRED]: {
    title: '🚀 Öne çıkarma süresi doldu',
    message:
      '"{{productTitle}}" ilanının öne çıkarması bitti. Otomatik yenileme açıktı — tek tıkla yeniden öne çıkar.',
    icon: '🚀',
    link: '/profile/listings',
  },
  [NotificationType.TRADE_AUTO_CANCELLED]: {
    title: 'Takas Otomatik İptal Edildi',
    message: '{{cancelReason}}',
    icon: '🔄',
    link: '/trades',
  },
  [NotificationType.TRADE_STUCK_AT_WAREHOUSE]: {
    title: 'Sıkışmış Takas — Yönetim Gerekli',
    message:
      '{{tradeNumber}} takası depoya ulaştı fakat süresi doldu; elle force-cancel-stuck gerekiyor.',
    icon: '⚠️',
    link: '/trades',
  },
  [NotificationType.OFFER_AUTO_REJECTED]: {
    title: 'Teklifiniz Kapatıldı',
    message: '{{cancelReason}}',
    icon: '💰',
    link: '/offers',
  },
  [NotificationType.RESERVATION_EXPIRED]: {
    title: 'Sipariş Süresi Doldu',
    message: 'Siparişinizin ödeme süresi dolduğu için otomatik olarak iptal edildi.',
    icon: '⏰',
    link: '/orders',
  },
  [NotificationType.REFUND_CANCELLED]: {
    title: 'İade Talebi İptal Edildi',
    message: 'Alıcı {{refundNumber}} numaralı iade talebini iptal etti.',
    icon: '↩️',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_APPROVED]: {
    title: 'İade Talebiniz Onaylandı',
    message: '{{refundNumber}} numaralı iade talebiniz onaylandı.',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_REJECTED]: {
    title: 'İade Talebiniz Reddedildi',
    message: '{{refundNumber}} numaralı iade talebiniz reddedildi: {{reason}}',
    icon: '❌',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_DISPUTED]: {
    title: 'İade İtirazı İnceleniyor',
    message: '{{refundNumber}} numaralı iade talebine itiraz edildi; admin incelemesi bekleniyor.',
    icon: '⚖️',
    link: '/refund-requests/{{refundRequestId}}',
  },
  [NotificationType.REFUND_RETURN_OPENED]: {
    title: 'İade Kargosu Hazır',
    message: '{{trackingNumber}} numarasıyla ürünü en yakın Sürat şubesine teslim edebilirsiniz.',
    icon: '📦',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_COMPLETED]: {
    title: 'İadeniz Tamamlandı',
    message: '{{refundNumber}} numaralı iadeniz hesabınıza yansıtıldı.',
    icon: '💰',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_REQUEST_RECEIVED]: {
    title: 'İade Talebiniz Alındı',
    message: '{{refundNumber}} numaralı iade talebiniz alındı, satıcı yanıtı bekleniyor.',
    icon: '📨',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_SHIPPED_SELLER]: {
    title: 'İade Kargosu Yola Çıktı',
    message: 'Alıcı {{refundNumber}} numaralı iade için ürünü kargoya verdi; ürün size geliyor.',
    icon: '📦',
    link: '/sales/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_IN_TRANSIT]: {
    title: 'İade Kargonuz Yolda',
    message: '{{refundNumber}} numaralı iade ürününüz satıcıya doğru yolda.',
    icon: '🚚',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_DELIVERED_BUYER]: {
    title: 'İadeniz Satıcıya Ulaştı',
    message: '{{refundNumber}} numaralı iade ürününüz satıcıya teslim edildi; para iadeniz kısa sürede yapılacak.',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_DELIVERED_SELLER]: {
    title: 'İade Ürünü Size Ulaştı',
    message: '{{refundNumber}} numaralı iade ürünü size teslim edildi.',
    icon: '📥',
    link: '/sales/{{orderId}}',
  },
  [NotificationType.REFUND_COMPLETED_SELLER]: {
    title: 'İade Tamamlandı',
    message: '{{refundNumber}} numaralı sipariş için iade tamamlandı; tutar alıcıya iade edildi.',
    icon: '↩️',
    link: '/sales/{{orderId}}',
  },
  [NotificationType.REFUND_AUTO_ACCEPTED_SELLER]: {
    title: 'İade Talebi Otomatik Onaylandı',
    message: '{{refundNumber}} numaralı iade talebine 48 saat içinde yanıt verilmediği için otomatik onaylandı.',
    icon: '⏰',
    link: '/sales/{{orderId}}',
  },

  // Seller application notifications
  [NotificationType.SELLER_APPLICATION_APPROVED]: {
    title: 'Kurumsal Başvurunuz Onaylandı! 🎉',
    message: 'Kurumsal hesap başvurunuz onaylandı. Artık satıcı olarak ürün listeleyebilirsiniz.',
    icon: '✅',
    link: '/profile',
  },
  [NotificationType.SELLER_APPLICATION_REJECTED]: {
    title: 'Kurumsal Başvurunuz Reddedildi',
    message: 'Kurumsal hesap başvurunuz reddedildi.{{reason}}',
    icon: '❌',
    link: '/profile',
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
    private readonly storageService: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Kullanıcının bildirim tercihlerini yükle (varsayılanlarla birleştirilmiş).
   * Gönderim yolları bununla tercihe uyup uymadığını kontrol eder (Bulgu #9).
   */
  private async loadNotificationSettings(userId: string): Promise<NotificationSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationSettings: true },
    });
    return resolveSettings(user?.notificationSettings);
  }

  private substituteTemplateVariables(text: string, data: Record<string, any>): string {
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

    // Interpolate template with data
    const title = this.interpolate(template.title, dto.data);
    const message = this.interpolate(template.message, dto.data);

    // Determine channels (default to email + in_app)
    const channels = dto.channels || [NotificationChannel.EMAIL, NotificationChannel.IN_APP];

    // Kullanıcı bildirim tercihleri (Bulgu #9): kapatılan kanal/kategori atlanır.
    const settings = await this.loadNotificationSettings(dto.userId);

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
    const settings = await this.loadNotificationSettings(userId);
    if (!shouldDeliver(settings, type, 'in_app')) {
      this.logger.log(
        `[createInAppNotification] suppressed by user preference: user=${userId} type=${type}`,
      );
      return false;
    }

    const title = this.interpolate(template.title, data);
    const message = this.interpolate(template.message, data);

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
  private async logNotification(
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

  // ==================== CONVENIENCE METHODS ====================

  /**
   * Send order notification
   */
  async notifyOrderCreated(buyerId: string, orderId: string, amount: number) {
    await this.send({
      userId: buyerId,
      type: NotificationType.ORDER_CREATED,
      channels: [NotificationChannel.IN_APP],
      data: { orderId, amount },
    });
    // Template email — fetch order details for rich content
    const [user, order] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: buyerId }, select: { displayName: true } }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true, totalAmount: true, product: { select: { title: true } } },
      }),
    ]);
    await this.sendTemplateEmailToUser(buyerId, 'order-created-buyer', {
      buyerName: user?.displayName || '',
      orderNumber: order?.orderNumber || '',
      productTitle: order?.product?.title || '',
      totalAmount: order?.totalAmount ? Number(order.totalAmount) : amount,
      orderId,
    });
  }

  async notifyOrderPaid(sellerId: string, orderId: string, amount: number) {
    return this.send({
      userId: sellerId,
      type: NotificationType.ORDER_PAID,
      channels: [NotificationChannel.IN_APP],
      data: { orderId, amount },
    });
  }

  async notifyOrderShipped(buyerId: string, orderId: string, trackingNumber: string) {
    return this.send({
      userId: buyerId,
      type: NotificationType.ORDER_SHIPPED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId, trackingNumber },
    });
  }

  // ---------- 48h pencere (Faz 3B.1) ----------

  async notifyOrderDeliveredConfirm(
    buyerId: string,
    orderId: string,
    confirmationDeadline: Date,
  ) {
    return this.send({
      userId: buyerId,
      type: NotificationType.ORDER_DELIVERED_CONFIRM,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId, confirmationDeadline: confirmationDeadline.toISOString() },
    });
  }

  async notifyOrderAutoCompleted(userId: string, orderId: string) {
    return this.send({
      userId,
      type: NotificationType.ORDER_AUTO_COMPLETED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId },
    });
  }

  async notifyOrderManuallyConfirmed(sellerId: string, orderId: string) {
    return this.send({
      userId: sellerId,
      type: NotificationType.ORDER_MANUALLY_CONFIRMED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId },
    });
  }

  async notifyOrderForceCompletedByAdmin(
    userId: string,
    orderId: string,
    reason?: string,
  ) {
    return this.send({
      userId,
      type: NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId, reason },
    });
  }

  async notifySellerDidNotShipRefunded(buyerId: string, orderId: string) {
    await this.send({
      userId: buyerId,
      type: NotificationType.SELLER_DID_NOT_SHIP_REFUNDED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId },
    });
    const [user, order] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: buyerId }, select: { displayName: true } }),
      this.prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, totalAmount: true } }),
    ]);
    await this.sendTemplateEmailToUser(buyerId, 'seller-did-not-ship-refunded', {
      name: user?.displayName || '',
      orderNumber: order?.orderNumber || orderId,
      orderId,
      refundAmount: order?.totalAmount ? Number(order.totalAmount) : 0,
    });
  }

  /**
   * Send offer notification
   */
  async notifyOfferReceived(sellerId: string, productId: string, amount: number) {
    return this.send({
      userId: sellerId,
      type: NotificationType.OFFER_RECEIVED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId, amount },
    });
  }

  async notifyOfferAccepted(buyerId: string, productId: string, amount: number) {
    return this.send({
      userId: buyerId,
      type: NotificationType.OFFER_ACCEPTED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId, amount },
    });
  }

  /**
   * Stockout cancel + back-in-stock bildirimleri için ortak data payload'ı
   * üretir. Frontend `/products/unavailable/[productId]` sayfasında ek fetch
   * yapmadan thumbnail + kategori bilgisini render edebilsin diye burada
   * tek seferde toparlanır.
   */
  private async buildStockoutData(productId: string): Promise<{
    productId: string;
    productTitle: string;
    productImage: string | null;
    categoryId: string | null;
    categorySlug: string | null;
    categoryName: string | null;
  }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        title: true,
        categoryId: true,
        category: { select: { slug: true, name: true } },
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { cardKey: true },
        },
      },
    });
    const cardKey = product?.images[0]?.cardKey ?? null;
    return {
      productId,
      productTitle: product?.title ?? '',
      // Resolve to a public URL — clients (notification bell, unavailable
      // page) can render <img src=...> directly. Without this, they'd get
      // a raw S3 key like "products/abc/card.jpg" which won't load.
      productImage: cardKey ? this.storageService.getPublicAssetUrl(cardKey) : null,
      categoryId: product?.categoryId ?? null,
      categorySlug: product?.category?.slug ?? null,
      categoryName: product?.category?.name ?? null,
    };
  }

  async notifyOrderCancelledOutOfStock(
    buyerId: string, productId: string, _productTitle: string, _categoryId: string | null,
  ) {
    const data = await this.buildStockoutData(productId);
    return this.send({
      userId: buyerId,
      type: NotificationType.ORDER_CANCELLED_OUT_OF_STOCK,
      data,
    });
  }

  async notifyOfferCancelledOutOfStock(
    buyerId: string, productId: string, _productTitle: string, _categoryId: string | null,
  ) {
    const data = await this.buildStockoutData(productId);
    return this.send({
      userId: buyerId,
      type: NotificationType.OFFER_CANCELLED_OUT_OF_STOCK,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data,
    });
  }

  async notifyReservationReleased(
    buyerId: string, orderId: string, productTitle: string,
  ) {
    return this.send({
      userId: buyerId,
      type: NotificationType.ORDER_RESERVATION_RELEASED,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data: { orderId, productTitle },
    });
  }

  async notifyOrderPaymentExpired(
    buyerId: string, orderId: string, productTitle: string,
  ) {
    return this.send({
      userId: buyerId,
      type: NotificationType.ORDER_CANCELLED,
      data: { orderId, productTitle },
    });
  }

  /**
   * Sipariş iptali e-postaları: alıcıya `order-cancelled-buyer`, satıcıya
   * `order-cancelled-seller`. Stokout oto-iptal ve ödeme-süresi-doldu
   * senaryolarında çağrılır (in-app/push bildirimler ayrıca gönderilir; bu
   * metod yalnız e-posta fan-out'u yapar). Bu senaryolarda alıcıdan ücret
   * tahsil edilmediği için refundAmount geçilmez. Asla throw etmez.
   */
  async sendOrderCancelledEmails(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          cancelReason: true,
          buyerId: true,
          sellerId: true,
          product: { select: { title: true } },
          buyer: { select: { displayName: true } },
          seller: { select: { displayName: true } },
        },
      });
      if (!order) return;
      const reason = order.cancelReason ?? undefined;
      const productTitle = order.product?.title ?? '';

      await this.sendTemplateEmailToUser(order.buyerId, 'order-cancelled-buyer', {
        buyerName: order.buyer?.displayName ?? '',
        orderNumber: order.orderNumber,
        orderId: order.id,
        productTitle,
        reason,
      });

      if (order.sellerId) {
        await this.sendTemplateEmailToUser(order.sellerId, 'order-cancelled-seller', {
          sellerName: order.seller?.displayName ?? '',
          orderNumber: order.orderNumber,
          orderId: order.id,
          productTitle,
          reason,
        });
      }
    } catch (err: any) {
      this.logger.warn(`sendOrderCancelledEmails failed for order ${orderId}: ${err?.message}`);
    }
  }

  /**
   * Fan-out helper: send BACK_IN_STOCK to wishlist users ∪ stockout-cancelled
   * buyers (last 7 days). 24h per (user, product) debounce.
   *
   * Caller should only invoke this when product availability transitions
   * from <=0 to >0 (admin restock, refund, payment failure release).
   */
  async broadcastBackInStock(productId: string, productTitle: string): Promise<void> {
    const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const STOCKOUT_REASONS = [
      'Stok tükendi',
      'Stok tükendiği için otomatik iptal edildi',
    ];

    const [wishlistItems, cancelledOrders, cancelledOffers] = await Promise.all([
      this.prisma.wishlistItem.findMany({
        where: { productId },
        include: { wishlist: { select: { userId: true } } },
      }),
      this.prisma.order.findMany({
        where: {
          productId,
          status: 'cancelled' as any,
          cancelReason: { in: STOCKOUT_REASONS },
          updatedAt: { gte: SEVEN_DAYS_AGO },
        },
        select: { buyerId: true },
      }),
      this.prisma.offer.findMany({
        where: {
          productId,
          status: 'cancelled' as any,
          cancelReason: { in: STOCKOUT_REASONS },
          updatedAt: { gte: SEVEN_DAYS_AGO },
        },
        select: { buyerId: true },
      }),
    ]);

    const userIds = Array.from(
      new Set(
        [
          ...wishlistItems.map((w) => w.wishlist.userId),
          ...cancelledOrders.map((o) => o.buyerId),
          ...cancelledOffers.map((o) => o.buyerId),
        ].filter(Boolean),
      ),
    );
    if (userIds.length === 0) return;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.notificationLog.findMany({
      where: {
        userId: { in: userIds },
        type: NotificationType.BACK_IN_STOCK as any,
        channel: 'in_app',
        createdAt: { gte: since },
      },
      select: { userId: true, data: true },
    });
    const debounced = new Set(
      recent
        .filter((row) => (row.data as any)?.productId === productId)
        .map((row) => row.userId),
    );

    for (const userId of userIds) {
      if (debounced.has(userId)) continue;
      try {
        await this.notifyBackInStock(userId, productId, productTitle);
      } catch (err: any) {
        this.logger.warn(
          `broadcastBackInStock failed for user ${userId} product ${productId}: ${err?.message}`,
        );
      }
    }
  }

  async notifyBackInStock(userId: string, productId: string, _productTitle: string) {
    // Enrich payload (productImage, categorySlug, ...) so the notification
    // bell can render a thumbnail and the click-through can land on the
    // unavailable-page back-in-stock variant without an extra fetch.
    const data = await this.buildStockoutData(productId);
    const result = await this.send({
      userId,
      type: NotificationType.BACK_IN_STOCK,
      data,
    });
    // "Stoğa geri geldi" e-postası — in-app/push'un yanında markalı mail.
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://tarodan.com';
    await this.sendTemplateEmailToUser(userId, 'back-in-stock', {
      productTitle: data.productTitle,
      productUrl: `${frontendUrl}/products/${productId}`,
    });
    return result;
  }

  /**
   * Send trade notifications
   */
  async notifyTradeReceived(receiverId: string, tradeId: string) {
    await this.send({
      userId: receiverId,
      type: NotificationType.TRADE_RECEIVED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId },
    });
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://tarodan.com';
    const user = await this.prisma.user.findUnique({ where: { id: receiverId }, select: { displayName: true } });
    await this.sendTemplateEmailToUser(receiverId, 'trade-received', {
      name: user?.displayName || '',
      tradeId,
      tradeUrl: `${frontendUrl}/trades/${tradeId}`,
    });
  }

  async notifyTradeAccepted(initiatorId: string, tradeId: string) {
    await this.send({
      userId: initiatorId,
      type: NotificationType.TRADE_ACCEPTED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP, NotificationChannel.SMS],
      data: { tradeId },
    });
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://tarodan.com';
    const user = await this.prisma.user.findUnique({ where: { id: initiatorId }, select: { displayName: true } });
    await this.sendTemplateEmailToUser(initiatorId, 'trade-accepted', {
      name: user?.displayName || '',
      tradeId,
      tradeUrl: `${frontendUrl}/trades/${tradeId}`,
    });
  }

  async notifyTradeShipped(receiverId: string, tradeId: string, trackingNumber: string) {
    await this.send({
      userId: receiverId,
      type: NotificationType.TRADE_SHIPPED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId, trackingNumber },
    });
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://tarodan.com';
    const user = await this.prisma.user.findUnique({ where: { id: receiverId }, select: { displayName: true } });
    await this.sendTemplateEmailToUser(receiverId, 'trade-shipped', {
      name: user?.displayName || '',
      trackingNumber,
      tradeId,
      tradeUrl: `${frontendUrl}/trades/${tradeId}`,
    });
  }

  async notifyTradeCompleted(userId: string, tradeId: string) {
    await this.send({
      userId,
      type: NotificationType.TRADE_COMPLETED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId },
    });
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://tarodan.com';
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    await this.sendTemplateEmailToUser(userId, 'trade-completed', {
      name: user?.displayName || '',
      tradeId,
      tradeUrl: `${frontendUrl}/trades/${tradeId}`,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) return { success: false, error: 'User not found' };
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://tarodan.com';
    await this.sendTemplateEmailToAddress(user.email, 'welcome', {
      name: user.displayName || '',
      verifyUrl: `${frontendUrl}/listings`,
    });
    return { success: true };
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
    const templateData = { name: user.displayName || '', resetUrl };

    const dbTemplate = await this.prisma.emailTemplate.findUnique({ where: { key: 'password-reset' } });
    let html: string;
    let subject: string;
    if (dbTemplate?.bodyHtml) {
      html = this.substituteTemplateVariables(dbTemplate.bodyHtml, templateData);
      subject = dbTemplate.subject
        ? this.substituteTemplateVariables(dbTemplate.subject, templateData)
        : getEmailTemplateSubject('password-reset', templateData);
    } else {
      html = renderEmailTemplate('password-reset', templateData, frontendUrl);
      subject = getEmailTemplateSubject('password-reset', templateData);
    }

    let result;
    if (this.sendGridProvider.isConfigured()) {
      result = await this.sendGridProvider.sendEmail({ to: user.email, subject, html });
    } else if (this.smtpProvider.isConfigured()) {
      result = await this.smtpProvider.sendEmail({ to: user.email, subject, html });
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
    const templateData = { name: user.displayName || '', verificationUrl: verifyUrl, expiresIn: '24 saat' };

    const dbTemplate = await this.prisma.emailTemplate.findUnique({ where: { key: 'email-verification' } });
    let html: string;
    let subject: string;
    if (dbTemplate?.bodyHtml) {
      html = this.substituteTemplateVariables(dbTemplate.bodyHtml, templateData);
      subject = dbTemplate.subject
        ? this.substituteTemplateVariables(dbTemplate.subject, templateData)
        : getEmailTemplateSubject('email-verification', templateData);
    } else {
      html = renderEmailTemplate('email-verification', templateData, frontendUrl);
      subject = getEmailTemplateSubject('email-verification', templateData);
    }

    let result;
    if (this.sendGridProvider.isConfigured()) {
      result = await this.sendGridProvider.sendEmail({ to: user.email, subject, html });
    } else if (this.smtpProvider.isConfigured()) {
      result = await this.smtpProvider.sendEmail({ to: user.email, subject, html });
    } else {
      this.logger.warn('Neither SendGrid nor SMTP is configured for email verification');
      result = { success: false, error: 'No email provider configured' };
    }

    await this.logNotification(userId, 'email', 'email_verification', 'E-posta Doğrulama', '', result.success);

    return result;
  }

  /**
   * Misafir checkout — 6 haneli OTP e-postası (kayıtlı hesap doğrulamasından bağımsız)
   */
  async sendGuestCheckoutVerificationCode(email: string, code: string, ttlSeconds: number) {
    await this.sendTemplateEmailToAddress(email, 'guest-checkout-otp', {
      code,
      expiresInMinutes: Math.ceil(ttlSeconds / 60),
    });
    return { success: true };
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

  private async sendTemplateEmailToAddress(email: string, templateKey: string, templateData: Record<string, any>): Promise<void> {
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
