/**
 * Notification Service (facade)
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Requirement: Push notifications, email, SMS (project.md)
 *
 * Thin facade over the notification split: every public method keeps its
 * original signature and delegates to the shared dispatch engine
 * (NotificationDispatchService) or a domain notifier
 * (NotificationCommerceService / NotificationAccountService). No behavior
 * change — external callers see the same surface.
 */
import { Injectable } from "@nestjs/common";
import {
  SendNotificationDto,
  NotificationType,
  RegisterPushTokenDto,
} from "./dto";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationAccountService } from "./notification-account.service";
import type { NotificationAudience } from "./notification-link";

@Injectable()
export class NotificationService {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly commerce: NotificationCommerceService,
    private readonly account: NotificationAccountService,
  ) {}

  // ==================== DISPATCH CORE ====================

  async send(dto: SendNotificationDto) {
    return this.dispatch.send(dto);
  }

  async createInAppNotification(
    userId: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<boolean> {
    return this.dispatch.createInAppNotification(userId, type, data);
  }

  async registerPushToken(userId: string, dto: RegisterPushTokenDto) {
    return this.dispatch.registerPushToken(userId, dto);
  }

  async getInAppNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    return this.dispatch.getInAppNotifications(userId, page, limit);
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    return this.dispatch.markAsRead(notificationId, userId);
  }

  async markAllAsRead(userId: string): Promise<void> {
    return this.dispatch.markAllAsRead(userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.dispatch.getUnreadCount(userId);
  }

  async sendTemplateEmailToUser(
    userId: string,
    templateKey: string,
    templateData: Record<string, any>,
  ): Promise<void> {
    return this.dispatch.sendTemplateEmailToUser(
      userId,
      templateKey,
      templateData,
    );
  }

  async sendTemplateEmailToAddress(
    email: string,
    templateKey: string,
    templateData: Record<string, any>,
  ) {
    return this.dispatch.sendTemplateEmailToAddress(
      email,
      templateKey,
      templateData,
    );
  }

  getProviderStatus() {
    return this.dispatch.getProviderStatus();
  }

  // ==================== COMMERCE NOTIFIERS ====================

  async notifyOrderCreated(buyerId: string, orderId: string, amount: number) {
    return this.commerce.notifyOrderCreated(buyerId, orderId, amount);
  }

  async notifyOrderPaid(sellerId: string, orderId: string, amount: number) {
    return this.commerce.notifyOrderPaid(sellerId, orderId, amount);
  }

  async notifyOrderShipped(
    buyerId: string,
    orderId: string,
    trackingNumber: string,
  ) {
    return this.commerce.notifyOrderShipped(buyerId, orderId, trackingNumber);
  }

  async notifyOrderDelivered(buyerId: string, orderId: string) {
    return this.commerce.notifyOrderDelivered(buyerId, orderId);
  }

  async notifyOrderDeliveredConfirm(
    buyerId: string,
    orderId: string,
    confirmationDeadline: Date,
  ) {
    return this.commerce.notifyOrderDeliveredConfirm(
      buyerId,
      orderId,
      confirmationDeadline,
    );
  }

  /** `audience` ZORUNLU: aynı bildirim iki tarafa da gidiyor. */
  async notifyOrderAutoCompleted(
    userId: string,
    orderId: string,
    audience: NotificationAudience,
  ) {
    return this.commerce.notifyOrderAutoCompleted(userId, orderId, audience);
  }

  async notifyOrderManuallyConfirmed(sellerId: string, orderId: string) {
    return this.commerce.notifyOrderManuallyConfirmed(sellerId, orderId);
  }

  /** `audience` ZORUNLU: aynı bildirim iki tarafa da gidiyor. */
  async notifyOrderForceCompletedByAdmin(
    userId: string,
    orderId: string,
    audience: NotificationAudience,
    reason?: string,
  ) {
    return this.commerce.notifyOrderForceCompletedByAdmin(
      userId,
      orderId,
      audience,
      reason,
    );
  }

  async notifySellerDidNotShipRefunded(buyerId: string, orderId: string) {
    return this.commerce.notifySellerDidNotShipRefunded(buyerId, orderId);
  }

  async notifyOfferReceived(
    sellerId: string,
    productId: string,
    amount: number,
  ) {
    return this.commerce.notifyOfferReceived(sellerId, productId, amount);
  }

  async notifyOfferAccepted(
    buyerId: string,
    productId: string,
    amount: number,
    orderId?: string,
    productTitle?: string,
  ) {
    return this.commerce.notifyOfferAccepted(
      buyerId,
      productId,
      amount,
      orderId,
      productTitle,
    );
  }

  async notifyOfferCounterAccepted(
    sellerId: string,
    productId: string,
    amount: number,
    orderId?: string,
    productTitle?: string,
  ) {
    return this.commerce.notifyOfferCounterAccepted(
      sellerId,
      productId,
      amount,
      orderId,
      productTitle,
    );
  }

  async notifyOfferExpired(params: {
    buyerId: string;
    sellerId: string;
    productId: string;
    productTitle: string;
  }) {
    return this.commerce.notifyOfferExpired(params);
  }

  async notifyOrderCancelledOutOfStock(
    buyerId: string,
    productId: string,
    _productTitle: string,
    _categoryId: string | null,
  ) {
    return this.commerce.notifyOrderCancelledOutOfStock(
      buyerId,
      productId,
      _productTitle,
      _categoryId,
    );
  }

  async notifyOfferCancelledOutOfStock(
    buyerId: string,
    productId: string,
    _productTitle: string,
    _categoryId: string | null,
  ) {
    return this.commerce.notifyOfferCancelledOutOfStock(
      buyerId,
      productId,
      _productTitle,
      _categoryId,
    );
  }

  async notifyReservationReleased(
    buyerId: string,
    orderId: string,
    productTitle: string,
  ) {
    return this.commerce.notifyReservationReleased(
      buyerId,
      orderId,
      productTitle,
    );
  }

  async notifyOrderPaymentExpired(
    buyerId: string,
    orderId: string,
    productTitle: string,
    fromOffer = false,
  ) {
    return this.commerce.notifyOrderPaymentExpired(
      buyerId,
      orderId,
      productTitle,
      fromOffer,
    );
  }

  async sendOrderCancelledEmails(orderId: string): Promise<void> {
    return this.commerce.sendOrderCancelledEmails(orderId);
  }

  async broadcastBackInStock(
    productId: string,
    productTitle: string,
  ): Promise<void> {
    return this.commerce.broadcastBackInStock(productId, productTitle);
  }

  async notifyBackInStock(
    userId: string,
    productId: string,
    _productTitle: string,
  ) {
    return this.commerce.notifyBackInStock(userId, productId, _productTitle);
  }

  async notifyTradeReceived(receiverId: string, tradeId: string) {
    return this.commerce.notifyTradeReceived(receiverId, tradeId);
  }

  async notifyTradeAccepted(initiatorId: string, tradeId: string) {
    return this.commerce.notifyTradeAccepted(initiatorId, tradeId);
  }

  async notifyTradeShipped(
    receiverId: string,
    tradeId: string,
    trackingNumber: string,
  ) {
    return this.commerce.notifyTradeShipped(
      receiverId,
      tradeId,
      trackingNumber,
    );
  }

  async notifyTradeCompleted(userId: string, tradeId: string) {
    return this.commerce.notifyTradeCompleted(userId, tradeId);
  }

  // ==================== ACCOUNT NOTIFIERS ====================

  async sendWelcomeEmail(userId: string) {
    return this.account.sendWelcomeEmail(userId);
  }

  async sendGuestContactAdminEmail(data: {
    referenceNumber: string;
    name: string;
    email: string;
    subject: string;
    message: string;
  }) {
    return this.account.sendGuestContactAdminEmail(data);
  }

  async sendPasswordResetEmail(userId: string, resetToken: string) {
    return this.account.sendPasswordResetEmail(userId, resetToken);
  }

  async sendEmailVerification(userId: string, verificationToken: string) {
    return this.account.sendEmailVerification(userId, verificationToken);
  }

  async sendEmailChangeCode(email: string, code: string, ttlSeconds: number) {
    return this.account.sendEmailChangeCode(email, code, ttlSeconds);
  }

  async sendGuestCheckoutVerificationCode(
    email: string,
    code: string,
    ttlSeconds: number,
  ) {
    return this.account.sendGuestCheckoutVerificationCode(
      email,
      code,
      ttlSeconds,
    );
  }
}
