/**
 * Notification templates (#224): catalog keys instead of hardcoded Turkish.
 *
 * title/message live in the shared @tarodan/i18n catalog under
 * `server.notification.<type>` and are rendered per-recipient locale by
 * NotificationDispatchService. Links keep {{var}} placeholders — they are
 * routes, not localized copy, and are still interpolated by `interpolate()`.
 */
import { type MessageKey } from "@tarodan/i18n";
import { NotificationType } from "./dto";

export interface NotificationTemplate {
  titleKey: MessageKey;
  messageKey: MessageKey;
  icon?: string;
  link?: string;
}

export const NOTIFICATION_TEMPLATES: Record<
  NotificationType,
  NotificationTemplate
> = {
  [NotificationType.ORDER_CREATED]: {
    titleKey: "server.notification.orderCreated.title",
    messageKey: "server.notification.orderCreated.message",
    icon: "📦",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_PAID]: {
    titleKey: "server.notification.orderPaid.title",
    messageKey: "server.notification.orderPaid.message",
    icon: "💳",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_SHIPPED]: {
    titleKey: "server.notification.orderShipped.title",
    messageKey: "server.notification.orderShipped.message",
    icon: "🚚",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_DELIVERED]: {
    titleKey: "server.notification.orderDelivered.title",
    messageKey: "server.notification.orderDelivered.message",
    icon: "✅",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_COMPLETED]: {
    titleKey: "server.notification.orderCompleted.title",
    messageKey: "server.notification.orderCompleted.message",
    icon: "🎉",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_CANCELLED]: {
    titleKey: "server.notification.orderCancelled.title",
    messageKey: "server.notification.orderCancelled.message",
    icon: "❌",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_CANCELLED_SELLER]: {
    titleKey: "server.notification.orderCancelledSeller.title",
    messageKey: "server.notification.orderCancelledSeller.message",
    icon: "❌",
    link: "/seller/orders/{{orderId}}",
  },
  [NotificationType.ORDER_CANCELLED_OUT_OF_STOCK]: {
    titleKey: "server.notification.orderCancelledOutOfStock.title",
    messageKey: "server.notification.orderCancelledOutOfStock.message",
    icon: "❌",
    link: "/products/unavailable/{{productId}}",
  },
  [NotificationType.ORDER_REFUNDED]: {
    titleKey: "server.notification.orderRefunded.title",
    messageKey: "server.notification.orderRefunded.message",
    icon: "💰",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_PREPARING_DEADLINE_WARNING]: {
    titleKey: "server.notification.orderPreparingDeadlineWarning.title",
    messageKey: "server.notification.orderPreparingDeadlineWarning.message",
    icon: "⚠️",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_RESERVATION_RELEASED]: {
    titleKey: "server.notification.orderReservationReleased.title",
    messageKey: "server.notification.orderReservationReleased.message",
    icon: "⏳",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_DELIVERED_CONFIRM]: {
    titleKey: "server.notification.orderDeliveredConfirm.title",
    messageKey: "server.notification.orderDeliveredConfirm.message",
    icon: "📦",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_AUTO_COMPLETED]: {
    titleKey: "server.notification.orderAutoCompleted.title",
    messageKey: "server.notification.orderAutoCompleted.message",
    icon: "✅",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_MANUALLY_CONFIRMED]: {
    titleKey: "server.notification.orderManuallyConfirmed.title",
    messageKey: "server.notification.orderManuallyConfirmed.message",
    icon: "💸",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN]: {
    titleKey: "server.notification.orderForceCompletedByAdmin.title",
    messageKey: "server.notification.orderForceCompletedByAdmin.message",
    icon: "🛡️",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.SELLER_DID_NOT_SHIP_REFUNDED]: {
    titleKey: "server.notification.sellerDidNotShipRefunded.title",
    messageKey: "server.notification.sellerDidNotShipRefunded.message",
    icon: "↩️",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.OFFER_RECEIVED]: {
    titleKey: "server.notification.offerReceived.title",
    messageKey: "server.notification.offerReceived.message",
    icon: "💵",
    link: "/profile/offers?tab=received",
  },
  [NotificationType.OFFER_ACCEPTED]: {
    titleKey: "server.notification.offerAccepted.title",
    messageKey: "server.notification.offerAccepted.message",
    icon: "✅",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.OFFER_REJECTED]: {
    titleKey: "server.notification.offerRejected.title",
    messageKey: "server.notification.offerRejected.message",
    icon: "❌",
    link: "/listings/{{productId}}",
  },
  [NotificationType.OFFER_COUNTER]: {
    titleKey: "server.notification.offerCounter.title",
    messageKey: "server.notification.offerCounter.message",
    icon: "🔄",
    link: "/profile/offers?tab=sent",
  },
  [NotificationType.OFFER_COUNTER_DECLINED]: {
    titleKey: "server.notification.offerCounterDeclined.title",
    messageKey: "server.notification.offerCounterDeclined.message",
    icon: "❌",
    link: "/listings/{{productId}}",
  },
  [NotificationType.OFFER_EXPIRED]: {
    titleKey: "server.notification.offerExpired.title",
    messageKey: "server.notification.offerExpired.message",
    icon: "⏰",
    link: "/listings/{{productId}}",
  },
  [NotificationType.OFFER_CANCELLED_OUT_OF_STOCK]: {
    titleKey: "server.notification.offerCancelledOutOfStock.title",
    messageKey: "server.notification.offerCancelledOutOfStock.message",
    icon: "❌",
    link: "/products/unavailable/{{productId}}",
  },
  [NotificationType.PRODUCT_APPROVED]: {
    titleKey: "server.notification.productApproved.title",
    messageKey: "server.notification.productApproved.message",
    icon: "✅",
    link: "/listings/{{productId}}",
  },
  [NotificationType.PRODUCT_REJECTED]: {
    titleKey: "server.notification.productRejected.title",
    messageKey: "server.notification.productRejected.message",
    icon: "❌",
    link: "/profile/listings",
  },
  [NotificationType.PRODUCT_SOLD]: {
    titleKey: "server.notification.productSold.title",
    messageKey: "server.notification.productSold.message",
    icon: "💰",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.PAYMENT_RECEIVED]: {
    titleKey: "server.notification.paymentReceived.title",
    messageKey: "server.notification.paymentReceived.message",
    icon: "💳",
    link: "/profile/payments",
  },
  [NotificationType.PAYMENT_RELEASED]: {
    titleKey: "server.notification.paymentReleased.title",
    messageKey: "server.notification.paymentReleased.message",
    icon: "🏦",
    link: "/profile/payments",
  },
  [NotificationType.TRADE_RECEIVED]: {
    titleKey: "server.notification.tradeReceived.title",
    messageKey: "server.notification.tradeReceived.message",
    icon: "🔄",
    link: "/profile/trades/{{tradeId}}",
  },
  [NotificationType.TRADE_ACCEPTED]: {
    titleKey: "server.notification.tradeAccepted.title",
    messageKey: "server.notification.tradeAccepted.message",
    icon: "✅",
    link: "/profile/trades/{{tradeId}}",
  },
  [NotificationType.TRADE_REJECTED]: {
    titleKey: "server.notification.tradeRejected.title",
    messageKey: "server.notification.tradeRejected.message",
    icon: "❌",
    link: "/profile/trades",
  },
  [NotificationType.TRADE_COUNTER]: {
    titleKey: "server.notification.tradeCounter.title",
    messageKey: "server.notification.tradeCounter.message",
    icon: "🔄",
    link: "/profile/trades/{{tradeId}}",
  },
  [NotificationType.TRADE_SHIPPED]: {
    titleKey: "server.notification.tradeShipped.title",
    messageKey: "server.notification.tradeShipped.message",
    icon: "🚚",
    link: "/profile/trades/{{tradeId}}",
  },
  [NotificationType.TRADE_COMPLETED]: {
    titleKey: "server.notification.tradeCompleted.title",
    messageKey: "server.notification.tradeCompleted.message",
    icon: "🎉",
    link: "/profile/trades/{{tradeId}}",
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
    link: "/listings/{{productId}}",
  },
  [NotificationType.WISHLIST_ITEM_SOLD]: {
    titleKey: "server.notification.wishlistItemSold.title",
    messageKey: "server.notification.wishlistItemSold.message",
    icon: "💔",
    link: "/profile/favorites",
  },
  [NotificationType.BACK_IN_STOCK]: {
    titleKey: "server.notification.backInStock.title",
    messageKey: "server.notification.backInStock.message",
    icon: "🔔",
    link: "/listings/{{productId}}",
  },
  [NotificationType.NEW_FOLLOWER]: {
    titleKey: "server.notification.newFollower.title",
    messageKey: "server.notification.newFollower.message",
    icon: "👤",
    link: "/seller/{{followerId}}",
  },
  [NotificationType.SELLER_NEW_LISTING]: {
    titleKey: "server.notification.sellerNewListing.title",
    messageKey: "server.notification.sellerNewListing.message",
    icon: "🆕",
    link: "/listings/{{productId}}",
  },
  [NotificationType.COLLECTION_LIKED]: {
    titleKey: "server.notification.collectionLiked.title",
    messageKey: "server.notification.collectionLiked.message",
    icon: "❤️",
    link: "/collections/{{collectionId}}",
  },
  [NotificationType.PRODUCT_LIKED]: {
    titleKey: "server.notification.productLiked.title",
    messageKey: "server.notification.productLiked.message",
    icon: "❤️",
    link: "/listings/{{productId}}",
  },
  [NotificationType.WISHLIST_SOLD]: {
    titleKey: "server.notification.wishlistSold.title",
    messageKey: "server.notification.wishlistSold.message",
    icon: "💔",
    link: "/listings/{{productId}}",
  },
  [NotificationType.REVIEW_RECEIVED]: {
    titleKey: "server.notification.reviewReceived.title",
    messageKey: "server.notification.reviewReceived.message",
    icon: "⭐",
    link: "/profile",
  },
  [NotificationType.MEMBERSHIP_EXPIRING]: {
    titleKey: "server.notification.membershipExpiring.title",
    messageKey: "server.notification.membershipExpiring.message",
    icon: "⏰",
    link: "/membership",
  },
  [NotificationType.MEMBERSHIP_EXPIRED]: {
    titleKey: "server.notification.membershipExpired.title",
    messageKey: "server.notification.membershipExpired.message",
    icon: "⚠️",
    link: "/membership",
  },
  [NotificationType.MEMBERSHIP_UPGRADED]: {
    titleKey: "server.notification.membershipUpgraded.title",
    messageKey: "server.notification.membershipUpgraded.message",
    icon: "👑",
    link: "/profile",
  },
  [NotificationType.LISTING_EXPIRING]: {
    titleKey: "server.notification.listingExpiring.title",
    messageKey: "server.notification.listingExpiring.message",
    icon: "⏰",
    link: "/listings/{{productId}}",
  },
  [NotificationType.LISTING_EXPIRED]: {
    titleKey: "server.notification.listingExpired.title",
    messageKey: "server.notification.listingExpired.message",
    icon: "⚠️",
    link: "/profile/listings",
  },
  [NotificationType.LISTING_VIEWS_MILESTONE]: {
    titleKey: "server.notification.listingViewsMilestone.title",
    messageKey: "server.notification.listingViewsMilestone.message",
    icon: "👀",
    link: "/listings/{{productId}}",
  },
  [NotificationType.PROMOTION]: {
    titleKey: "server.notification.promotion.title",
    messageKey: "server.notification.promotion.message",
    icon: "🎁",
    link: "{{promotionLink}}",
  },
  [NotificationType.SPECIAL_OFFER]: {
    titleKey: "server.notification.specialOffer.title",
    messageKey: "server.notification.specialOffer.message",
    icon: "💎",
    link: "{{offerLink}}",
  },
  [NotificationType.WELCOME]: {
    titleKey: "server.notification.welcome.title",
    messageKey: "server.notification.welcome.message",
    icon: "🎉",
    link: "/listings",
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
    link: "{{announcementLink}}",
  },
  [NotificationType.BOOST_EXPIRED]: {
    titleKey: "server.notification.boostExpired.title",
    messageKey: "server.notification.boostExpired.message",
    icon: "🚀",
    link: "/profile/listings",
  },
  [NotificationType.TRADE_AUTO_CANCELLED]: {
    titleKey: "server.notification.tradeAutoCancelled.title",
    messageKey: "server.notification.tradeAutoCancelled.message",
    icon: "🔄",
    link: "/profile/trades",
  },
  [NotificationType.TRADE_STUCK_AT_WAREHOUSE]: {
    titleKey: "server.notification.tradeStuckAtWarehouse.title",
    messageKey: "server.notification.tradeStuckAtWarehouse.message",
    icon: "⚠️",
    link: "/profile/trades",
  },
  [NotificationType.TRADE_ADDRESS_REQUIRED]: {
    titleKey: "server.notification.tradeAddressRequired.title",
    messageKey: "server.notification.tradeAddressRequired.message",
    icon: "📍",
    link: "/profile/trades",
  },
  [NotificationType.CARGO_CODE_READY]: {
    titleKey: "server.notification.cargoCodeReady.title",
    messageKey: "server.notification.cargoCodeReady.message",
    icon: "📦",
    link: "{{link}}",
  },
  [NotificationType.CARGO_MOVEMENT_MISSING]: {
    titleKey: "server.notification.cargoMovementMissing.title",
    messageKey: "server.notification.cargoMovementMissing.message",
    icon: "🚚",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.OFFER_AUTO_REJECTED]: {
    titleKey: "server.notification.offerAutoRejected.title",
    messageKey: "server.notification.offerAutoRejected.message",
    icon: "💰",
    link: "/profile/offers",
  },
  [NotificationType.RESERVATION_EXPIRED]: {
    titleKey: "server.notification.reservationExpired.title",
    messageKey: "server.notification.reservationExpired.message",
    icon: "⏰",
    link: "/profile/orders",
  },
  [NotificationType.REFUND_CANCELLED]: {
    titleKey: "server.notification.refundCancelled.title",
    messageKey: "server.notification.refundCancelled.message",
    icon: "↩️",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.REFUND_APPROVED]: {
    titleKey: "server.notification.refundApproved.title",
    messageKey: "server.notification.refundApproved.message",
    icon: "✅",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.REFUND_RETURN_OPENED]: {
    titleKey: "server.notification.refundReturnOpened.title",
    messageKey: "server.notification.refundReturnOpened.message",
    icon: "📦",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.REFUND_COMPLETED]: {
    titleKey: "server.notification.refundCompleted.title",
    messageKey: "server.notification.refundCompleted.message",
    icon: "💰",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.REFUND_REQUEST_RECEIVED]: {
    titleKey: "server.notification.refundRequestReceived.title",
    messageKey: "server.notification.refundRequestReceived.message",
    icon: "📨",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.REFUND_RETURN_SHIPPED_SELLER]: {
    titleKey: "server.notification.refundReturnShippedSeller.title",
    messageKey: "server.notification.refundReturnShippedSeller.message",
    icon: "📦",
    link: "/seller/orders/{{orderId}}",
  },
  [NotificationType.REFUND_RETURN_IN_TRANSIT]: {
    titleKey: "server.notification.refundReturnInTransit.title",
    messageKey: "server.notification.refundReturnInTransit.message",
    icon: "🚚",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.REFUND_RETURN_DELIVERED_BUYER]: {
    titleKey: "server.notification.refundReturnDeliveredBuyer.title",
    messageKey: "server.notification.refundReturnDeliveredBuyer.message",
    icon: "✅",
    link: "/profile/orders/{{orderId}}",
  },
  [NotificationType.REFUND_RETURN_DELIVERED_SELLER]: {
    titleKey: "server.notification.refundReturnDeliveredSeller.title",
    messageKey: "server.notification.refundReturnDeliveredSeller.message",
    icon: "📥",
    link: "/seller/orders/{{orderId}}",
  },
  [NotificationType.REFUND_COMPLETED_SELLER]: {
    titleKey: "server.notification.refundCompletedSeller.title",
    messageKey: "server.notification.refundCompletedSeller.message",
    icon: "↩️",
    link: "/seller/orders/{{orderId}}",
  },
  [NotificationType.REFUND_AUTO_ACCEPTED_SELLER]: {
    titleKey: "server.notification.refundAutoAcceptedSeller.title",
    messageKey: "server.notification.refundAutoAcceptedSeller.message",
    icon: "⏰",
    link: "/seller/orders/{{orderId}}",
  },
  [NotificationType.SELLER_APPLICATION_APPROVED]: {
    titleKey: "server.notification.sellerApplicationApproved.title",
    messageKey: "server.notification.sellerApplicationApproved.message",
    icon: "✅",
    link: "/profile",
  },
  [NotificationType.SELLER_APPLICATION_REJECTED]: {
    titleKey: "server.notification.sellerApplicationRejected.title",
    messageKey: "server.notification.sellerApplicationRejected.message",
    icon: "❌",
    link: "/profile",
  },
};
