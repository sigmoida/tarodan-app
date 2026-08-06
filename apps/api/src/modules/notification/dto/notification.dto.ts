import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsObject,
  IsBoolean,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";
import { isSafeFreeLink } from "../notification-link-safety";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum NotificationType {
  // Order notifications
  ORDER_CREATED = "order_created",
  ORDER_PAID = "order_paid",
  ORDER_SHIPPED = "order_shipped",
  ORDER_DELIVERED = "order_delivered",
  ORDER_COMPLETED = "order_completed",
  ORDER_CANCELLED = "order_cancelled",
  ORDER_CANCELLED_SELLER = "order_cancelled_seller",
  ORDER_CANCELLED_OUT_OF_STOCK = "order_cancelled_out_of_stock",
  ORDER_REFUNDED = "order_refunded",
  ORDER_PREPARING_DEADLINE_WARNING = "order_preparing_deadline_warning",
  ORDER_RESERVATION_RELEASED = "order_reservation_released",
  // 48h pencere (Faz 3B.1)
  ORDER_DELIVERED_CONFIRM = "order_delivered_confirm",
  ORDER_AUTO_COMPLETED = "order_auto_completed",
  ORDER_MANUALLY_CONFIRMED = "order_manually_confirmed",
  ORDER_FORCE_COMPLETED_BY_ADMIN = "order_force_completed_by_admin",
  SELLER_DID_NOT_SHIP_REFUNDED = "seller_did_not_ship_refunded",

  // Offer notifications
  OFFER_RECEIVED = "offer_received",
  OFFER_ACCEPTED = "offer_accepted",
  OFFER_REJECTED = "offer_rejected",
  OFFER_COUNTER = "offer_counter",
  OFFER_COUNTER_DECLINED = "offer_counter_declined",
  OFFER_EXPIRED = "offer_expired",
  OFFER_CANCELLED_OUT_OF_STOCK = "offer_cancelled_out_of_stock",

  // Product notifications
  PRODUCT_APPROVED = "product_approved",
  PRODUCT_REJECTED = "product_rejected",
  PRODUCT_SOLD = "product_sold",

  // Payment notifications
  PAYMENT_RECEIVED = "payment_received",
  PAYMENT_RELEASED = "payment_released",

  // Trade notifications
  TRADE_RECEIVED = "trade_received",
  TRADE_ACCEPTED = "trade_accepted",
  TRADE_REJECTED = "trade_rejected",
  TRADE_COUNTER = "trade_counter",
  TRADE_SHIPPED = "trade_shipped",
  TRADE_COMPLETED = "trade_completed",
  TRADE_AUTO_CANCELLED = "trade_auto_cancelled",
  // Admin uyarısı: takas depoya ulaştı ama süresi doldu — elle force-cancel-stuck gerekiyor.
  TRADE_STUCK_AT_WAREHOUSE = "trade_stuck_at_warehouse",
  // Takas kargosu başlatılamadı: tarafın kayıtlı adresi yok — kullanıcı adres eklemeli
  // (adres eklenince reconciliation cron kargoyu otomatik oluşturur).
  TRADE_ADDRESS_REQUIRED = "trade_address_required",
  // Kargo kodu gecikmeli oluştuğunda (retry job doldurunca) gönderene haber ver —
  // şubeye boşa gitmesin (insani senaryo A2/C24).
  CARGO_CODE_READY = "cargo_code_ready",
  // Satıcı "kargoya verdim" işaretledi ama Sürat'ta kayıt yok (insani senaryo A9) —
  // hatırlatma; deadline atlatma girişimlerini de görünür kılar.
  CARGO_MOVEMENT_MISSING = "cargo_movement_missing",

  // RefundRequest notifications (sipariş iadesi akışı)
  REFUND_CANCELLED = "refund_cancelled",
  REFUND_APPROVED = "refund_approved",
  // REFUND_REJECTED / REFUND_DISPUTED kaldırıldı: satıcı inceleme + itiraz akışı
  // kaldırıldığından (iade artık tam otomatik) bu bildirim tipleri hiç üretilmiyordu.
  REFUND_RETURN_OPENED = "refund_return_opened",
  REFUND_COMPLETED = "refund_completed",
  // İade akışı — eksik adımlar (satıcı tarafı + kargo takip + talep onayı)
  REFUND_REQUEST_RECEIVED = "refund_request_received",
  REFUND_RETURN_SHIPPED_SELLER = "refund_return_shipped_seller",
  REFUND_RETURN_IN_TRANSIT = "refund_return_in_transit",
  REFUND_RETURN_DELIVERED_BUYER = "refund_return_delivered_buyer",
  REFUND_RETURN_DELIVERED_SELLER = "refund_return_delivered_seller",
  REFUND_COMPLETED_SELLER = "refund_completed_seller",
  REFUND_AUTO_ACCEPTED_SELLER = "refund_auto_accepted_seller",

  // Cross-flow auto-rejection
  OFFER_AUTO_REJECTED = "offer_auto_rejected",
  RESERVATION_EXPIRED = "reservation_expired",

  // Messaging notifications
  NEW_MESSAGE = "new_message",

  // Wishlist/Favorites notifications
  PRICE_DROP = "price_drop",
  WISHLIST_ITEM_SOLD = "wishlist_item_sold",
  WISHLIST_SOLD = "wishlist_sold",
  BACK_IN_STOCK = "back_in_stock",

  // Social notifications
  NEW_FOLLOWER = "new_follower",
  SELLER_NEW_LISTING = "seller_new_listing",
  COLLECTION_LIKED = "collection_liked",
  PRODUCT_LIKED = "product_liked",

  // Review notifications
  REVIEW_RECEIVED = "review_received",

  // Membership notifications
  MEMBERSHIP_EXPIRING = "membership_expiring",
  MEMBERSHIP_EXPIRED = "membership_expired",
  MEMBERSHIP_UPGRADED = "membership_upgraded",

  // Listing notifications
  LISTING_EXPIRING = "listing_expiring",
  LISTING_EXPIRED = "listing_expired",
  LISTING_VIEWS_MILESTONE = "listing_views_milestone",
  BOOST_EXPIRED = "boost_expired",

  // Promotion notifications
  PROMOTION = "promotion",
  SPECIAL_OFFER = "special_offer",

  // Seller application notifications
  SELLER_APPLICATION_APPROVED = "seller_application_approved",
  SELLER_APPLICATION_REJECTED = "seller_application_rejected",

  // General
  WELCOME = "welcome",
  PASSWORD_RESET = "password_reset",
  EMAIL_VERIFICATION = "email_verification",
  SYSTEM_ANNOUNCEMENT = "system_announcement",
  ADMIN_BROADCAST = "admin_broadcast",

  // EventService bunları KALICI olarak yazıyordu ama enum'da yoktu: push
  // worker'daki `as NotificationType` cast'i derlemeyi susturuyor, resolver
  // bilmediği tip için null dönüyor ve bildirim LİNKSİZ kaydediliyordu.
  // Cast kaldırıldı; kalıcı yazılabilen her tip artık burada.
  PAYMENT_CONFIRMED = "payment_confirmed",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_REFUNDED = "payment_refunded",
  TRADE_READY_FOR_SHIPPING = "trade_ready_for_shipping",
  TRADE_WAREHOUSE_APPROVED = "trade_warehouse_approved",
  TRADE_WAREHOUSE_REJECTED = "trade_warehouse_rejected",
  TRADE_CANCEL_LOCKED = "trade_cancel_locked",
  TRADE_RETURN_COMPLETED = "trade_return_completed",
  TRADE_RETURN_LOST = "trade_return_lost",
  TRADE_REFUND_FAILED = "trade_refund_failed",
  TRADE_REFUND_COMPLETED = "trade_refund_completed",
}

export enum NotificationChannel {
  EMAIL = "email",
  PUSH = "push",
  SMS = "sms",
  IN_APP = "in_app",
}

/**
 * Serbest link taşıyan bildirimlerde (kampanya, özel teklif, sistem duyurusu,
 * yönetici yayını) hedef DIŞARIDAN gelir. DTO sınırında doğrulanmazsa
 * `javascript:` ya da başka bir siteye giden bir adres kaydedilip kullanıcıya
 * tıklatılabilirdi. Yalnız HTTPS veya site-içi mutlak yol kabul edilir.
 */
@ValidatorConstraint({ name: "SafeNotificationLinkData", async: false })
export class SafeNotificationLinkData implements ValidatorConstraintInterface {
  private static readonly LINK_KEYS = [
    "link",
    "promotionLink",
    "offerLink",
    "announcementLink",
  ];

  validate(value: unknown): boolean {
    if (!value || typeof value !== "object") return true;
    const data = value as Record<string, unknown>;
    return SafeNotificationLinkData.LINK_KEYS.every((key) => {
      const link = data[key];
      if (link === undefined || link === null) return true;
      return typeof link === "string" && isSafeFreeLink(link);
    });
  }

  defaultMessage(): string {
    return "Bildirim linki yalnız https:// ile başlayabilir ya da / ile başlayan site içi bir yol olabilir";
  }
}

export class SendNotificationDto {
  @ApiProperty({
    example: "uuid-user-id",
    description: "Target user ID",
  })
  @IsUUID("4")
  userId: string;

  @ApiProperty({
    enum: NotificationType,
    example: "order_created",
    description: "Notification type",
  })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({
    example: ["email", "push"],
    description: "Channels to send notification",
    enum: NotificationChannel,
    isArray: true,
  })
  @IsOptional()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({
    example: { orderId: "uuid", amount: 250 },
    description: "Additional data for the notification",
  })
  @IsOptional()
  @IsObject()
  @Validate(SafeNotificationLinkData)
  data?: Record<string, any>;
}

export class NotificationResponseDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "uuid-user-id" })
  userId: string;

  @ApiProperty({ example: "order_created" })
  type: string;

  @ApiProperty({ example: "Siparişiniz oluşturuldu" })
  title: string;

  @ApiProperty({ example: "Siparişiniz başarıyla oluşturuldu." })
  message: string;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  createdAt: Date;
}

export class RegisterPushTokenDto {
  @ApiProperty({
    example: "ExponentPushToken[xxxxx]",
    description: "Expo push token",
  })
  @IsString()
  token: string;

  @ApiPropertyOptional({
    example: "ios",
    description: "Device platform",
    enum: ["ios", "android", "web"],
  })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({
    example: "device-uuid-123",
    description: "Device unique identifier",
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      "When true, deactivate this token instead of registering it (used on logout)",
  })
  @IsOptional()
  @IsBoolean()
  revoke?: boolean;
}
