import { Injectable, Logger } from "@nestjs/common";
import { InitiatePaymentDto, PayTRCallbackDto, DirectPaymentDto } from "./dto";
import { Prisma, PaymentStatus } from "@prisma/client";
import { type Locale } from "@tarodan/i18n";
import { Request } from "express";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentQueryService } from "./payment-query.service";
import {
  PaymentRefundService,
  type ProcessRefundOptions,
} from "./refund/payment-refund.service";
import { PaymentReconciliationService } from "./reconciliation/payment-reconciliation.service";
import { PaymentInitiationService } from "./checkout/payment-initiation.service";
import { PaymentCallbackService } from "./checkout/payment-callback.service";
import { PaymentFulfillmentService } from "./fulfillment/payment-fulfillment.service";
import { PaymentLifecycleService } from "./checkout/payment-lifecycle.service";
import type { PaymentAccessContext } from "./checkout/payment-lifecycle.service";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentQuery: PaymentQueryService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly paymentReconciliation: PaymentReconciliationService,
    private readonly paymentInitiation: PaymentInitiationService,
    private readonly paymentCallback: PaymentCallbackService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
    private readonly paymentLifecycle: PaymentLifecycleService,
  ) {}

  async initiatePaymentUnified(
    userId: string | null,
    dto: InitiatePaymentDto,
    req?: Request,
  ) {
    return this.paymentInitiation.initiatePaymentUnified(userId, dto, req);
  }

  async initiatePayment(
    buyerId: string,
    dto: InitiatePaymentDto,
    req?: Request,
  ) {
    return this.paymentInitiation.initiatePayment(buyerId, dto, req);
  }

  async initiateGuestPayment(dto: InitiatePaymentDto, req?: Request) {
    return this.paymentInitiation.initiateGuestPayment(dto, req);
  }

  async prepareDirectPayment(
    userId: string | null,
    dto: DirectPaymentDto,
    req?: Request,
    capabilityAuthorized = false,
  ) {
    return this.paymentInitiation.prepareDirectPayment(
      userId,
      dto,
      req,
      capabilityAuthorized,
    );
  }

  async initiateTradeCashPayment(
    tradeId: string,
    userId: string,
    req?: Request,
  ) {
    return this.paymentInitiation.initiateTradeCashPayment(
      tradeId,
      userId,
      req,
    );
  }

  async bypassCompletePayment(
    paymentId: string,
    userId?: string,
  ): Promise<{ success: boolean }> {
    return this.paymentInitiation.bypassCompletePayment(paymentId, userId);
  }

  async handlePayTRCallback(dto: PayTRCallbackDto) {
    return this.paymentCallback.handlePayTRCallback(dto);
  }

  async retryPayment(paymentId: string, userId: string, req?: Request) {
    return this.paymentLifecycle.retryPayment(paymentId, userId, req);
  }

  async cancelPayment(paymentId: string, userId: string) {
    return this.paymentLifecycle.cancelPayment(paymentId, userId);
  }

  async confirmFailedFromClient(
    paymentId: string,
    access: PaymentAccessContext,
  ): Promise<{ released: boolean }> {
    return this.paymentLifecycle.confirmFailedFromClient(paymentId, access);
  }

  async verifyPaymentFromClient(
    paymentId: string,
    access: PaymentAccessContext,
  ): Promise<{ completed: boolean; status: string }> {
    return this.paymentLifecycle.verifyPaymentFromClient(paymentId, access);
  }

  // Taşındı: payment-refund.service.ts — iade/escrow serbest bırakma (facade delege; imzalar aynı).

  async processRefund(
    orderId: string,
    refundAmount?: number,
    opts?: ProcessRefundOptions,
  ) {
    return this.paymentRefund.processRefund(orderId, refundAmount, opts);
  }

  async refundTradeCashPaymentIfCompleted(
    tradeId: string,
    opts?: { payerId?: string },
  ): Promise<{
    refunded: boolean;
    paymentId?: string;
    skippedReason?: string;
  }> {
    return this.paymentRefund.refundTradeCashPaymentIfCompleted(tradeId, opts);
  }

  async refundTradeCashTracked(
    tradeId: string,
    opts?: { payerId?: string },
  ): Promise<{
    refunded: boolean;
    failed: boolean;
    skippedReason?: string;
    reason?: string;
  }> {
    return this.paymentRefund.refundTradeCashTracked(tradeId, opts);
  }

  async releasePayment(
    orderId: string,
    opts?: { ignoreReleaseDate?: boolean },
  ) {
    return this.paymentRefund.releasePayment(orderId, opts);
  }

  async scheduleHoldReleaseOnDelivery(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    return this.paymentRefund.scheduleHoldReleaseOnDelivery(
      orderId,
      deliveredAt,
      tx,
    );
  }

  /**
   * Tek kanonik teslim handler'ı — order durumunu (48h'e göre) ayarlar VE escrow
   * release'ini planlar. Tüm teslim yolları (webhook/worker/Sürat poll/admin) bunu çağırır.
   */
  async handleOrderDelivered(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    acted: boolean;
    use48h: boolean;
    confirmationDeadline: Date | null;
    buyerId: string | null;
  }> {
    return this.paymentRefund.handleOrderDelivered(orderId, deliveredAt, tx);
  }

  /**
   * Koli başına tek duyuru hakkı (kargoya verildi / teslim edildi). İlk sipariş
   * satırı hakkı alır, kardeşleri sessiz kalır.
   */
  async claimOrderAnnouncement(
    kind: "shipped" | "delivered",
    order: { id: string; packageId: string | null },
  ): Promise<boolean> {
    return this.paymentRefund.claimPackageAnnouncement(kind, order);
  }

  /** Teslim duyurusu (post-commit): alıcıya bildirim + e-posta, koli başına tek. */
  async announceOrderDelivered(orderId: string): Promise<void> {
    return this.paymentRefund.announceOrderDelivered(orderId);
  }

  async releaseHoldsDue(): Promise<{
    count: number;
    tradeCashReleased: number;
  }> {
    return this.paymentRefund.releaseHoldsDue();
  }

  async releasePaymentIfHeld(orderId: string): Promise<boolean> {
    return this.paymentRefund.releasePaymentIfHeld(orderId);
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async processRefundedOrders(): Promise<{ refunded: number; failed: number }> {
    return this.paymentReconciliation.processRefundedOrders();
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async syncSavedCardsFromUtoken(
    userId: string,
    utoken: string,
    mandate?: { ip?: string; termsVersion?: string },
  ): Promise<number> {
    return this.paymentReconciliation.syncSavedCardsFromUtoken(
      userId,
      utoken,
      mandate,
    );
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async reconcileMissingInvoices(): Promise<{ generated: number }> {
    return this.paymentReconciliation.reconcileMissingInvoices();
  }

  // Taşındı: payment-query.service.ts — imzalar aynen korunuyor (facade delege).

  async getPaymentStatusUnified(
    paymentId: string,
    userId: string | null,
    capabilityAuthorized = false,
  ) {
    return this.paymentQuery.getPaymentStatusUnified(
      paymentId,
      userId,
      capabilityAuthorized,
    );
  }

  async getPaymentStatus(paymentId: string, userId: string) {
    return this.paymentQuery.getPaymentStatus(paymentId, userId);
  }

  async getGuestPaymentStatus(paymentId: string) {
    return this.paymentQuery.getGuestPaymentStatus(paymentId);
  }

  async findOne(paymentId: string, userId: string) {
    return this.paymentQuery.findOne(paymentId, userId);
  }

  async getSellerHolds(sellerId: string) {
    return this.paymentQuery.getSellerHolds(sellerId);
  }

  async getUserPayments(
    userId: string,
    options?: {
      status?: PaymentStatus;
      provider?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
    locale?: Locale,
  ) {
    return this.paymentQuery.getUserPayments(userId, options, locale);
  }

  async reconcilePendingPaytrPayments(): Promise<{
    checked: number;
    completed: number;
  }> {
    return this.paymentReconciliation.reconcilePendingPaytrPayments();
  }

  async detectOrphanCapturedFailedPayments(): Promise<{
    checked: number;
    recovered: number;
    alarms: number;
  }> {
    return this.paymentReconciliation.detectOrphanCapturedFailedPayments();
  }

  async resolveUnknownRefundOutcomes(): Promise<{
    checked: number;
    confirmed: number;
    requeued: number;
  }> {
    return this.paymentReconciliation.resolveUnknownRefundOutcomes();
  }

  async reconcileStuckRefundMarkers(): Promise<{
    checked: number;
    recovered: number;
    manualReview: number;
  }> {
    return this.paymentReconciliation.reconcileStuckRefundMarkers();
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async releaseExpiredOrderReservations(): Promise<{ count: number }> {
    return this.paymentReconciliation.releaseExpiredOrderReservations();
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async reconcileReservedQuantities(): Promise<{ count: number }> {
    return this.paymentReconciliation.reconcileReservedQuantities();
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async expireUnpaidOrders(): Promise<{ count: number }> {
    return this.paymentReconciliation.expireUnpaidOrders();
  }

  async cancelExpiredPayments() {
    return this.paymentReconciliation.cancelExpiredPayments();
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async handleExpiredPreparingOrders(): Promise<{
    warned: number;
    cancelled: number;
  }> {
    return this.paymentReconciliation.handleExpiredPreparingOrders();
  }
}
