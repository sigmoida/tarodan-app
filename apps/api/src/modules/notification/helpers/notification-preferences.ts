/**
 * Bildirim tercihleri uygulayıcı (tek kaynak).
 *
 * User.notificationSettings (Json) yalnızca kaydediliyordu; hiçbir gönderim
 * yolu okumuyordu (bkz. Bulgu #9). Bu modül, "bu kullanıcıya bu tipte
 * bildirim bu kanaldan gönderilsin mi?" kararını tek yerde toplar ve hem
 * notification.service hem push.worker tarafından kullanılır.
 *
 * Model:
 *  - Kanal master anahtarları: pushNotifications / emailNotifications /
 *    smsNotifications → ilgili kanalı tamamen açar/kapatır.
 *  - Kategori anahtarları: orderUpdates / messageAlerts / priceDropAlerts /
 *    newListingAlerts / marketingEmails → ilgili bildirim grubunu TÜM
 *    kanallarda (push + in-app/zil + email) açar/kapatır.
 *  - in-app (zil) için ayrı master yok: kategori kapalı değilse her zaman düşer.
 *  - ALWAYS_SEND tipleri (güvenlik/hesap/sistem) tercihten bağımsız gider.
 */
import { NotificationType } from "../dto/notification.dto";
import {
  NotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from "../../user/dto/notification-settings.dto";

export type DeliveryChannel = "push" | "email" | "sms" | "in_app";

export type PreferenceCategory =
  | "orderUpdates"
  | "messageAlerts"
  | "priceDropAlerts"
  | "newListingAlerts"
  | "marketingEmails";

/**
 * Tercihten bağımsız her zaman gönderilen tipler (güvenlik/hesap/sistem).
 * Mobil bilgi notuyla uyumlu: "Önemli güvenlik ve hesap bildirimleri her zaman
 * gönderilir." admin_broadcast string'i de buraya dahil (admin duyurusu).
 */
const ALWAYS_SEND = new Set<string>([
  NotificationType.PASSWORD_RESET,
  NotificationType.EMAIL_VERIFICATION,
  NotificationType.WELCOME,
  NotificationType.SYSTEM_ANNOUNCEMENT,
  NotificationType.SELLER_APPLICATION_APPROVED,
  NotificationType.SELLER_APPLICATION_REJECTED,
  "admin_broadcast",
]);

/**
 * Admin OPERASYON alarmları: önek eşlemesinden açıkça muaftır. Bunlar tüketici
 * bildirimi değil operasyon sinyalidir — orderUpdates'i kapatmış bir admin
 * "escrow takıldı / depo takıldı / iade incelemesi bekliyor" alarmlarını
 * kişisel tercihle SUSTURAMAMALIDIR (yalnız kanal master anahtarları etkiler).
 * CAMPAIGN_BUDGET_EXHAUSTED ve MODERATION_QUEUE_STALE önek yakalamadığı için
 * zaten muaftı; buradaki dört tip order/trade/refund önekleriyle
 * orderUpdates'e düşüyordu.
 */
const ADMIN_ALARM_TYPES = new Set<string>([
  NotificationType.ORDER_STUCK_IN_TRANSIT,
  NotificationType.TRADE_STUCK_AT_WAREHOUSE,
  NotificationType.TRADE_OUTBOUND_DELIVERY_MISSING,
  NotificationType.REFUND_REVIEW_REQUIRED_ADMIN,
]);

/**
 * Bir bildirim tipini kullanıcıya görünen tercih kategorisine eşler.
 * Eşlenmeyen tipler (sosyal, üyelik, ilan-süre, ürün onay, product_sold...)
 * kategori toggle'ına tabi DEĞİL — yalnız kanal master anahtarına tabidir.
 */
export function categoryForType(type: string): PreferenceCategory | null {
  if (ADMIN_ALARM_TYPES.has(type)) return null;

  if (type === NotificationType.NEW_MESSAGE) return "messageAlerts";

  if (
    type === NotificationType.PRICE_DROP ||
    type === NotificationType.BACK_IN_STOCK ||
    type.startsWith("wishlist")
  ) {
    return "priceDropAlerts";
  }

  if (type === NotificationType.SELLER_NEW_LISTING) return "newListingAlerts";

  if (
    type === NotificationType.PROMOTION ||
    type === NotificationType.SPECIAL_OFFER
  ) {
    return "marketingEmails";
  }

  // Ticaret akışı: sipariş / teklif / takas / iade / ödeme
  if (
    type.startsWith("order") ||
    type.startsWith("offer") ||
    type.startsWith("trade") ||
    type.startsWith("refund") ||
    type.startsWith("payment")
  ) {
    return "orderUpdates";
  }

  return null;
}

/** Ham notificationSettings (Json|null) → varsayılanlarla birleştirilmiş tam nesne. */
export function resolveSettings(raw: unknown): NotificationSettings {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...((raw as Partial<NotificationSettings> | null) ?? {}),
  };
}

/**
 * Bu tip+kanal için kullanıcı tercihine göre gönderilmeli mi?
 * `false` döndürdüyse o kanaldan gönderim atlanmalıdır.
 */
export function shouldDeliver(
  settings: NotificationSettings,
  type: string,
  channel: DeliveryChannel,
): boolean {
  if (ALWAYS_SEND.has(type)) return true;

  const category = categoryForType(type);
  if (category && settings[category] === false) return false;

  switch (channel) {
    case "push":
      return settings.pushNotifications !== false;
    case "email":
      return settings.emailNotifications !== false;
    case "sms":
      return settings.smsNotifications !== false;
    case "in_app":
    default:
      return true;
  }
}
