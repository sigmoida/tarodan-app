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
  /**
   * Değeri bir katalog ANAHTARI olan parametreler: `{ param: dataField }`.
   * Render sırasında `data[dataField]` alıcının dilinde çevrilir ve metne
   * `{param}` olarak girer (ör. yönetici iptal nedeninin etiketi). Bildirim
   * verisine dile bağlı metin değil anahtar yazılır; her alıcı kendi dilini
   * görür.
   */
  localizedValues?: Readonly<Record<string, string>>;
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
  },
  [NotificationType.ORDER_PAID]: {
    titleKey: "server.notification.orderPaid.title",
    messageKey: "server.notification.orderPaid.message",
  },
  [NotificationType.ORDER_SHIPPED]: {
    titleKey: "server.notification.orderShipped.title",
    messageKey: "server.notification.orderShipped.message",
  },
  [NotificationType.ORDER_DELIVERED]: {
    titleKey: "server.notification.orderDelivered.title",
    messageKey: "server.notification.orderDelivered.message",
  },
  [NotificationType.ORDER_COMPLETED]: {
    titleKey: "server.notification.orderCompleted.title",
    messageKey: "server.notification.orderCompleted.message",
  },
  [NotificationType.ORDER_CANCELLED]: {
    titleKey: "server.notification.orderCancelled.title",
    messageKey: "server.notification.orderCancelled.message",
  },
  [NotificationType.ORDER_CANCELLED_SELLER]: {
    titleKey: "server.notification.orderCancelledSeller.title",
    messageKey: "server.notification.orderCancelledSeller.message",
  },
  [NotificationType.ORDER_CANCELLED_BY_PLATFORM]: {
    titleKey: "server.notification.orderCancelledByPlatform.title",
    messageKey: "server.notification.orderCancelledByPlatform.message",
    localizedValues: { reason: "reasonKey" },
  },
  [NotificationType.ORDER_CANCELLED_BY_PLATFORM_SELLER]: {
    titleKey: "server.notification.orderCancelledByPlatformSeller.title",
    messageKey: "server.notification.orderCancelledByPlatformSeller.message",
    localizedValues: { reason: "reasonKey" },
  },
  [NotificationType.ORDER_CANCELLED_OUT_OF_STOCK]: {
    titleKey: "server.notification.orderCancelledOutOfStock.title",
    messageKey: "server.notification.orderCancelledOutOfStock.message",
  },
  [NotificationType.ORDER_REFUNDED]: {
    titleKey: "server.notification.orderRefunded.title",
    messageKey: "server.notification.orderRefunded.message",
  },
  [NotificationType.ORDER_PREPARING_DEADLINE_WARNING]: {
    titleKey: "server.notification.orderPreparingDeadlineWarning.title",
    messageKey: "server.notification.orderPreparingDeadlineWarning.message",
  },
  [NotificationType.ORDER_PREPARING_EXTENDED]: {
    titleKey: "server.notification.orderPreparingExtended.title",
    messageKey: "server.notification.orderPreparingExtended.message",
  },
  [NotificationType.ORDER_PREPARING_EXTENDED_SELLER]: {
    titleKey: "server.notification.orderPreparingExtendedSeller.title",
    messageKey: "server.notification.orderPreparingExtendedSeller.message",
  },
  [NotificationType.ORDER_RESERVATION_RELEASED]: {
    titleKey: "server.notification.orderReservationReleased.title",
    messageKey: "server.notification.orderReservationReleased.message",
  },
  [NotificationType.ORDER_DELIVERED_CONFIRM]: {
    titleKey: "server.notification.orderDeliveredConfirm.title",
    messageKey: "server.notification.orderDeliveredConfirm.message",
  },
  [NotificationType.ORDER_AUTO_COMPLETED]: {
    titleKey: "server.notification.orderAutoCompleted.title",
    messageKey: "server.notification.orderAutoCompleted.message",
  },
  [NotificationType.ORDER_MANUALLY_CONFIRMED]: {
    titleKey: "server.notification.orderManuallyConfirmed.title",
    messageKey: "server.notification.orderManuallyConfirmed.message",
  },
  [NotificationType.SELLER_DID_NOT_SHIP_REFUNDED]: {
    titleKey: "server.notification.sellerDidNotShipRefunded.title",
    messageKey: "server.notification.sellerDidNotShipRefunded.message",
  },
  [NotificationType.OFFER_RECEIVED]: {
    titleKey: "server.notification.offerReceived.title",
    messageKey: "server.notification.offerReceived.message",
  },
  [NotificationType.OFFER_ACCEPTED]: {
    titleKey: "server.notification.offerAccepted.title",
    messageKey: "server.notification.offerAccepted.message",
  },
  [NotificationType.OFFER_REJECTED]: {
    titleKey: "server.notification.offerRejected.title",
    messageKey: "server.notification.offerRejected.message",
  },
  [NotificationType.OFFER_COUNTER]: {
    titleKey: "server.notification.offerCounter.title",
    messageKey: "server.notification.offerCounter.message",
  },
  [NotificationType.OFFER_COUNTER_DECLINED]: {
    titleKey: "server.notification.offerCounterDeclined.title",
    messageKey: "server.notification.offerCounterDeclined.message",
  },
  [NotificationType.OFFER_COUNTER_ACCEPTED]: {
    titleKey: "server.notification.offerCounterAccepted.title",
    messageKey: "server.notification.offerCounterAccepted.message",
  },
  [NotificationType.OFFER_EXPIRED]: {
    titleKey: "server.notification.offerExpired.title",
    messageKey: "server.notification.offerExpired.message",
  },
  [NotificationType.OFFER_EXPIRED_SELLER]: {
    titleKey: "server.notification.offerExpiredSeller.title",
    messageKey: "server.notification.offerExpiredSeller.message",
  },
  [NotificationType.OFFER_EXTENDED]: {
    titleKey: "server.notification.offerExtended.title",
    messageKey: "server.notification.offerExtended.message",
  },
  [NotificationType.OFFER_PAYMENT_EXPIRED]: {
    titleKey: "server.notification.offerPaymentExpired.title",
    messageKey: "server.notification.offerPaymentExpired.message",
  },
  [NotificationType.OFFER_CANCELLED_OUT_OF_STOCK]: {
    titleKey: "server.notification.offerCancelledOutOfStock.title",
    messageKey: "server.notification.offerCancelledOutOfStock.message",
  },
  [NotificationType.OFFER_CANCELLED_BY_ADMIN]: {
    titleKey: "server.notification.offerCancelledByAdmin.title",
    messageKey: "server.notification.offerCancelledByAdmin.message",
  },
  [NotificationType.OFFER_CANCELLED_LISTING_REMOVED]: {
    titleKey: "server.notification.offerCancelledListingRemoved.title",
    messageKey: "server.notification.offerCancelledListingRemoved.message",
  },
  [NotificationType.OFFER_CANCELLED_BUYER_DELETED]: {
    titleKey: "server.notification.offerCancelledBuyerDeleted.title",
    messageKey: "server.notification.offerCancelledBuyerDeleted.message",
  },
  [NotificationType.PRODUCT_APPROVED]: {
    titleKey: "server.notification.productApproved.title",
    messageKey: "server.notification.productApproved.message",
  },
  [NotificationType.PRODUCT_REJECTED]: {
    titleKey: "server.notification.productRejected.title",
    messageKey: "server.notification.productRejected.message",
  },
  [NotificationType.PRODUCT_SOLD]: {
    titleKey: "server.notification.productSold.title",
    messageKey: "server.notification.productSold.message",
  },
  [NotificationType.PAYMENT_RECEIVED]: {
    titleKey: "server.notification.paymentReceived.title",
    messageKey: "server.notification.paymentReceived.message",
  },
  [NotificationType.PAYMENT_RELEASED]: {
    titleKey: "server.notification.paymentReleased.title",
    messageKey: "server.notification.paymentReleased.message",
  },
  [NotificationType.TRADE_RECEIVED]: {
    titleKey: "server.notification.tradeReceived.title",
    messageKey: "server.notification.tradeReceived.message",
  },
  [NotificationType.TRADE_ACCEPTED]: {
    titleKey: "server.notification.tradeAccepted.title",
    messageKey: "server.notification.tradeAccepted.message",
  },
  [NotificationType.TRADE_REJECTED]: {
    titleKey: "server.notification.tradeRejected.title",
    messageKey: "server.notification.tradeRejected.message",
  },
  [NotificationType.TRADE_COUNTER]: {
    titleKey: "server.notification.tradeCounter.title",
    messageKey: "server.notification.tradeCounter.message",
  },
  [NotificationType.TRADE_SHIPPED]: {
    titleKey: "server.notification.tradeShipped.title",
    messageKey: "server.notification.tradeShipped.message",
  },
  [NotificationType.TRADE_COMPLETED]: {
    titleKey: "server.notification.tradeCompleted.title",
    messageKey: "server.notification.tradeCompleted.message",
  },
  [NotificationType.NEW_MESSAGE]: {
    titleKey: "server.notification.newMessage.title",
    messageKey: "server.notification.newMessage.message",
  },
  [NotificationType.PRICE_DROP]: {
    titleKey: "server.notification.priceDrop.title",
    messageKey: "server.notification.priceDrop.message",
  },
  [NotificationType.WISHLIST_ITEM_SOLD]: {
    titleKey: "server.notification.wishlistItemSold.title",
    messageKey: "server.notification.wishlistItemSold.message",
  },
  [NotificationType.BACK_IN_STOCK]: {
    titleKey: "server.notification.backInStock.title",
    messageKey: "server.notification.backInStock.message",
  },
  [NotificationType.NEW_FOLLOWER]: {
    titleKey: "server.notification.newFollower.title",
    messageKey: "server.notification.newFollower.message",
  },
  [NotificationType.SELLER_NEW_LISTING]: {
    titleKey: "server.notification.sellerNewListing.title",
    messageKey: "server.notification.sellerNewListing.message",
  },
  [NotificationType.COLLECTION_LIKED]: {
    titleKey: "server.notification.collectionLiked.title",
    messageKey: "server.notification.collectionLiked.message",
  },
  [NotificationType.PRODUCT_LIKED]: {
    titleKey: "server.notification.productLiked.title",
    messageKey: "server.notification.productLiked.message",
  },
  [NotificationType.WISHLIST_SOLD]: {
    titleKey: "server.notification.wishlistSold.title",
    messageKey: "server.notification.wishlistSold.message",
  },
  [NotificationType.REVIEW_RECEIVED]: {
    titleKey: "server.notification.reviewReceived.title",
    messageKey: "server.notification.reviewReceived.message",
  },
  [NotificationType.MEMBERSHIP_EXPIRING]: {
    titleKey: "server.notification.membershipExpiring.title",
    messageKey: "server.notification.membershipExpiring.message",
  },
  [NotificationType.MEMBERSHIP_EXPIRED]: {
    titleKey: "server.notification.membershipExpired.title",
    messageKey: "server.notification.membershipExpired.message",
  },
  [NotificationType.MEMBERSHIP_RENEWAL_CARD_REQUIRED]: {
    titleKey: "server.notification.membershipRenewalCardRequired.title",
    messageKey: "server.notification.membershipRenewalCardRequired.message",
  },
  [NotificationType.MEMBERSHIP_UPGRADED]: {
    titleKey: "server.notification.membershipUpgraded.title",
    messageKey: "server.notification.membershipUpgraded.message",
  },
  [NotificationType.LISTING_EXPIRING]: {
    titleKey: "server.notification.listingExpiring.title",
    messageKey: "server.notification.listingExpiring.message",
  },
  [NotificationType.LISTING_EXPIRED]: {
    titleKey: "server.notification.listingExpired.title",
    messageKey: "server.notification.listingExpired.message",
  },
  [NotificationType.LISTING_VIEWS_MILESTONE]: {
    titleKey: "server.notification.listingViewsMilestone.title",
    messageKey: "server.notification.listingViewsMilestone.message",
  },
  [NotificationType.PROMOTION]: {
    titleKey: "server.notification.promotion.title",
    messageKey: "server.notification.promotion.message",
  },
  [NotificationType.SPECIAL_OFFER]: {
    titleKey: "server.notification.specialOffer.title",
    messageKey: "server.notification.specialOffer.message",
  },
  [NotificationType.WELCOME]: {
    titleKey: "server.notification.welcome.title",
    messageKey: "server.notification.welcome.message",
  },
  [NotificationType.PASSWORD_RESET]: {
    titleKey: "server.notification.passwordReset.title",
    messageKey: "server.notification.passwordReset.message",
  },
  [NotificationType.EMAIL_VERIFICATION]: {
    titleKey: "server.notification.emailVerification.title",
    messageKey: "server.notification.emailVerification.message",
  },
  [NotificationType.SYSTEM_ANNOUNCEMENT]: {
    titleKey: "server.notification.systemAnnouncement.title",
    messageKey: "server.notification.systemAnnouncement.message",
  },
  [NotificationType.BOOST_EXPIRED]: {
    titleKey: "server.notification.boostExpired.title",
    messageKey: "server.notification.boostExpired.message",
  },
  [NotificationType.BOOST_ENDING_SOON]: {
    titleKey: "server.notification.boostEndingSoon.title",
    messageKey: "server.notification.boostEndingSoon.message",
  },
  [NotificationType.BOOST_ACTIVATED]: {
    titleKey: "server.notification.boostActivated.title",
    messageKey: "server.notification.boostActivated.message",
  },
  [NotificationType.BOOST_GRANTED]: {
    titleKey: "server.notification.boostGranted.title",
    messageKey: "server.notification.boostGranted.message",
  },
  [NotificationType.BOOST_CANCELLED]: {
    titleKey: "server.notification.boostCancelled.title",
    messageKey: "server.notification.boostCancelled.message",
  },
  // Same title as a stop without a refund; the message adds the amount.
  [NotificationType.BOOST_REFUNDED]: {
    titleKey: "server.notification.boostCancelled.title",
    messageKey: "server.notification.boostRefunded.message",
  },
  [NotificationType.TRADE_CANCELLED]: {
    titleKey: "server.notification.tradeCancelled.title",
    messageKey: "server.notification.tradeCancelled.message",
  },
  [NotificationType.TRADE_DISPUTE_OPENED]: {
    titleKey: "server.notification.tradeDisputeOpened.title",
    messageKey: "server.notification.tradeDisputeOpened.message",
  },
  [NotificationType.TRADE_DISPUTE_RESOLVED]: {
    titleKey: "server.notification.tradeDisputeResolved.title",
    messageKey: "server.notification.tradeDisputeResolved.message",
  },
  [NotificationType.TRADE_AUTO_CANCELLED]: {
    titleKey: "server.notification.tradeAutoCancelled.title",
    messageKey: "server.notification.tradeAutoCancelled.message",
  },
  [NotificationType.TRADE_CANCELLED_BY_PLATFORM]: {
    titleKey: "server.notification.tradeCancelledByPlatform.title",
    messageKey: "server.notification.tradeCancelledByPlatform.message",
  },
  [NotificationType.TRADE_RESPONSE_EXTENDED]: {
    titleKey: "server.notification.tradeResponseExtended.title",
    messageKey: "server.notification.tradeResponseExtended.message",
  },
  [NotificationType.TRADE_PAYMENT_EXTENDED]: {
    titleKey: "server.notification.tradePaymentExtended.title",
    messageKey: "server.notification.tradePaymentExtended.message",
  },
  [NotificationType.TRADE_PAYMENT_EXTENDED_PAID]: {
    titleKey: "server.notification.tradePaymentExtendedPaid.title",
    messageKey: "server.notification.tradePaymentExtendedPaid.message",
  },
  [NotificationType.TRADE_AT_WAREHOUSE]: {
    titleKey: "server.notification.tradeAtWarehouse.title",
    messageKey: "server.notification.tradeAtWarehouse.message",
  },
  [NotificationType.TRADE_STUCK_AT_WAREHOUSE]: {
    titleKey: "server.notification.tradeStuckAtWarehouse.title",
    messageKey: "server.notification.tradeStuckAtWarehouse.message",
  },
  [NotificationType.ORDER_SHIPMENT_DELAYED]: {
    titleKey: "server.notification.orderShipmentDelayed.title",
    messageKey: "server.notification.orderShipmentDelayed.message",
  },
  [NotificationType.ORDER_STUCK_IN_TRANSIT]: {
    titleKey: "server.notification.orderStuckInTransit.title",
    messageKey: "server.notification.orderStuckInTransit.message",
  },
  [NotificationType.SURAT_TRACKING_NETWORK_FAILURE]: {
    titleKey: "server.notification.suratTrackingNetworkFailure.title",
    messageKey: "server.notification.suratTrackingNetworkFailure.message",
  },
  [NotificationType.ELOGO_INVOICE_EXHAUSTED]: {
    titleKey: "server.notification.elogoInvoiceExhausted.title",
    messageKey: "server.notification.elogoInvoiceExhausted.message",
  },
  [NotificationType.SELLER_INVOICE_MISSING]: {
    titleKey: "server.notification.sellerInvoiceMissing.title",
    messageKey: "server.notification.sellerInvoiceMissing.message",
  },
  [NotificationType.TRADE_OUTBOUND_DELIVERY_MISSING]: {
    titleKey: "server.notification.tradeOutboundDeliveryMissing.title",
    messageKey: "server.notification.tradeOutboundDeliveryMissing.message",
  },
  [NotificationType.TRADE_ADDRESS_REQUIRED]: {
    titleKey: "server.notification.tradeAddressRequired.title",
    messageKey: "server.notification.tradeAddressRequired.message",
  },
  [NotificationType.SELLER_ADDRESS_REQUIRED]: {
    titleKey: "server.notification.sellerAddressRequired.title",
    messageKey: "server.notification.sellerAddressRequired.message",
  },
  [NotificationType.CARGO_CODE_READY]: {
    titleKey: "server.notification.cargoCodeReady.title",
    messageKey: "server.notification.cargoCodeReady.message",
  },
  [NotificationType.CARGO_MOVEMENT_MISSING]: {
    titleKey: "server.notification.cargoMovementMissing.title",
    messageKey: "server.notification.cargoMovementMissing.message",
  },
  [NotificationType.OFFER_AUTO_REJECTED]: {
    titleKey: "server.notification.offerAutoRejected.title",
    messageKey: "server.notification.offerAutoRejected.message",
  },
  [NotificationType.RESERVATION_EXPIRED]: {
    titleKey: "server.notification.reservationExpired.title",
    messageKey: "server.notification.reservationExpired.message",
  },
  [NotificationType.REFUND_CANCELLED]: {
    titleKey: "server.notification.refundCancelled.title",
    messageKey: "server.notification.refundCancelled.message",
  },
  [NotificationType.REFUND_APPROVED]: {
    titleKey: "server.notification.refundApproved.title",
    messageKey: "server.notification.refundApproved.message",
  },
  [NotificationType.REFUND_RETURN_OPENED]: {
    titleKey: "server.notification.refundReturnOpened.title",
    messageKey: "server.notification.refundReturnOpened.message",
  },
  [NotificationType.REFUND_COMPLETED]: {
    titleKey: "server.notification.refundCompleted.title",
    messageKey: "server.notification.refundCompleted.message",
  },
  [NotificationType.COUPON_RETURNED]: {
    titleKey: "server.notification.couponReturned.title",
    messageKey: "server.notification.couponReturned.message",
  },
  [NotificationType.CAMPAIGN_BUDGET_EXHAUSTED]: {
    titleKey: "server.notification.campaignBudgetExhausted.title",
    messageKey: "server.notification.campaignBudgetExhausted.message",
  },
  [NotificationType.MODERATION_QUEUE_STALE]: {
    titleKey: "server.notification.moderationQueueStale.title",
    messageKey: "server.notification.moderationQueueStale.message",
  },
  [NotificationType.USER_BLOCKED_ADMIN]: {
    titleKey: "server.notification.userBlockedAdmin.title",
    messageKey: "server.notification.userBlockedAdmin.message",
  },
  [NotificationType.USER_REPORTED_ADMIN]: {
    titleKey: "server.notification.userReportedAdmin.title",
    messageKey: "server.notification.userReportedAdmin.message",
  },
  [NotificationType.REPORT_RESOLVED]: {
    titleKey: "server.notification.reportResolved.title",
    messageKey: "server.notification.reportResolved.message",
  },
  [NotificationType.REFUND_REQUEST_RECEIVED]: {
    titleKey: "server.notification.refundRequestReceived.title",
    messageKey: "server.notification.refundRequestReceived.message",
  },
  [NotificationType.REFUND_REQUEST_RECEIVED_SELLER]: {
    titleKey: "server.notification.refundRequestReceivedSeller.title",
    messageKey: "server.notification.refundRequestReceivedSeller.message",
  },
  [NotificationType.REFUND_REVIEW_REQUIRED_ADMIN]: {
    titleKey: "server.notification.refundReviewRequiredAdmin.title",
    messageKey: "server.notification.refundReviewRequiredAdmin.message",
  },
  [NotificationType.REFUND_RETURN_SHIPPED_SELLER]: {
    titleKey: "server.notification.refundReturnShippedSeller.title",
    messageKey: "server.notification.refundReturnShippedSeller.message",
  },
  [NotificationType.REFUND_RETURN_IN_TRANSIT]: {
    titleKey: "server.notification.refundReturnInTransit.title",
    messageKey: "server.notification.refundReturnInTransit.message",
  },
  [NotificationType.REFUND_RETURN_DELIVERED_BUYER]: {
    titleKey: "server.notification.refundReturnDeliveredBuyer.title",
    messageKey: "server.notification.refundReturnDeliveredBuyer.message",
  },
  [NotificationType.REFUND_RETURN_DELIVERED_SELLER]: {
    titleKey: "server.notification.refundReturnDeliveredSeller.title",
    messageKey: "server.notification.refundReturnDeliveredSeller.message",
  },
  [NotificationType.REFUND_COMPLETED_SELLER]: {
    titleKey: "server.notification.refundCompletedSeller.title",
    messageKey: "server.notification.refundCompletedSeller.message",
  },
  [NotificationType.REFUND_AUTO_ACCEPTED_SELLER]: {
    titleKey: "server.notification.refundAutoAcceptedSeller.title",
    messageKey: "server.notification.refundAutoAcceptedSeller.message",
  },
  [NotificationType.SELLER_APPLICATION_APPROVED]: {
    titleKey: "server.notification.sellerApplicationApproved.title",
    messageKey: "server.notification.sellerApplicationApproved.message",
  },
  [NotificationType.SELLER_APPLICATION_REJECTED]: {
    titleKey: "server.notification.sellerApplicationRejected.title",
    messageKey: "server.notification.sellerApplicationRejected.message",
  },
};
