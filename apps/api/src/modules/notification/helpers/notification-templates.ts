/**
 * Notification templates (#224): catalog keys instead of hardcoded Turkish.
 *
 * title/message live in the shared @tarodan/i18n catalog under
 * `server.notification.<type>` and are rendered per-recipient locale by
 * NotificationDispatchService. Links keep {{var}} placeholders — they are
 * routes, not localized copy, and are still interpolated by `interpolate()`.
 */
import { type MessageKey } from "@tarodan/i18n";
import { NotificationType } from "../dto";

export interface NotificationTemplate {
  titleKey: MessageKey;
  messageKey: MessageKey;
  icon?: string;
}

/**
 * Şablonlar yalnız BAŞLIK/METİN taşır. Link alanı kaldırıldı: hedefin tek
 * kaynağı `notification-link.ts`; burada ikinci bir sözleşme tutmak zamanla
 * ikisinin ayrışması demekti.
 *
 * `Partial`: EventService'in doğrudan yazdığı tipler (kendi başlık/metnini
 * taşıyorlar) burada bulunmaz.
 */
export const NOTIFICATION_TEMPLATES: Partial<
  Record<NotificationType, NotificationTemplate>
> = {
  [NotificationType.ORDER_CREATED]: {
    titleKey: "server.notification.orderCreated.title",
    messageKey: "server.notification.orderCreated.message",
    icon: "📦",
  },
  [NotificationType.ORDER_PAID]: {
    titleKey: "server.notification.orderPaid.title",
    messageKey: "server.notification.orderPaid.message",
    icon: "💳",
  },
  [NotificationType.ORDER_SHIPPED]: {
    titleKey: "server.notification.orderShipped.title",
    messageKey: "server.notification.orderShipped.message",
    icon: "🚚",
  },
  [NotificationType.ORDER_DELIVERED]: {
    titleKey: "server.notification.orderDelivered.title",
    messageKey: "server.notification.orderDelivered.message",
    icon: "✅",
  },
  [NotificationType.ORDER_COMPLETED]: {
    titleKey: "server.notification.orderCompleted.title",
    messageKey: "server.notification.orderCompleted.message",
    icon: "🎉",
  },
  [NotificationType.ORDER_CANCELLED]: {
    titleKey: "server.notification.orderCancelled.title",
    messageKey: "server.notification.orderCancelled.message",
    icon: "❌",
  },
  [NotificationType.ORDER_CANCELLED_SELLER]: {
    titleKey: "server.notification.orderCancelledSeller.title",
    messageKey: "server.notification.orderCancelledSeller.message",
    icon: "❌",
  },
  [NotificationType.ORDER_CANCELLED_OUT_OF_STOCK]: {
    titleKey: "server.notification.orderCancelledOutOfStock.title",
    messageKey: "server.notification.orderCancelledOutOfStock.message",
    icon: "❌",
  },
  [NotificationType.ORDER_REFUNDED]: {
    titleKey: "server.notification.orderRefunded.title",
    messageKey: "server.notification.orderRefunded.message",
    icon: "💰",
  },
  [NotificationType.ORDER_PREPARING_DEADLINE_WARNING]: {
    titleKey: "server.notification.orderPreparingDeadlineWarning.title",
    messageKey: "server.notification.orderPreparingDeadlineWarning.message",
    icon: "⚠️",
  },
  [NotificationType.ORDER_RESERVATION_RELEASED]: {
    titleKey: "server.notification.orderReservationReleased.title",
    messageKey: "server.notification.orderReservationReleased.message",
    icon: "⏳",
  },
  [NotificationType.ORDER_DELIVERED_CONFIRM]: {
    titleKey: "server.notification.orderDeliveredConfirm.title",
    messageKey: "server.notification.orderDeliveredConfirm.message",
    icon: "📦",
  },
  [NotificationType.ORDER_AUTO_COMPLETED]: {
    titleKey: "server.notification.orderAutoCompleted.title",
    messageKey: "server.notification.orderAutoCompleted.message",
    icon: "✅",
  },
  [NotificationType.ORDER_MANUALLY_CONFIRMED]: {
    titleKey: "server.notification.orderManuallyConfirmed.title",
    messageKey: "server.notification.orderManuallyConfirmed.message",
    icon: "💸",
  },
  [NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN]: {
    titleKey: "server.notification.orderForceCompletedByAdmin.title",
    messageKey: "server.notification.orderForceCompletedByAdmin.message",
    icon: "🛡️",
  },
  [NotificationType.SELLER_DID_NOT_SHIP_REFUNDED]: {
    titleKey: "server.notification.sellerDidNotShipRefunded.title",
    messageKey: "server.notification.sellerDidNotShipRefunded.message",
    icon: "↩️",
  },
  [NotificationType.OFFER_RECEIVED]: {
    titleKey: "server.notification.offerReceived.title",
    messageKey: "server.notification.offerReceived.message",
    icon: "💵",
  },
  [NotificationType.OFFER_ACCEPTED]: {
    titleKey: "server.notification.offerAccepted.title",
    messageKey: "server.notification.offerAccepted.message",
    icon: "✅",
  },
  [NotificationType.OFFER_REJECTED]: {
    titleKey: "server.notification.offerRejected.title",
    messageKey: "server.notification.offerRejected.message",
    icon: "❌",
  },
  [NotificationType.OFFER_COUNTER]: {
    titleKey: "server.notification.offerCounter.title",
    messageKey: "server.notification.offerCounter.message",
    icon: "🔄",
  },
  [NotificationType.OFFER_COUNTER_DECLINED]: {
    titleKey: "server.notification.offerCounterDeclined.title",
    messageKey: "server.notification.offerCounterDeclined.message",
    icon: "❌",
  },
  [NotificationType.OFFER_COUNTER_ACCEPTED]: {
    titleKey: "server.notification.offerCounterAccepted.title",
    messageKey: "server.notification.offerCounterAccepted.message",
    icon: "✅",
  },
  [NotificationType.OFFER_EXPIRED]: {
    titleKey: "server.notification.offerExpired.title",
    messageKey: "server.notification.offerExpired.message",
    icon: "⏰",
  },
  [NotificationType.OFFER_EXPIRED_SELLER]: {
    titleKey: "server.notification.offerExpiredSeller.title",
    messageKey: "server.notification.offerExpiredSeller.message",
    icon: "⏰",
  },
  [NotificationType.OFFER_PAYMENT_EXPIRED]: {
    titleKey: "server.notification.offerPaymentExpired.title",
    messageKey: "server.notification.offerPaymentExpired.message",
    icon: "⏳",
  },
  [NotificationType.OFFER_CANCELLED_OUT_OF_STOCK]: {
    titleKey: "server.notification.offerCancelledOutOfStock.title",
    messageKey: "server.notification.offerCancelledOutOfStock.message",
    icon: "❌",
  },
  [NotificationType.OFFER_CANCELLED_LISTING_REMOVED]: {
    titleKey: "server.notification.offerCancelledListingRemoved.title",
    messageKey: "server.notification.offerCancelledListingRemoved.message",
    icon: "❌",
  },
  [NotificationType.PRODUCT_APPROVED]: {
    titleKey: "server.notification.productApproved.title",
    messageKey: "server.notification.productApproved.message",
    icon: "✅",
  },
  [NotificationType.PRODUCT_REJECTED]: {
    titleKey: "server.notification.productRejected.title",
    messageKey: "server.notification.productRejected.message",
    icon: "❌",
  },
  [NotificationType.PRODUCT_SOLD]: {
    titleKey: "server.notification.productSold.title",
    messageKey: "server.notification.productSold.message",
    icon: "💰",
  },
  [NotificationType.PAYMENT_RECEIVED]: {
    titleKey: "server.notification.paymentReceived.title",
    messageKey: "server.notification.paymentReceived.message",
    icon: "💳",
  },
  [NotificationType.PAYMENT_RELEASED]: {
    titleKey: "server.notification.paymentReleased.title",
    messageKey: "server.notification.paymentReleased.message",
    icon: "🏦",
  },
  [NotificationType.TRADE_RECEIVED]: {
    titleKey: "server.notification.tradeReceived.title",
    messageKey: "server.notification.tradeReceived.message",
    icon: "🔄",
  },
  [NotificationType.TRADE_ACCEPTED]: {
    titleKey: "server.notification.tradeAccepted.title",
    messageKey: "server.notification.tradeAccepted.message",
    icon: "✅",
  },
  [NotificationType.TRADE_REJECTED]: {
    titleKey: "server.notification.tradeRejected.title",
    messageKey: "server.notification.tradeRejected.message",
    icon: "❌",
  },
  [NotificationType.TRADE_COUNTER]: {
    titleKey: "server.notification.tradeCounter.title",
    messageKey: "server.notification.tradeCounter.message",
    icon: "🔄",
  },
  [NotificationType.TRADE_SHIPPED]: {
    titleKey: "server.notification.tradeShipped.title",
    messageKey: "server.notification.tradeShipped.message",
    icon: "🚚",
  },
  [NotificationType.TRADE_COMPLETED]: {
    titleKey: "server.notification.tradeCompleted.title",
    messageKey: "server.notification.tradeCompleted.message",
    icon: "🎉",
  },
  [NotificationType.NEW_MESSAGE]: {
    titleKey: "server.notification.newMessage.title",
    messageKey: "server.notification.newMessage.message",
    icon: "💬",
  },
  [NotificationType.PRICE_DROP]: {
    titleKey: "server.notification.priceDrop.title",
    messageKey: "server.notification.priceDrop.message",
    icon: "📉",
  },
  [NotificationType.WISHLIST_ITEM_SOLD]: {
    titleKey: "server.notification.wishlistItemSold.title",
    messageKey: "server.notification.wishlistItemSold.message",
    icon: "💔",
  },
  [NotificationType.BACK_IN_STOCK]: {
    titleKey: "server.notification.backInStock.title",
    messageKey: "server.notification.backInStock.message",
    icon: "🔔",
  },
  [NotificationType.NEW_FOLLOWER]: {
    titleKey: "server.notification.newFollower.title",
    messageKey: "server.notification.newFollower.message",
    icon: "👤",
  },
  [NotificationType.SELLER_NEW_LISTING]: {
    titleKey: "server.notification.sellerNewListing.title",
    messageKey: "server.notification.sellerNewListing.message",
    icon: "🆕",
  },
  [NotificationType.COLLECTION_LIKED]: {
    titleKey: "server.notification.collectionLiked.title",
    messageKey: "server.notification.collectionLiked.message",
    icon: "❤️",
  },
  [NotificationType.PRODUCT_LIKED]: {
    titleKey: "server.notification.productLiked.title",
    messageKey: "server.notification.productLiked.message",
    icon: "❤️",
  },
  [NotificationType.WISHLIST_SOLD]: {
    titleKey: "server.notification.wishlistSold.title",
    messageKey: "server.notification.wishlistSold.message",
    icon: "💔",
  },
  [NotificationType.REVIEW_RECEIVED]: {
    titleKey: "server.notification.reviewReceived.title",
    messageKey: "server.notification.reviewReceived.message",
    icon: "⭐",
  },
  [NotificationType.MEMBERSHIP_EXPIRING]: {
    titleKey: "server.notification.membershipExpiring.title",
    messageKey: "server.notification.membershipExpiring.message",
    icon: "⏰",
  },
  [NotificationType.MEMBERSHIP_EXPIRED]: {
    titleKey: "server.notification.membershipExpired.title",
    messageKey: "server.notification.membershipExpired.message",
    icon: "⚠️",
  },
  [NotificationType.MEMBERSHIP_UPGRADED]: {
    titleKey: "server.notification.membershipUpgraded.title",
    messageKey: "server.notification.membershipUpgraded.message",
    icon: "👑",
  },
  [NotificationType.LISTING_EXPIRING]: {
    titleKey: "server.notification.listingExpiring.title",
    messageKey: "server.notification.listingExpiring.message",
    icon: "⏰",
  },
  [NotificationType.LISTING_EXPIRED]: {
    titleKey: "server.notification.listingExpired.title",
    messageKey: "server.notification.listingExpired.message",
    icon: "⚠️",
  },
  [NotificationType.LISTING_VIEWS_MILESTONE]: {
    titleKey: "server.notification.listingViewsMilestone.title",
    messageKey: "server.notification.listingViewsMilestone.message",
    icon: "👀",
  },
  [NotificationType.PROMOTION]: {
    titleKey: "server.notification.promotion.title",
    messageKey: "server.notification.promotion.message",
    icon: "🎁",
  },
  [NotificationType.SPECIAL_OFFER]: {
    titleKey: "server.notification.specialOffer.title",
    messageKey: "server.notification.specialOffer.message",
    icon: "💎",
  },
  [NotificationType.WELCOME]: {
    titleKey: "server.notification.welcome.title",
    messageKey: "server.notification.welcome.message",
    icon: "🎉",
  },
  [NotificationType.PASSWORD_RESET]: {
    titleKey: "server.notification.passwordReset.title",
    messageKey: "server.notification.passwordReset.message",
    icon: "🔐",
  },
  [NotificationType.EMAIL_VERIFICATION]: {
    titleKey: "server.notification.emailVerification.title",
    messageKey: "server.notification.emailVerification.message",
    icon: "📧",
  },
  [NotificationType.SYSTEM_ANNOUNCEMENT]: {
    titleKey: "server.notification.systemAnnouncement.title",
    messageKey: "server.notification.systemAnnouncement.message",
    icon: "📢",
  },
  [NotificationType.BOOST_EXPIRED]: {
    titleKey: "server.notification.boostExpired.title",
    messageKey: "server.notification.boostExpired.message",
    icon: "🚀",
  },
  [NotificationType.BOOST_ACTIVATED]: {
    titleKey: "server.notification.boostActivated.title",
    messageKey: "server.notification.boostActivated.message",
    icon: "🚀",
  },
  [NotificationType.TRADE_AUTO_CANCELLED]: {
    titleKey: "server.notification.tradeAutoCancelled.title",
    messageKey: "server.notification.tradeAutoCancelled.message",
    icon: "🔄",
  },
  [NotificationType.TRADE_AT_WAREHOUSE]: {
    titleKey: "server.notification.tradeAtWarehouse.title",
    messageKey: "server.notification.tradeAtWarehouse.message",
    icon: "🏬",
  },
  [NotificationType.TRADE_STUCK_AT_WAREHOUSE]: {
    titleKey: "server.notification.tradeStuckAtWarehouse.title",
    messageKey: "server.notification.tradeStuckAtWarehouse.message",
    icon: "⚠️",
  },
  [NotificationType.ORDER_SHIPMENT_DELAYED]: {
    titleKey: "server.notification.orderShipmentDelayed.title",
    messageKey: "server.notification.orderShipmentDelayed.message",
    icon: "🕒",
  },
  [NotificationType.ORDER_STUCK_IN_TRANSIT]: {
    titleKey: "server.notification.orderStuckInTransit.title",
    messageKey: "server.notification.orderStuckInTransit.message",
    icon: "⚠️",
  },
  [NotificationType.TRADE_OUTBOUND_DELIVERY_MISSING]: {
    titleKey: "server.notification.tradeOutboundDeliveryMissing.title",
    messageKey: "server.notification.tradeOutboundDeliveryMissing.message",
    icon: "⚠️",
  },
  [NotificationType.TRADE_ADDRESS_REQUIRED]: {
    titleKey: "server.notification.tradeAddressRequired.title",
    messageKey: "server.notification.tradeAddressRequired.message",
    icon: "📍",
  },
  [NotificationType.SELLER_ADDRESS_REQUIRED]: {
    titleKey: "server.notification.sellerAddressRequired.title",
    messageKey: "server.notification.sellerAddressRequired.message",
    icon: "📍",
  },
  [NotificationType.CARGO_CODE_READY]: {
    titleKey: "server.notification.cargoCodeReady.title",
    messageKey: "server.notification.cargoCodeReady.message",
    icon: "📦",
  },
  [NotificationType.CARGO_MOVEMENT_MISSING]: {
    titleKey: "server.notification.cargoMovementMissing.title",
    messageKey: "server.notification.cargoMovementMissing.message",
    icon: "🚚",
  },
  [NotificationType.OFFER_AUTO_REJECTED]: {
    titleKey: "server.notification.offerAutoRejected.title",
    messageKey: "server.notification.offerAutoRejected.message",
    icon: "💰",
  },
  [NotificationType.RESERVATION_EXPIRED]: {
    titleKey: "server.notification.reservationExpired.title",
    messageKey: "server.notification.reservationExpired.message",
    icon: "⏰",
  },
  [NotificationType.REFUND_CANCELLED]: {
    titleKey: "server.notification.refundCancelled.title",
    messageKey: "server.notification.refundCancelled.message",
    icon: "↩️",
  },
  [NotificationType.REFUND_APPROVED]: {
    titleKey: "server.notification.refundApproved.title",
    messageKey: "server.notification.refundApproved.message",
    icon: "✅",
  },
  [NotificationType.REFUND_RETURN_OPENED]: {
    titleKey: "server.notification.refundReturnOpened.title",
    messageKey: "server.notification.refundReturnOpened.message",
    icon: "📦",
  },
  [NotificationType.REFUND_COMPLETED]: {
    titleKey: "server.notification.refundCompleted.title",
    messageKey: "server.notification.refundCompleted.message",
    icon: "💰",
  },
  [NotificationType.COUPON_RETURNED]: {
    titleKey: "server.notification.couponReturned.title",
    messageKey: "server.notification.couponReturned.message",
    icon: "🎟️",
  },
  [NotificationType.CAMPAIGN_BUDGET_EXHAUSTED]: {
    titleKey: "server.notification.campaignBudgetExhausted.title",
    messageKey: "server.notification.campaignBudgetExhausted.message",
    icon: "🛑",
  },
  [NotificationType.MODERATION_QUEUE_STALE]: {
    titleKey: "server.notification.moderationQueueStale.title",
    messageKey: "server.notification.moderationQueueStale.message",
    icon: "⏳",
  },
  [NotificationType.USER_BLOCKED_ADMIN]: {
    titleKey: "server.notification.userBlockedAdmin.title",
    messageKey: "server.notification.userBlockedAdmin.message",
    icon: "🚫",
  },
  [NotificationType.USER_REPORTED_ADMIN]: {
    titleKey: "server.notification.userReportedAdmin.title",
    messageKey: "server.notification.userReportedAdmin.message",
    icon: "🚩",
  },
  [NotificationType.REFUND_REQUEST_RECEIVED]: {
    titleKey: "server.notification.refundRequestReceived.title",
    messageKey: "server.notification.refundRequestReceived.message",
    icon: "📨",
  },
  [NotificationType.REFUND_REQUEST_RECEIVED_SELLER]: {
    titleKey: "server.notification.refundRequestReceivedSeller.title",
    messageKey: "server.notification.refundRequestReceivedSeller.message",
    icon: "↩️",
  },
  [NotificationType.REFUND_REVIEW_REQUIRED_ADMIN]: {
    titleKey: "server.notification.refundReviewRequiredAdmin.title",
    messageKey: "server.notification.refundReviewRequiredAdmin.message",
    icon: "🔎",
  },
  [NotificationType.REFUND_RETURN_SHIPPED_SELLER]: {
    titleKey: "server.notification.refundReturnShippedSeller.title",
    messageKey: "server.notification.refundReturnShippedSeller.message",
    icon: "📦",
  },
  [NotificationType.REFUND_RETURN_IN_TRANSIT]: {
    titleKey: "server.notification.refundReturnInTransit.title",
    messageKey: "server.notification.refundReturnInTransit.message",
    icon: "🚚",
  },
  [NotificationType.REFUND_RETURN_DELIVERED_BUYER]: {
    titleKey: "server.notification.refundReturnDeliveredBuyer.title",
    messageKey: "server.notification.refundReturnDeliveredBuyer.message",
    icon: "✅",
  },
  [NotificationType.REFUND_RETURN_DELIVERED_SELLER]: {
    titleKey: "server.notification.refundReturnDeliveredSeller.title",
    messageKey: "server.notification.refundReturnDeliveredSeller.message",
    icon: "📥",
  },
  [NotificationType.REFUND_COMPLETED_SELLER]: {
    titleKey: "server.notification.refundCompletedSeller.title",
    messageKey: "server.notification.refundCompletedSeller.message",
    icon: "↩️",
  },
  [NotificationType.REFUND_AUTO_ACCEPTED_SELLER]: {
    titleKey: "server.notification.refundAutoAcceptedSeller.title",
    messageKey: "server.notification.refundAutoAcceptedSeller.message",
    icon: "⏰",
  },
  [NotificationType.SELLER_APPLICATION_APPROVED]: {
    titleKey: "server.notification.sellerApplicationApproved.title",
    messageKey: "server.notification.sellerApplicationApproved.message",
    icon: "✅",
  },
  [NotificationType.SELLER_APPLICATION_REJECTED]: {
    titleKey: "server.notification.sellerApplicationRejected.title",
    messageKey: "server.notification.sellerApplicationRejected.message",
    icon: "❌",
  },
};
