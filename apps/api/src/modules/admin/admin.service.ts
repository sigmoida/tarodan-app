import { Injectable, Optional, Logger } from "@nestjs/common";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCommissionService } from "./admin-commission.service";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminUserService } from "./admin-user.service";
import { AdminStaffService } from "./admin-staff.service";
import { AdminProductService } from "./admin-product.service";
import { AdminOrderService } from "./admin-order.service";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { AdminModerationService } from "./admin-moderation.service";
import { AdminPaymentService } from "./admin-payment.service";
import { AdminPayoutService } from "./admin-payout.service";
import { AdminTradeService } from "./admin-trade.service";
import { AdminRefundService } from "./admin-refund.service";
import { AdminMessagingService } from "./admin-messaging.service";
import { AdminSupportService } from "./admin-support.service";
import { AdminContentService } from "./admin-content.service";
import { AdminTaxService } from "./admin-tax.service";
import { AdminMembershipService } from "./admin-membership.service";
import { AdminCatalogService } from "./admin-catalog.service";
import { AdminCollectionService } from "./admin-collection.service";
import { AdminNotificationService } from "./admin-notification.service";
import { AdminLogsService } from "./admin-logs.service";
import { AdminShippingService } from "./admin-shipping.service";
import { AdminReviewService } from "./admin-review.service";
import { AdminSellerApplicationService } from "./admin-seller-application.service";
import {
  CreateCommissionRuleDto,
  PreviewCommissionDto,
  UpdateCommissionRuleDto,
  UpdatePlatformSettingDto,
  AdminUserQueryDto,
  AdminProductQueryDto,
  AdminOrderQueryDto,
  AdminTradeQueryDto,
  AdminMessageQueryDto,
  AdminShipmentQueryDto,
  AdminRefundHistoryQueryDto,
  TradeShipmentQueryDto,
  RefundRequestQueryDto,
  AuditLogQueryDto,
  ApproveProductDto,
  RejectProductDto,
  BanUserDto,
  AssignAdminStaffDto,
  UpdateAdminStaffDto,
  UpdateStaffSettingsDto,
  SetRolePermissionsDto,
  ResolveDisputeDto,
  AnalyticsQueryDto,
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  ElogoInvoiceQueryDto,
  SellerUploadedInvoiceQueryDto,
  PaymentStatisticsQueryDto,
  PayoutTransactionsQueryDto,
  PayoutExportQueryDto,
  CreateStaticPageDto,
  UpdateStaticPageDto,
  UpdateEmailTemplateDto,
  UpdateProductDto,
  RatingQueryDto,
  RatingStatus,
  AdminUserRatingQueryDto,
  AdminCategoryQueryDto,
  AdminBrandQueryDto,
  AdminManufacturerQueryDto,
  AdminCarModelQueryDto,
  AdminAttributeGroupQueryDto,
  AdminAttributeQueryDto,
  ApproveWarehouseTradeDto,
  RejectWarehouseTradeDto,
  SellerApplicationQueryDto,
  RefundAttemptQueryDto,
  ResolveRefundAttemptDto,
  NotificationHistoryQueryDto,
  ScheduledNotificationQueryDto,
  ErrorLogQueryDto,
  SecurityLogQueryDto,
  EmailLogQueryDto,
} from "./dto";
import {
  TicketStatus,
  TicketPriority,
  TicketCategory,
  MembershipTierType,
} from "@prisma/client";
import { RefundService } from "../refund/refund.service";
import { OrderService } from "../order/order.service";
import { SuratTrackingService } from "../surat-cargo/surat-tracking.service";

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly refundService: RefundService,
    private readonly auditService: AdminAuditService,
    private readonly commissionService: AdminCommissionService,
    private readonly settingsService: AdminSettingsService,
    private readonly userService: AdminUserService,
    private readonly staffService: AdminStaffService,
    private readonly productService: AdminProductService,
    private readonly adminOrderService: AdminOrderService,
    private readonly analyticsService: AdminAnalyticsService,
    private readonly moderationService: AdminModerationService,
    private readonly adminPaymentService: AdminPaymentService,
    private readonly payoutService: AdminPayoutService,
    private readonly tradeService: AdminTradeService,
    private readonly adminRefundService: AdminRefundService,
    private readonly adminMessagingService: AdminMessagingService,
    private readonly adminSupportService: AdminSupportService,
    private readonly contentService: AdminContentService,
    private readonly taxService: AdminTaxService,
    private readonly membershipService: AdminMembershipService,
    private readonly catalogService: AdminCatalogService,
    private readonly collectionService: AdminCollectionService,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly logsService: AdminLogsService,
    private readonly shippingService: AdminShippingService,
    private readonly reviewService: AdminReviewService,
    private readonly sellerApplicationService: AdminSellerApplicationService,
    @Optional()
    private readonly orderService?: OrderService,
    @Optional()
    private readonly suratTrackingService?: SuratTrackingService,
  ) {}

  // ---------- Order 48h pencere admin müdahaleleri (Faz 3B.4) ----------

  async forceCompleteOrder(
    orderId: string,
    adminId: string,
    reason?: string,
  ): Promise<{ completed: boolean }> {
    if (!this.orderService) {
      throw new Error("OrderService not available");
    }
    return this.orderService.forceComplete(orderId, adminId, reason);
  }

  async extendOrderConfirmation(
    orderId: string,
    adminId: string,
    hours: number,
    reason?: string,
  ): Promise<{ newDeadline: Date }> {
    if (!this.orderService) {
      throw new Error("OrderService not available");
    }
    return this.orderService.extendConfirmation(
      orderId,
      adminId,
      hours,
      reason,
    );
  }

  // ---------- RefundRequest policy override (Faz 4B.1) ----------

  async overrideRefundPolicy(
    refundRequestId: string,
    adminId: string,
    payload: {
      refundProductAmount?: boolean;
      refundShippingFee?: boolean;
      refundBuyerFee?: boolean;
      refundSellerCommission?: boolean;
    },
  ) {
    return this.refundService.overrideRefundPolicy(
      refundRequestId,
      adminId,
      payload,
    );
  }

  async setReturnShippingPayer(
    refundRequestId: string,
    adminId: string,
    payer: "buyer" | "seller" | "platform",
  ) {
    return this.refundService.setReturnShippingPayer(
      refundRequestId,
      adminId,
      payer,
    );
  }

  // ==================== COMMISSION RULES ====================
  // Taşındı: admin-commission.service.ts — imzalar aynen korunuyor (facade delege).

  async getCommissionRules() {
    return this.commissionService.getCommissionRules();
  }

  async previewCommission(dto: PreviewCommissionDto) {
    return this.commissionService.previewCommission(dto);
  }

  async createCommissionRule(adminId: string, dto: CreateCommissionRuleDto) {
    return this.commissionService.createCommissionRule(adminId, dto);
  }

  async updateCommissionRule(
    adminId: string,
    ruleId: string,
    dto: UpdateCommissionRuleDto,
  ) {
    return this.commissionService.updateCommissionRule(adminId, ruleId, dto);
  }

  async deleteCommissionRule(adminId: string, ruleId: string) {
    return this.commissionService.deleteCommissionRule(adminId, ruleId);
  }

  // ==================== TAKAS KOMİSYONU (ayarlanabilir oran) ====================
  // Taşındı: admin-commission.service.ts — imzalar aynen korunuyor (facade delege).

  async getTradeCommissionRate() {
    return this.commissionService.getTradeCommissionRate();
  }

  async setTradeCommissionRate(adminId: string, rate: number) {
    return this.commissionService.setTradeCommissionRate(adminId, rate);
  }

  // ==================== PLATFORM SETTINGS ====================
  // Taşındı: admin-settings.service.ts — imzalar aynen korunuyor (facade delege).

  async getPlatformSettings() {
    return this.settingsService.getPlatformSettings();
  }

  async getPublicSettings() {
    return this.settingsService.getPublicSettings();
  }

  async updatePlatformSetting(adminId: string, dto: UpdatePlatformSettingDto) {
    return this.settingsService.updatePlatformSetting(adminId, dto);
  }

  // ==================== USER MANAGEMENT ====================
  // Taşındı: admin-user.service.ts — imzalar aynen korunuyor (facade delege).

  async getUsers(query: AdminUserQueryDto) {
    return this.userService.getUsers(query);
  }

  async getUserById(userId: string) {
    return this.userService.getUserById(userId);
  }

  // ==================== ADMIN: KULLANICI ÜYELİĞİ ====================
  // Taşındı: admin-user.service.ts — imzalar aynen korunuyor (facade delege).

  async adminCancelUserMembership(adminId: string, userId: string) {
    return this.userService.adminCancelUserMembership(adminId, userId);
  }

  async adminChangeUserMembership(
    adminId: string,
    userId: string,
    tierType: MembershipTierType,
    billingPeriod: "monthly" | "yearly" = "monthly",
  ) {
    return this.userService.adminChangeUserMembership(
      adminId,
      userId,
      tierType,
      billingPeriod,
    );
  }

  // ==================== ADMIN STAFF (admin rol yönetimi) ====================
  // Taşındı: admin-staff.service.ts — imzalar aynen korunuyor (facade delege).
  // Not: banUser da bu banner aralığında olduğu için bölümle birlikte taşındı.

  async getStaffSettings() {
    return this.staffService.getStaffSettings();
  }

  async setStaffSettings(actingUserId: string, dto: UpdateStaffSettingsDto) {
    return this.staffService.setStaffSettings(actingUserId, dto);
  }

  async getRolePermissions(): Promise<Record<string, string[]>> {
    return this.staffService.getRolePermissions();
  }

  async setRolePermissions(
    actingUserId: string,
    dto: SetRolePermissionsDto,
  ): Promise<Record<string, string[]>> {
    return this.staffService.setRolePermissions(actingUserId, dto);
  }

  async listAdminStaff() {
    return this.staffService.listAdminStaff();
  }

  async assignAdminStaff(actingUserId: string, dto: AssignAdminStaffDto) {
    return this.staffService.assignAdminStaff(actingUserId, dto);
  }

  async updateAdminStaff(
    actingUserId: string,
    id: string,
    dto: UpdateAdminStaffDto,
  ) {
    return this.staffService.updateAdminStaff(actingUserId, id, dto);
  }

  async removeAdminStaff(actingUserId: string, id: string) {
    return this.staffService.removeAdminStaff(actingUserId, id);
  }

  async banUser(adminId: string, userId: string, dto: BanUserDto) {
    return this.staffService.banUser(adminId, userId, dto);
  }

  // ==================== PRODUCT MANAGEMENT ====================
  // Taşındı: admin-product.service.ts — imzalar aynen korunuyor (facade delege).

  async getProducts(query: AdminProductQueryDto) {
    return this.productService.getProducts(query);
  }

  async exportProducts(query: {
    status?: string;
    categoryId?: string;
    sellerId?: string;
  }) {
    return this.productService.exportProducts(query);
  }

  async getProduct(productId: string) {
    return this.productService.getProduct(productId);
  }

  async updateProduct(
    adminId: string,
    productId: string,
    dto: UpdateProductDto,
  ) {
    return this.productService.updateProduct(adminId, productId, dto);
  }

  async approveProduct(
    adminId: string,
    productId: string,
    dto: ApproveProductDto,
  ) {
    return this.productService.approveProduct(adminId, productId, dto);
  }

  async rejectProduct(
    adminId: string,
    productId: string,
    dto: RejectProductDto,
  ) {
    return this.productService.rejectProduct(adminId, productId, dto);
  }

  async bulkApproveProducts(adminId: string, ids: string[], note?: string) {
    return this.productService.bulkApproveProducts(adminId, ids, note);
  }

  async bulkRejectProducts(adminId: string, ids: string[], reason: string) {
    return this.productService.bulkRejectProducts(adminId, ids, reason);
  }

  // ==================== ORDER MANAGEMENT ====================
  // Taşındı: admin-order.service.ts — imzalar aynen korunuyor (facade delege).
  // Not: resolveGuestBuyerForAdmin private yardımcısı yalnız bu bölümde
  // kullanıldığı için bölümle birlikte taşındı.

  async getOrders(query: AdminOrderQueryDto) {
    return this.adminOrderService.getOrders(query);
  }

  async getDisputedOrders(query: AdminOrderQueryDto) {
    return this.adminOrderService.getDisputedOrders(query);
  }

  async resolveDispute(
    adminId: string,
    orderId: string,
    dto: ResolveDisputeDto,
  ) {
    return this.adminOrderService.resolveDispute(adminId, orderId, dto);
  }

  // ==================== ANALYTICS & REPORTS ====================
  // Taşındı: admin-analytics.service.ts — imzalar aynen korunuyor (facade delege).
  // Not: getOrderById, updateOrderStatus, addOrderTracking, sendOrderNotification,
  // generateOrderInvoice, unbanUser, getRecentOrders, getPendingActions da bu
  // banner aralığında olduğu için bölümle birlikte taşındı. getDateKey private
  // yardımcısı yalnız bu bölümde kullanılıyordu, o da taşındı.

  async getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  async saveAnalyticsSnapshot() {
    return this.analyticsService.saveAnalyticsSnapshot();
  }

  async getSalesAnalytics(query: AnalyticsQueryDto) {
    return this.analyticsService.getSalesAnalytics(query);
  }

  async getRevenueAnalytics(query: AnalyticsQueryDto) {
    return this.analyticsService.getRevenueAnalytics(query);
  }

  async getUserAnalytics(query: AnalyticsQueryDto) {
    return this.analyticsService.getUserAnalytics(query);
  }

  async getOrderById(orderId: string) {
    return this.analyticsService.getOrderById(orderId);
  }

  async updateOrderStatus(
    adminId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    return this.analyticsService.updateOrderStatus(adminId, orderId, dto);
  }

  async addOrderTracking(
    adminId: string,
    orderId: string,
    dto: { trackingNumber: string; carrier: string; trackingUrl?: string },
  ) {
    return this.analyticsService.addOrderTracking(adminId, orderId, dto);
  }

  async sendOrderNotification(
    adminId: string,
    orderId: string,
    dto: {
      type: "status_update" | "shipped" | "delivered" | "custom";
      message?: string;
    },
  ) {
    return this.analyticsService.sendOrderNotification(adminId, orderId, dto);
  }

  async generateOrderInvoice(orderId: string) {
    return this.analyticsService.generateOrderInvoice(orderId);
  }

  async unbanUser(adminId: string, userId: string) {
    return this.analyticsService.unbanUser(adminId, userId);
  }

  async getRecentOrders(limit: number = 10) {
    return this.analyticsService.getRecentOrders(limit);
  }

  async getTopProducts(limit: number = 10) {
    return this.analyticsService.getTopProducts(limit);
  }

  async getTopSellers(limit: number = 10) {
    return this.analyticsService.getTopSellers(limit);
  }

  async getPendingActions() {
    return this.analyticsService.getPendingActions();
  }

  async generateSalesReport(query: ReportQueryDto) {
    return this.analyticsService.generateSalesReport(query);
  }

  async generateUsersReport(query: ReportQueryDto) {
    return this.analyticsService.generateUsersReport(query);
  }

  async generateProductsReport(query: ReportQueryDto) {
    return this.analyticsService.generateProductsReport(query);
  }

  async generateTradesReport(query: ReportQueryDto) {
    return this.analyticsService.generateTradesReport(query);
  }

  async getCommissionReport(query: ReportQueryDto) {
    return this.analyticsService.getCommissionReport(query);
  }

  async getCommissionRevenue(query: AnalyticsQueryDto) {
    return this.analyticsService.getCommissionRevenue(query);
  }

  async generateCustomReport(query: ReportQueryDto) {
    return this.analyticsService.generateCustomReport(query);
  }

  // ==================== AUDIT LOGS ====================
  // Taşındı: admin-audit.service.ts — imzalar aynen korunuyor (facade delege).

  async getAuditLogs(query: AuditLogQueryDto) {
    return this.auditService.getAuditLogs(query);
  }

  // ==================== MODERATION QUEUE ====================
  // Taşındı: admin-moderation.service.ts — imzalar aynen korunuyor (facade delege).

  async getModerationQueue(options: {
    type?: string;
    page: number;
    pageSize: number;
  }) {
    return this.moderationService.getModerationQueue(options);
  }

  async getModerationStats() {
    return this.moderationService.getModerationStats();
  }

  async getAiModerationList(options: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    return this.moderationService.getAiModerationList(options);
  }

  async getModerationEvents(options: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    decision?: string;
    kind?: string;
    page?: number;
    pageSize?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    sortType?: "text" | "number" | "date";
  }) {
    return this.moderationService.getModerationEvents(options);
  }

  async testImageModeration(imageUrl: string) {
    return this.moderationService.testImageModeration(imageUrl);
  }

  async getAiConfig() {
    return this.moderationService.getAiConfig();
  }

  async setAiConfig(relevanceThreshold?: number, nsfwThreshold?: number) {
    return this.moderationService.setAiConfig(
      relevanceThreshold,
      nsfwThreshold,
    );
  }

  async approveModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    notes?: string,
  ) {
    return this.moderationService.approveModerationItem(
      adminId,
      type,
      itemId,
      notes,
    );
  }

  async rejectModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    notes?: string,
  ) {
    return this.moderationService.rejectModerationItem(
      adminId,
      type,
      itemId,
      reason,
      notes,
    );
  }

  async flagModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    priority?: string,
  ) {
    return this.moderationService.flagModerationItem(
      adminId,
      type,
      itemId,
      reason,
      priority,
    );
  }

  // ==================== PAYMENT MANAGEMENT ====================
  // Taşındı: admin-payment.service.ts — imzalar aynen korunuyor (facade delege).

  async getPayments(query: AdminPaymentQueryDto) {
    return this.adminPaymentService.getPayments(query);
  }

  async getPaymentById(id: string) {
    return this.adminPaymentService.getPaymentById(id);
  }

  async getPaymentStatistics(query: PaymentStatisticsQueryDto) {
    return this.adminPaymentService.getPaymentStatistics(query);
  }

  async getFailedPayments(query: AdminPaymentQueryDto) {
    return this.adminPaymentService.getFailedPayments(query);
  }

  async manualRefund(
    adminId: string,
    paymentId: string,
    amount?: number,
    reason?: string,
    idempotencyKey?: string,
  ) {
    return this.adminPaymentService.manualRefund(
      adminId,
      paymentId,
      amount,
      reason,
      idempotencyKey,
    );
  }

  async getRefundAttempts(query: RefundAttemptQueryDto) {
    return this.adminPaymentService.getRefundAttempts(query);
  }

  async resolveRefundAttempt(
    adminId: string,
    attemptId: string,
    dto: ResolveRefundAttemptDto,
  ) {
    return this.adminPaymentService.resolveRefundAttempt(
      adminId,
      attemptId,
      dto,
    );
  }

  async getRefundHistory(query: AdminRefundHistoryQueryDto) {
    return this.adminPaymentService.getRefundHistory(query);
  }

  async forceCancelPayment(adminId: string, paymentId: string, reason: string) {
    return this.adminPaymentService.forceCancelPayment(
      adminId,
      paymentId,
      reason,
    );
  }

  // ==================== SELLER PAYOUTS ====================
  // Taşındı: admin-payout.service.ts — imzalar aynen korunuyor (facade delege).

  async getPayoutsSummary() {
    return this.payoutService.getPayoutsSummary();
  }

  async getPayoutsTransactions(query: PayoutTransactionsQueryDto) {
    return this.payoutService.getPayoutsTransactions(query);
  }

  async getPayoutsSchedule(query: {
    sellerId?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    sortType?: "text" | "number" | "date";
  }) {
    return this.payoutService.getPayoutsSchedule(query);
  }

  async getPayoutsExport(query: PayoutExportQueryDto) {
    return this.payoutService.getPayoutsExport(query);
  }

  async releasePayout(adminId: string, orderId: string, reason?: string) {
    return this.payoutService.releasePayout(adminId, orderId, reason);
  }

  async releaseTradePaymentHold(adminId: string, tradeId: string) {
    return this.payoutService.releaseTradePaymentHold(adminId, tradeId);
  }

  async retryPayoutTransfer(adminId: string, transferId: string) {
    return this.payoutService.retryPayoutTransfer(adminId, transferId);
  }

  async getFailedPayouts(page = 1, limit = 20) {
    return this.payoutService.getFailedPayouts(page, limit);
  }

  // ==================== TRADE MANAGEMENT ====================
  // Taşındı: admin-trade.service.ts — imzalar aynen korunuyor (facade delege).

  async getTrades(query: AdminTradeQueryDto) {
    return this.tradeService.getTrades(query);
  }

  async findTradeShipments(query: TradeShipmentQueryDto) {
    return this.tradeService.findTradeShipments(query);
  }

  async getTradeById(tradeId: string) {
    return this.tradeService.getTradeById(tradeId);
  }

  async resolveTrade(
    adminId: string,
    tradeId: string,
    dto: { resolution: string; note?: string },
  ) {
    return this.tradeService.resolveTrade(adminId, tradeId, dto);
  }

  async markWarehouseReceived(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.tradeService.markWarehouseReceived(
      adminId,
      tradeId,
      shipmentId,
    );
  }

  async approveWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: ApproveWarehouseTradeDto,
  ) {
    return this.tradeService.approveWarehouseTrade(adminId, tradeId, dto);
  }

  async rejectWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: RejectWarehouseTradeDto,
  ) {
    return this.tradeService.rejectWarehouseTrade(adminId, tradeId, dto);
  }

  async markReturnDelivered(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.tradeService.markReturnDelivered(adminId, tradeId, shipmentId);
  }

  async forceCancelStuckWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: { reason: string; sendArrivedItemBack?: boolean },
  ) {
    return this.tradeService.forceCancelStuckWarehouseTrade(
      adminId,
      tradeId,
      dto,
    );
  }

  async markReturnShipmentLost(
    adminId: string,
    tradeId: string,
    dto: { shipmentId: string; reason: string; compensateUserId?: string },
  ) {
    return this.tradeService.markReturnShipmentLost(adminId, tradeId, dto);
  }

  // ==================== REFUND REQUEST ADMIN ====================
  // Taşındı: admin-refund.service.ts — imzalar aynen korunuyor (facade delege).

  async listRefundRequests(query: RefundRequestQueryDto) {
    return this.adminRefundService.listRefundRequests(query);
  }

  async getRefundRequestDetail(refundRequestId: string) {
    return this.adminRefundService.getRefundRequestDetail(refundRequestId);
  }

  async forceFinalizeRefund(adminId: string, refundRequestId: string) {
    return this.adminRefundService.forceFinalizeRefund(
      adminId,
      refundRequestId,
    );
  }

  async closeStuckRefund(
    adminId: string,
    refundRequestId: string,
    reason?: string,
  ) {
    return this.adminRefundService.closeStuckRefund(
      adminId,
      refundRequestId,
      reason,
    );
  }

  async resolveTradeCompensation(
    adminId: string,
    tradeId: string,
    note?: string,
  ) {
    return this.adminRefundService.resolveTradeCompensation(
      adminId,
      tradeId,
      note,
    );
  }

  async retryTradeRefund(adminId: string, tradeId: string) {
    return this.adminRefundService.retryTradeRefund(adminId, tradeId);
  }

  // ==================== MESSAGE MANAGEMENT ====================
  // Taşındı: admin-messaging.service.ts — imzalar aynen korunuyor (facade delege).

  async getMessages(query: AdminMessageQueryDto) {
    return this.adminMessagingService.getMessages(query);
  }

  async getMessageById(messageId: string) {
    return this.adminMessagingService.getMessageById(messageId);
  }

  async approveMessage(adminId: string, messageId: string, notes?: string) {
    return this.adminMessagingService.approveMessage(adminId, messageId, notes);
  }

  async rejectMessage(adminId: string, messageId: string, reason?: string) {
    return this.adminMessagingService.rejectMessage(adminId, messageId, reason);
  }

  async revertMessage(adminId: string, messageId: string) {
    return this.adminMessagingService.revertMessage(adminId, messageId);
  }

  // ==================== SUPPORT TICKET MANAGEMENT ====================
  // Taşındı: admin-support.service.ts — imzalar aynen korunuyor (facade delege).

  async getSupportTickets(query: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assigneeId?: string;
    creatorId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    return this.adminSupportService.getSupportTickets(query);
  }

  async getSupportTicketById(ticketId: string) {
    return this.adminSupportService.getSupportTicketById(ticketId);
  }

  async updateSupportTicket(
    adminId: string,
    ticketId: string,
    dto: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assigneeId?: string;
      note?: string;
    },
  ) {
    return this.adminSupportService.updateSupportTicket(adminId, ticketId, dto);
  }

  async replyToSupportTicket(
    adminId: string,
    ticketId: string,
    message: string,
  ) {
    return this.adminSupportService.replyToSupportTicket(
      adminId,
      ticketId,
      message,
    );
  }

  // ==================== CATEGORY MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getCategories(query: AdminCategoryQueryDto) {
    return this.catalogService.getCategories(query);
  }

  async createCategory(
    adminId: string,
    dto: {
      name: string;
      description?: string;
      parentId?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.createCategory(adminId, dto);
  }

  async updateCategory(
    adminId: string,
    categoryId: string,
    dto: {
      name?: string;
      description?: string;
      parentId?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.updateCategory(adminId, categoryId, dto);
  }

  async deleteCategory(adminId: string, categoryId: string) {
    return this.catalogService.deleteCategory(adminId, categoryId);
  }

  // ==================== STATIC PAGES ====================
  // Taşındı: admin-content.service.ts — imzalar aynen korunuyor (facade delege).

  async getPages() {
    return this.contentService.getPages();
  }

  async getPageById(id: string) {
    return this.contentService.getPageById(id);
  }

  async getPageBySlug(slug: string) {
    return this.contentService.getPageBySlug(slug);
  }

  async createPage(adminId: string, dto: CreateStaticPageDto) {
    return this.contentService.createPage(adminId, dto);
  }

  async updatePage(adminId: string, id: string, dto: UpdateStaticPageDto) {
    return this.contentService.updatePage(adminId, id, dto);
  }

  async deletePage(adminId: string, id: string) {
    return this.contentService.deletePage(adminId, id);
  }

  // ==================== EMAIL TEMPLATES ====================
  // Taşındı: admin-content.service.ts — imzalar aynen korunuyor (facade delege).

  substituteVariables(text: string, data: Record<string, any>): string {
    return this.contentService.substituteVariables(text, data);
  }

  async getEmailTemplates() {
    return this.contentService.getEmailTemplates();
  }

  async getEmailTemplate(key: string) {
    return this.contentService.getEmailTemplate(key);
  }

  async updateEmailTemplate(
    adminId: string,
    key: string,
    dto: UpdateEmailTemplateDto,
  ) {
    return this.contentService.updateEmailTemplate(adminId, key, dto);
  }

  async resetEmailTemplate(adminId: string, key: string) {
    return this.contentService.resetEmailTemplate(adminId, key);
  }

  async previewEmailTemplate(
    key: string,
    templateData?: Record<string, any>,
    overrideHtml?: string,
    overrideSubject?: string,
  ) {
    return this.contentService.previewEmailTemplate(
      key,
      templateData,
      overrideHtml,
      overrideSubject,
    );
  }

  async sendTestEmail(
    key: string,
    dto: { to: string; templateData?: Record<string, any> },
  ) {
    return this.contentService.sendTestEmail(key, dto);
  }

  // ==================== TAX SETTINGS (Regions, Rates, Rules, Reporting) ====================
  // Taşındı: admin-tax.service.ts — imzalar aynen korunuyor (facade delege).

  async getTaxRegions() {
    return this.taxService.getTaxRegions();
  }

  async createTaxRegion(
    adminId: string,
    dto: {
      name: string;
      countryCode: string;
      regionCode?: string;
      isDefault?: boolean;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.taxService.createTaxRegion(adminId, dto);
  }

  async updateTaxRegion(
    adminId: string,
    id: string,
    dto: {
      name?: string;
      countryCode?: string;
      regionCode?: string;
      isDefault?: boolean;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.taxService.updateTaxRegion(adminId, id, dto);
  }

  async deleteTaxRegion(adminId: string, id: string) {
    return this.taxService.deleteTaxRegion(adminId, id);
  }

  async getTaxRates(regionId?: string) {
    return this.taxService.getTaxRates(regionId);
  }

  async createTaxRate(
    adminId: string,
    dto: {
      taxRegionId?: string;
      name: string;
      rate: number;
      isDefault?: boolean;
      effectiveFrom?: string;
      effectiveTo?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.taxService.createTaxRate(adminId, dto);
  }

  async updateTaxRate(
    adminId: string,
    id: string,
    dto: {
      name?: string;
      rate?: number;
      isDefault?: boolean;
      effectiveFrom?: string;
      effectiveTo?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.taxService.updateTaxRate(adminId, id, dto);
  }

  async deleteTaxRate(adminId: string, id: string) {
    return this.taxService.deleteTaxRate(adminId, id);
  }

  async getTaxRules(regionId?: string) {
    return this.taxService.getTaxRules(regionId);
  }

  async createTaxRule(
    adminId: string,
    dto: {
      taxRegionId?: string;
      taxRateId: string;
      scope: string;
      categoryId?: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    return this.taxService.createTaxRule(adminId, dto);
  }

  async updateTaxRule(
    adminId: string,
    id: string,
    dto: {
      taxRateId?: string;
      scope?: string;
      categoryId?: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    return this.taxService.updateTaxRule(adminId, id, dto);
  }

  async deleteTaxRule(adminId: string, id: string) {
    return this.taxService.deleteTaxRule(adminId, id);
  }

  async getTaxReport(query: {
    fromDate?: string;
    toDate?: string;
    groupBy?: "day" | "month" | "year" | "region";
    regionId?: string;
  }) {
    return this.taxService.getTaxReport(query);
  }

  // ==================== BASİT KDV CONFIG (tek oran + kategori istisnaları) ====================
  // Taşındı: admin-tax.service.ts — imzalar aynen korunuyor (facade delege).

  async getVatConfig() {
    return this.taxService.getVatConfig();
  }

  async setDefaultVat(adminId: string, ratePercent: number) {
    return this.taxService.setDefaultVat(adminId, ratePercent);
  }

  async setVatOverride(
    adminId: string,
    categoryId: string,
    ratePercent: number,
  ) {
    return this.taxService.setVatOverride(adminId, categoryId, ratePercent);
  }

  async deleteVatOverride(adminId: string, ruleId: string) {
    return this.taxService.deleteVatOverride(adminId, ruleId);
  }

  // ==================== E-TİCARET STOPAJI (GVK 94/19, tevkifat) ====================
  // Taşındı: admin-tax.service.ts — imzalar aynen korunuyor (facade delege).

  async getWithholdingRate() {
    return this.taxService.getWithholdingRate();
  }

  async setWithholdingRate(adminId: string, rate: number) {
    return this.taxService.setWithholdingRate(adminId, rate);
  }

  async getWithholdingReport(query: { year: number; month: number }) {
    return this.taxService.getWithholdingReport(query);
  }

  // ==================== ELOGO FATURA (e-Arşiv/e-Fatura) ====================
  // Taşındı: admin-tax.service.ts — imzalar aynen korunuyor (facade delege).

  async getElogoInvoices(query: ElogoInvoiceQueryDto) {
    return this.taxService.getElogoInvoices(query);
  }

  async getSellerUploadedInvoices(query: SellerUploadedInvoiceQueryDto) {
    return this.taxService.getSellerUploadedInvoices(query);
  }

  async getSellerUploadedInvoicePdf(id: string) {
    return this.taxService.getSellerUploadedInvoicePdf(id);
  }

  // ==================== MEMBERSHIP TIER MANAGEMENT ====================
  // Taşındı: admin-membership.service.ts — imzalar aynen korunuyor (facade delege).

  async getMembershipTiers() {
    return this.membershipService.getMembershipTiers();
  }

  async updateMembershipTier(
    adminId: string,
    tierId: string,
    dto: {
      name?: string;
      description?: string;
      monthlyPrice?: number;
      yearlyPrice?: number;
      maxFreeListings?: number;
      maxTotalListings?: number;
      maxImagesPerListing?: number;
      canCreateCollections?: boolean;
      canTrade?: boolean;
      isAdFree?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.membershipService.updateMembershipTier(adminId, tierId, dto);
  }

  // ==================== PRODUCT DELETION (ADMIN) ====================
  // Taşındı: admin-product.service.ts — imzalar aynen korunuyor (facade delege).

  async deleteProduct(
    adminId: string,
    productId: string,
    hardDelete: boolean = false,
  ) {
    return this.productService.deleteProduct(adminId, productId, hardDelete);
  }

  async restoreProduct(adminId: string, productId: string) {
    return this.productService.restoreProduct(adminId, productId);
  }

  // ==================== BRAND MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getBrands(query: AdminBrandQueryDto) {
    return this.catalogService.getBrands(query);
  }

  async createBrand(
    adminId: string,
    dto: {
      name: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      foundedYear?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.createBrand(adminId, dto);
  }

  async updateBrand(
    adminId: string,
    brandId: string,
    dto: {
      name?: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      foundedYear?: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.updateBrand(adminId, brandId, dto);
  }

  async deleteBrand(adminId: string, brandId: string) {
    return this.catalogService.deleteBrand(adminId, brandId);
  }

  // ==================== MANUFACTURER MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getManufacturers(query: AdminManufacturerQueryDto) {
    return this.catalogService.getManufacturers(query);
  }

  async createManufacturer(
    adminId: string,
    dto: {
      name: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      foundedYear?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.createManufacturer(adminId, dto);
  }

  async updateManufacturer(
    adminId: string,
    id: string,
    dto: {
      name?: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      foundedYear?: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.updateManufacturer(adminId, id, dto);
  }

  async deleteManufacturer(adminId: string, id: string) {
    return this.catalogService.deleteManufacturer(adminId, id);
  }

  // ==================== CAR MODEL MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getCarModels(query: AdminCarModelQueryDto) {
    return this.catalogService.getCarModels(query);
  }

  async createCarModel(
    adminId: string,
    dto: {
      brandId: string;
      name: string;
      slug?: string;
      yearStart?: number;
      yearEnd?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.createCarModel(adminId, dto);
  }

  async updateCarModel(
    adminId: string,
    id: string,
    dto: {
      name?: string;
      slug?: string;
      yearStart?: number;
      yearEnd?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.updateCarModel(adminId, id, dto);
  }

  async deleteCarModel(adminId: string, id: string) {
    return this.catalogService.deleteCarModel(adminId, id);
  }

  // ==================== SHIPPING (view-only) ====================
  // Taşındı: admin-shipping.service.ts — imzalar aynen korunuyor (facade delege).

  async getShipments(query: AdminShipmentQueryDto) {
    return this.shippingService.getShipments(query);
  }

  async syncShipmentTracking(shipmentId: string) {
    return this.shippingService.syncShipmentTracking(shipmentId);
  }

  async runSuratEndpointTest() {
    return this.shippingService.runSuratEndpointTest();
  }

  async suratTestTrack(ref: string) {
    return this.shippingService.suratTestTrack(ref);
  }

  async suratTestCancel(ref: string) {
    return this.shippingService.suratTestCancel(ref);
  }

  async suratTestBarcode() {
    return this.shippingService.suratTestBarcode();
  }

  async suratTestSil(ref: string) {
    return this.shippingService.suratTestSil(ref);
  }

  // ==================== NOTIFICATION MANAGEMENT ====================
  // Taşındı: admin-notification.service.ts — imzalar aynen korunuyor (facade delege).

  async getNotificationHistory(query: NotificationHistoryQueryDto) {
    return this.adminNotificationService.getNotificationHistory(query);
  }

  async sendNotification(
    adminId: string,
    dto: {
      title: string;
      body: string;
      channels: string[];
      targetType: "all" | "segment" | "user_ids";
      userIds?: string[];
      segmentCriteria?: Record<string, any>;
      data?: Record<string, any>;
    },
  ) {
    return this.adminNotificationService.sendNotification(adminId, dto);
  }

  async scheduleNotification(
    adminId: string,
    dto: {
      title: string;
      body: string;
      channels: string[];
      targetType: "all" | "segment" | "user_ids";
      userIds?: string[];
      segmentCriteria?: Record<string, any>;
      scheduledFor: string;
    },
  ) {
    return this.adminNotificationService.scheduleNotification(adminId, dto);
  }

  async getScheduledNotifications(query?: ScheduledNotificationQueryDto) {
    return this.adminNotificationService.getScheduledNotifications(query);
  }

  async cancelScheduledNotification(adminId: string, notificationId: string) {
    return this.adminNotificationService.cancelScheduledNotification(
      adminId,
      notificationId,
    );
  }

  // ==================== ERROR LOGS ====================
  // Taşındı: admin-logs.service.ts — imzalar aynen korunuyor (facade delege).

  async getErrorLogs(query: ErrorLogQueryDto) {
    return this.logsService.getErrorLogs(query);
  }

  // ==================== SECURITY LOGS ====================
  // Taşındı: admin-logs.service.ts — imzalar aynen korunuyor (facade delege).

  async getSecurityLogs(query: SecurityLogQueryDto) {
    return this.logsService.getSecurityLogs(query);
  }

  async resolveSecurityIssue(adminId: string, logId: string, notes?: string) {
    return this.logsService.resolveSecurityIssue(adminId, logId, notes);
  }

  async blockIP(adminId: string, ipAddress: string, reason?: string) {
    return this.logsService.blockIP(adminId, ipAddress, reason);
  }

  // ==================== EMAIL LOGS ====================
  // Taşındı: admin-logs.service.ts — imzalar aynen korunuyor (facade delege).

  async getEmailLogs(query: EmailLogQueryDto) {
    return this.logsService.getEmailLogs(query);
  }

  // ==================== COLLECTION MANAGEMENT ====================
  // Taşındı: admin-collection.service.ts — imzalar aynen korunuyor (facade delege).

  async getCollections(query: {
    search?: string;
    userId?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    sortType?: "text" | "number" | "date";
  }) {
    return this.collectionService.getCollections(query);
  }

  async getCollectionById(collectionId: string) {
    return this.collectionService.getCollectionById(collectionId);
  }

  async createAdminCollection(
    adminId: string,
    dto: {
      name: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageKey?: string;
      userId?: string;
    },
  ) {
    return this.collectionService.createAdminCollection(adminId, dto);
  }

  async updateAdminCollection(
    adminId: string,
    collectionId: string,
    dto: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageKey?: string;
    },
  ) {
    return this.collectionService.updateAdminCollection(
      adminId,
      collectionId,
      dto,
    );
  }

  async deleteAdminCollection(adminId: string, collectionId: string) {
    return this.collectionService.deleteAdminCollection(adminId, collectionId);
  }

  async addItemsToCollection(
    adminId: string,
    collectionId: string,
    productIds: string[],
  ) {
    return this.collectionService.addItemsToCollection(
      adminId,
      collectionId,
      productIds,
    );
  }

  async removeItemFromAdminCollection(
    adminId: string,
    collectionId: string,
    itemId: string,
  ) {
    return this.collectionService.removeItemFromAdminCollection(
      adminId,
      collectionId,
      itemId,
    );
  }

  async setCollectionVisibility(
    adminId: string,
    collectionId: string,
    isPublic: boolean,
  ) {
    return this.collectionService.setCollectionVisibility(
      adminId,
      collectionId,
      isPublic,
    );
  }

  async setCollectionFeatured(
    adminId: string,
    collectionId: string,
    isFeatured: boolean,
  ) {
    return this.collectionService.setCollectionFeatured(
      adminId,
      collectionId,
      isFeatured,
    );
  }

  // ==================== ATTRIBUTE GROUP MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getAttributeGroups(query: AdminAttributeGroupQueryDto) {
    return this.catalogService.getAttributeGroups(query);
  }

  async getAttributeGroupById(groupId: string) {
    return this.catalogService.getAttributeGroupById(groupId);
  }

  async createAttributeGroup(
    adminId: string,
    dto: {
      name: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.catalogService.createAttributeGroup(adminId, dto);
  }

  async updateAttributeGroup(
    adminId: string,
    groupId: string,
    dto: {
      name?: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.catalogService.updateAttributeGroup(adminId, groupId, dto);
  }

  async deleteAttributeGroup(adminId: string, groupId: string) {
    return this.catalogService.deleteAttributeGroup(adminId, groupId);
  }

  // ==================== ATTRIBUTE VALUE MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getAttributes(query: AdminAttributeQueryDto) {
    return this.catalogService.getAttributes(query);
  }

  async createAttribute(
    adminId: string,
    dto: {
      groupId: string;
      value: string;
      displayValue?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.createAttribute(adminId, dto);
  }

  async updateAttribute(
    adminId: string,
    attributeId: string,
    dto: {
      value?: string;
      displayValue?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.updateAttribute(adminId, attributeId, dto);
  }

  async deleteAttribute(adminId: string, attributeId: string) {
    return this.catalogService.deleteAttribute(adminId, attributeId);
  }

  // ==================== REVIEWS & RATINGS ====================
  // Taşındı: admin-review.service.ts — imzalar aynen korunuyor (facade delege).

  async getReviews(query: RatingQueryDto) {
    return this.reviewService.getReviews(query);
  }

  async updateReviewStatus(
    adminId: string,
    reviewId: string,
    status: RatingStatus,
  ) {
    return this.reviewService.updateReviewStatus(adminId, reviewId, status);
  }

  async getUserRatings(query: AdminUserRatingQueryDto) {
    return this.reviewService.getUserRatings(query);
  }

  // ==================== SELLER APPLICATIONS ====================
  // Taşındı: admin-seller-application.service.ts — imzalar aynen korunuyor (facade delege).
  // Not: updateUserRatingStatus ve applyOrderCoupon da bu banner aralığında
  // olduğu için bölümle birlikte taşındı.

  async getSellerApplications(query: SellerApplicationQueryDto) {
    return this.sellerApplicationService.getSellerApplications(query);
  }

  async getSellerApplicationDetail(userId: string) {
    return this.sellerApplicationService.getSellerApplicationDetail(userId);
  }

  async approveSellerApplication(adminId: string, userId: string) {
    return this.sellerApplicationService.approveSellerApplication(
      adminId,
      userId,
    );
  }

  async rejectSellerApplication(
    adminId: string,
    userId: string,
    reason: string,
  ) {
    return this.sellerApplicationService.rejectSellerApplication(
      adminId,
      userId,
      reason,
    );
  }

  async updateUserRatingStatus(
    adminId: string,
    ratingId: string,
    status: RatingStatus,
  ) {
    return this.sellerApplicationService.updateUserRatingStatus(
      adminId,
      ratingId,
      status,
    );
  }

  async applyOrderCoupon(
    orderId: string,
    adminId: string,
    code: string | null,
  ) {
    return this.sellerApplicationService.applyOrderCoupon(
      orderId,
      adminId,
      code,
    );
  }
}
