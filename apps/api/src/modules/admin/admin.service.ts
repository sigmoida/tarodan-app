import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Optional,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { ModerationAiClient } from '../moderation/moderation-ai.client';
import { AdminAuditService } from './admin-audit.service';
import { AdminCommissionService } from './admin-commission.service';
import { AdminSettingsService } from './admin-settings.service';
import { AdminUserService } from './admin-user.service';
import { AdminStaffService } from './admin-staff.service';
import { AdminProductService } from './admin-product.service';
import { AdminOrderService } from './admin-order.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminPaymentService } from './admin-payment.service';
import { AdminPayoutService } from './admin-payout.service';
import { AdminTradeService } from './admin-trade.service';
import { AdminRefundService } from './admin-refund.service';
import { AdminMessagingService } from './admin-messaging.service';
import {
  fulltextUserSearch,
  fulltextProductRatingSearch,
  fulltextUserDisplayNameSearch,
  fulltextCollectionSearch,
  fulltextAttributeGroupSearch,
  fulltextAttributeSearch,
  fulltextPaymentSearch,
  fulltextOrderSearch,
  fulltextDiscountSearch,
  fulltextErrorLogSearch,
  fulltextSecurityLogSearch,
  fulltextEmailLogSearch,
} from '../../common/helpers/fulltext-search';
import { fulltextProductSearch } from '../product/helpers/fulltext-search';
import { renderEmailTemplate, getEmailTemplateSubject } from '../../common/helpers/email-template-renderer';
import {
  CreateCommissionRuleDto,
  UpdateCommissionRuleDto,
  UpdatePlatformSettingDto,
  AdminUserQueryDto,
  AdminProductQueryDto,
  AdminOrderQueryDto,
  AuditLogQueryDto,
  ApproveProductDto,
  RejectProductDto,
  BanUserDto,
  AssignAdminStaffDto,
  UpdateAdminStaffDto,
  UpdateStaffSettingsDto,
  SetRolePermissionsDto,
  DEFAULT_ROLE_PERMISSIONS,
  ADMIN_PERMISSION_KEYS,
  migrateLegacyPermissions,
  ResolveDisputeDto,
  AnalyticsQueryDto,
  AnalyticsGroupBy,
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
  PayoutTransactionsQueryDto,
  PayoutExportQueryDto,
  CreateStaticPageDto,
  UpdateStaticPageDto,
  UpdateEmailTemplateDto,
  UpdateProductDto,
  RatingQueryDto,
  UpdateRatingStatusDto,
  RatingStatus,
  ApproveWarehouseTradeDto,
  RejectWarehouseTradeDto,
} from './dto';
import { ProductStatus, OrderStatus, Prisma, PaymentStatus, PaymentHoldStatus, OfferStatus, TradeStatus, ShipmentStatus, MessageStatus, TicketStatus, TicketPriority, TicketCategory, Brand, AdminRole, BusinessStatus, MembershipTierType, SubscriptionStatus } from '@prisma/client';
import { safeDecrementReserved } from '../product/helpers/product-availability.helper';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { PaymentService } from '../payment/payment.service';
import { MessagingService } from '../messaging/messaging.service';
import { SupportService } from '../support/support.service';
import { SearchService } from '../search/search.service';
import { CacheService } from '../cache/cache.service';
import { DiscountService } from '../discount/discount.service';
import { EventService } from '../events/event.service';
import { RatingService } from '../rating/rating.service';
import { RefundService } from '../refund/refund.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType, NotificationChannel } from '../notification/dto/notification.dto';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { normalizeSuratPhone, normalizeSuratLocation } from '../surat-cargo/surat-address.util';
import { OrderService } from '../order/order.service';
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
} from '../surat-cargo/surat-cargo.types';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly messagingService: MessagingService,
    private readonly supportService: SupportService,
    private readonly searchService: SearchService,
    private readonly cache: CacheService,
    private readonly discountService: DiscountService,
    private readonly eventService: EventService,
    private readonly ratingService: RatingService,
    private readonly refundService: RefundService,
    private readonly notificationService: NotificationService,
    private readonly moderationAi: ModerationAiClient,
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
    @Optional()
    private readonly storageService: StorageService,
    @Optional()
    private readonly suratCargoService?: SuratCargoService,
    @Optional()
    private readonly orderService?: OrderService,
  ) { }

  // ---------- Order 48h pencere admin müdahaleleri (Faz 3B.4) ----------

  async forceCompleteOrder(
    orderId: string,
    adminId: string,
    reason?: string,
  ): Promise<{ completed: boolean }> {
    if (!this.orderService) {
      throw new Error('OrderService not available');
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
      throw new Error('OrderService not available');
    }
    return this.orderService.extendConfirmation(orderId, adminId, hours, reason);
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
    return this.refundService.overrideRefundPolicy(refundRequestId, adminId, payload);
  }

  async setReturnShippingPayer(
    refundRequestId: string,
    adminId: string,
    payer: 'buyer' | 'seller' | 'platform',
  ) {
    return this.refundService.setReturnShippingPayer(refundRequestId, adminId, payer);
  }

  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if ((imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://')) && imageKeyOrUrl.includes('X-Amz-Signature')) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = '';
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== COMMISSION RULES ====================
  // Taşındı: admin-commission.service.ts — imzalar aynen korunuyor (facade delege).

  async getCommissionRules() {
    return this.commissionService.getCommissionRules();
  }

  async createCommissionRule(adminId: string, dto: CreateCommissionRuleDto) {
    return this.commissionService.createCommissionRule(adminId, dto);
  }

  async updateCommissionRule(adminId: string, ruleId: string, dto: UpdateCommissionRuleDto) {
    return this.commissionService.updateCommissionRule(adminId, ruleId, dto);
  }

  async deleteCommissionRule(adminId: string, ruleId: string) {
    return this.commissionService.deleteCommissionRule(adminId, ruleId);
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
    billingPeriod: 'monthly' | 'yearly' = 'monthly',
  ) {
    return this.userService.adminChangeUserMembership(adminId, userId, tierType, billingPeriod);
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

  async updateAdminStaff(actingUserId: string, id: string, dto: UpdateAdminStaffDto) {
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

  async exportProducts(query: { status?: string; categoryId?: string; sellerId?: string }) {
    return this.productService.exportProducts(query);
  }

  async getProduct(productId: string) {
    return this.productService.getProduct(productId);
  }

  async updateProduct(adminId: string, productId: string, dto: UpdateProductDto) {
    return this.productService.updateProduct(adminId, productId, dto);
  }

  async approveProduct(adminId: string, productId: string, dto: ApproveProductDto) {
    return this.productService.approveProduct(adminId, productId, dto);
  }

  async rejectProduct(adminId: string, productId: string, dto: RejectProductDto) {
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

  async resolveDispute(adminId: string, orderId: string, dto: ResolveDisputeDto) {
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

  async updateOrderStatus(adminId: string, orderId: string, dto: UpdateOrderStatusDto) {
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
    dto: { type: 'status_update' | 'shipped' | 'delivered' | 'custom'; message?: string },
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
  // Not: private createAuditLog delegesi facade'da kalıyor — kalan bölümler
  // hâlâ this.createAuditLog üzerinden çağırıyor.

  async getAuditLogs(query: AuditLogQueryDto) {
    return this.auditService.getAuditLogs(query);
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    // Taşındı: admin-audit.service.ts — tüm bölüm çağrıları bu delege üzerinden akar.
    return this.auditService.createAuditLog(adminUserId, action, entityType, entityId, oldValue, newValue);
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
    return this.moderationService.setAiConfig(relevanceThreshold, nsfwThreshold);
  }

  async approveModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    notes?: string,
  ) {
    return this.moderationService.approveModerationItem(adminId, type, itemId, notes);
  }

  async rejectModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    notes?: string,
  ) {
    return this.moderationService.rejectModerationItem(adminId, type, itemId, reason, notes);
  }

  async flagModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    priority?: string,
  ) {
    return this.moderationService.flagModerationItem(adminId, type, itemId, reason, priority);
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
  ) {
    return this.adminPaymentService.manualRefund(adminId, paymentId, amount, reason);
  }

  async getRefundHistory(query: {
    search?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    return this.adminPaymentService.getRefundHistory(query);
  }

  async forceCancelPayment(adminId: string, paymentId: string, reason: string) {
    return this.adminPaymentService.forceCancelPayment(adminId, paymentId, reason);
  }

  // ==================== SELLER PAYOUTS ====================
  // Taşındı: admin-payout.service.ts — imzalar aynen korunuyor (facade delege).

  async getPayoutsSummary() {
    return this.payoutService.getPayoutsSummary();
  }

  async getPayoutsTransactions(query: PayoutTransactionsQueryDto) {
    return this.payoutService.getPayoutsTransactions(query);
  }

  async getPayoutsSchedule(query: { sellerId?: string; limit?: number }) {
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

  async getTrades(query: {
    status?: TradeStatus;
    initiatorId?: string;
    receiverId?: string;
    userId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.tradeService.getTrades(query);
  }

  async findTradeShipments(query: {
    status?: ShipmentStatus;
    leg?: 'to_warehouse' | 'from_warehouse' | 'return';
    tradeNumber?: string;
    page?: number;
    limit?: number;
  }) {
    return this.tradeService.findTradeShipments(query);
  }

  async getTradeById(tradeId: string) {
    return this.tradeService.getTradeById(tradeId);
  }

  async resolveTrade(adminId: string, tradeId: string, dto: { resolution: string; note?: string }) {
    return this.tradeService.resolveTrade(adminId, tradeId, dto);
  }

  async markWarehouseReceived(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.tradeService.markWarehouseReceived(adminId, tradeId, shipmentId);
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
    return this.tradeService.forceCancelStuckWarehouseTrade(adminId, tradeId, dto);
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

  async listRefundRequests(query: {
    status?: import('@prisma/client').RefundRequestStatus[];
    userSearch?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    return this.adminRefundService.listRefundRequests(query);
  }

  async getRefundRequestDetail(refundRequestId: string) {
    return this.adminRefundService.getRefundRequestDetail(refundRequestId);
  }

  async forceFinalizeRefund(adminId: string, refundRequestId: string) {
    return this.adminRefundService.forceFinalizeRefund(adminId, refundRequestId);
  }

  async resolveTradeCompensation(adminId: string, tradeId: string, note?: string) {
    return this.adminRefundService.resolveTradeCompensation(adminId, tradeId, note);
  }

  async retryTradeRefund(adminId: string, tradeId: string) {
    return this.adminRefundService.retryTradeRefund(adminId, tradeId);
  }

  // ==================== MESSAGE MANAGEMENT ====================
  // Taşındı: admin-messaging.service.ts — imzalar aynen korunuyor (facade delege).

  async getMessages(query: {
    status?: MessageStatus;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
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

  /**
   * Get support tickets with filters for admin
   */
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
    const { status, priority, category, assigneeId, creatorId, fromDate, toDate, page = 1, limit = 20 } = query;

    // Use SupportService's getAllTickets method
    const result = await this.supportService.getAllTickets(
      page,
      limit,
      status,
      priority,
      category,
      assigneeId,
    );

    // Filter by creatorId and date range if provided
    let filteredTickets = result.tickets;

    if (creatorId) {
      filteredTickets = filteredTickets.filter((t) => t.creatorId === creatorId);
    }

    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      filteredTickets = filteredTickets.filter((t) => {
        const createdAt = new Date(t.createdAt);
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
        return true;
      });
    }

    return {
      data: filteredTickets,
      meta: {
        total: filteredTickets.length,
        page,
        limit,
        totalPages: Math.ceil(filteredTickets.length / limit),
      },
    };
  }

  /**
   * Get support ticket by ID for admin
   */
  async getSupportTicketById(ticketId: string) {
    // Use SupportService's getTicketById with admin flag
    // Pass empty string for userId since admin can view any ticket
    return this.supportService.getTicketById(ticketId, '', true);
  }

  /**
   * Update support ticket
   */
  async updateSupportTicket(adminId: string, ticketId: string, dto: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
    note?: string;
  }) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    const oldTicket = { ...ticket };

    // Update status if provided
    if (dto.status) {
      await this.supportService.updateTicketStatus(ticketId, adminId, {
        status: dto.status,
        note: dto.note,
      });
    }

    // Update priority if provided
    if (dto.priority) {
      await this.supportService.updatePriority(ticketId, dto.priority);
    }

    // Update assignee if provided
    if (dto.assigneeId !== undefined) {
      await this.supportService.assignTicket(ticketId, { assigneeId: dto.assigneeId });
    }

    const updatedTicket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'support_ticket_update', 'SupportTicket', ticketId, oldTicket, updatedTicket);

    return this.getSupportTicketById(ticketId);
  }

  /**
   * Reply to support ticket
   */
  async replyToSupportTicket(adminId: string, ticketId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    // Use SupportService's addMessage with admin flag
    await this.supportService.addMessage(ticketId, adminId, { content: message }, true);

    // Update status to in_progress if it was waiting_customer
    if (ticket.status === TicketStatus.waiting_customer) {
      await this.supportService.updateTicketStatus(ticketId, adminId, {
        status: TicketStatus.in_progress,
      });
    }

    // Create audit log
    await this.createAuditLog(adminId, 'support_ticket_reply', 'SupportTicket', ticketId, ticket, {
      ...ticket,
      message,
    });

    return this.getSupportTicketById(ticketId);
  }

  // ==================== CATEGORY MANAGEMENT ====================

  /**
   * Generate slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Get categories with tree structure
   */
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      include: {
        parent: true,
        children: { orderBy: { name: 'asc' } },
        _count: {
          select: { products: true, collections: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        parentId: c.parentId,
        parent: c.parent ? { id: c.parent.id, name: c.parent.name } : null,
        children: c.children.map((child) => ({
          id: child.id,
          name: child.name,
          slug: child.slug,
        })),
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        productCount: c._count.products,
        collectionCount: c._count.collections,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Create category
   */
  async createCategory(adminId: string, dto: {
    name: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Check if parent exists
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Üst kategori bulunamadı');
      }
    }

    // Generate slug
    let slug = this.generateSlug(dto.name);
    let slugExists = await this.prisma.category.findUnique({
      where: { slug },
    });

    // If slug exists, append number
    let counter = 1;
    while (slugExists) {
      slug = `${this.generateSlug(dto.name)}-${counter}`;
      slugExists = await this.prisma.category.findUnique({
        where: { slug },
      });
      counter++;
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description || null,
        parentId: dto.parentId || null, // Empty string becomes null (root category)
        sortOrder: dto.sortOrder || 0,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_create', 'Category', category.id, null, category);

    return category;
  }

  /**
   * Update category
   */
  async updateCategory(adminId: string, categoryId: string, dto: {
    name?: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Check circular reference if parentId is being changed
    if (dto.parentId && dto.parentId !== category.parentId) {
      // Check if new parent is a child of this category
      const isChild = category.children.some((child) => child.id === dto.parentId);
      if (isChild) {
        throw new BadRequestException('Kategori kendi alt kategorisini üst kategori olarak seçemez');
      }

      // Check if new parent exists
      const newParent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!newParent) {
        throw new NotFoundException('Üst kategori bulunamadı');
      }
    }

    // Generate new slug if name changed
    let slug = category.slug;
    if (dto.name && dto.name !== category.name) {
      slug = this.generateSlug(dto.name);
      const slugExists = await this.prisma.category.findUnique({
        where: { slug },
      });

      if (slugExists && slugExists.id !== categoryId) {
        // Slug exists for another category, append number
        let counter = 1;
        while (slugExists) {
          slug = `${this.generateSlug(dto.name)}-${counter}`;
          const check = await this.prisma.category.findUnique({
            where: { slug },
          });
          if (!check || check.id === categoryId) break;
          counter++;
        }
      }
    }

    const oldCategory = { ...category };
    const updatedCategory = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        slug,
        description: dto.description !== undefined ? (dto.description || null) : undefined,
        parentId: dto.parentId !== undefined ? (dto.parentId || null) : undefined, // Empty string becomes null
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_update', 'Category', categoryId, oldCategory, updatedCategory);

    return updatedCategory;
  }

  /**
   * Delete category
   */
  async deleteCategory(adminId: string, categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Check if category has products
    if (category._count.products > 0) {
      throw new BadRequestException('Bu kategoride ürünler bulunmaktadır. Önce ürünleri başka kategoriye taşıyın.');
    }

    // Check if category has children
    if (category.children.length > 0) {
      throw new BadRequestException('Bu kategorinin alt kategorileri bulunmaktadır. Önce alt kategorileri silin.');
    }

    await this.prisma.category.delete({
      where: { id: categoryId },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_delete', 'Category', categoryId, category, null);

    return { success: true, categoryId };
  }

  // ==================== STATIC PAGES ====================

  async getPages() {
    const pages = await this.prisma.staticPage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return {
      data: pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription ? p.metaDescription.slice(0, 100) : null,
        isPublished: p.isPublished,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  async getPageById(id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    return page;
  }

  async getPageBySlug(slug: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    return page;
  }

  async createPage(adminId: string, dto: CreateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('Bu slug zaten kullanılıyor');
    const page = await this.prisma.staticPage.create({
      data: {
        slug: dto.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        title: dto.title,
        content: dto.content,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        metaKeywords: dto.metaKeywords ?? null,
        isPublished: dto.isPublished ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.createAuditLog(adminId, 'static_page_create', 'StaticPage', page.id, null, page);
    return page;
  }

  async updatePage(adminId: string, id: string, dto: UpdateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sayfa bulunamadı');
    if (dto.slug && dto.slug !== existing.slug) {
      const duplicate = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
      if (duplicate) throw new BadRequestException('Bu slug zaten kullanılıyor');
    }
    const page = await this.prisma.staticPage.update({
      where: { id },
      data: {
        ...(dto.slug != null && { slug: dto.slug.trim().toLowerCase().replace(/\s+/g, '-') }),
        ...(dto.title != null && { title: dto.title }),
        ...(dto.content != null && { content: dto.content }),
        ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle || null }),
        ...(dto.metaDescription !== undefined && { metaDescription: dto.metaDescription || null }),
        ...(dto.metaKeywords !== undefined && { metaKeywords: dto.metaKeywords || null }),
        ...(dto.isPublished != null && { isPublished: dto.isPublished }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
    await this.createAuditLog(adminId, 'static_page_update', 'StaticPage', id, existing, page);
    return page;
  }

  async deletePage(adminId: string, id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    await this.prisma.staticPage.delete({ where: { id } });
    await this.createAuditLog(adminId, 'static_page_delete', 'StaticPage', id, page, null);
    return { success: true };
  }

  // ==================== EMAIL TEMPLATES ====================

  private readonly EMAIL_TEMPLATE_KEYS: Array<{ key: string; name: string; group: string }> = [
    // Hesap
    { key: 'welcome',                    name: 'Hoş geldin',                          group: 'Hesap' },
    { key: 'email-verification',         name: 'E-posta doğrulama',                   group: 'Hesap' },
    { key: 'password-reset',             name: 'Şifre sıfırlama',                     group: 'Hesap' },
    // Sipariş
    { key: 'order-confirmation',         name: 'Sipariş onayı (alıcı)',               group: 'Sipariş' },
    { key: 'order-created-buyer',        name: 'Sipariş oluşturuldu (alıcı)',         group: 'Sipariş' },
    { key: 'order-created-seller',       name: 'Yeni sipariş (satıcı)',               group: 'Sipariş' },
    { key: 'order-paid',                 name: 'Ödeme alındı (alıcı)',                group: 'Sipariş' },
    { key: 'order-paid-group',           name: 'Ödeme alındı - sepet (alıcı)',        group: 'Sipariş' },
    { key: 'order-paid-seller',          name: 'Ödeme alındı (satıcı)',               group: 'Sipariş' },
    { key: 'order-shipped',              name: 'Kargoya verildi',                     group: 'Sipariş' },
    { key: 'order-delivered',            name: 'Teslim edildi',                       group: 'Sipariş' },
    // Ödeme
    { key: 'payment-received',           name: 'Ödeme alındı',                        group: 'Ödeme' },
    { key: 'payment-failed',             name: 'Ödeme başarısız',                     group: 'Ödeme' },
    { key: 'payment-refunded',           name: 'İade tamamlandı (alıcı)',             group: 'Ödeme' },
    { key: 'payment-refunded-seller',    name: 'İade bildirimi (satıcı)',             group: 'Ödeme' },
    // Teklif
    { key: 'offer-received',             name: 'Yeni teklif (satıcı)',                group: 'Teklif' },
    { key: 'offer-accepted',             name: 'Teklif kabul edildi (alıcı)',         group: 'Teklif' },
    // Ürün
    { key: 'product-approved',           name: 'Ürün onaylandı',                      group: 'Ürün' },
    { key: 'wishlist-price-change',      name: 'Fiyat değişimi (istek listesi)',      group: 'Ürün' },
    // Üyelik
    { key: 'premium-offer',              name: 'Premium üyelik teklifi',              group: 'Üyelik' },
    { key: 'membership-expiring',        name: 'Üyelik bitiyor (7 gün)',              group: 'Üyelik' },
    { key: 'membership-expiring-urgent', name: 'Üyelik bitiyor (yarın)',              group: 'Üyelik' },
    // Pazarlama
    { key: 'marketing-newsletter',       name: 'Haftalık bülten',                     group: 'Pazarlama' },
    { key: 'marketing-monthly',          name: 'Aylık fırsatlar',                     group: 'Pazarlama' },
    // İş Başvurusu
    { key: 'seller-application-approved', name: 'Kurumsal başvuru onaylandı',          group: 'İş Başvurusu' },
    { key: 'seller-application-rejected', name: 'Kurumsal başvuru reddedildi',         group: 'İş Başvurusu' },
    // Sipariş / İade
    { key: 'seller-did-not-ship-refunded', name: 'Satıcı kargoya vermedi (iade)',      group: 'İade' },
    // Takas
    { key: 'trade-received',              name: 'Yeni takas teklifi (alıcı)',           group: 'Takas' },
    { key: 'trade-accepted',              name: 'Takas kabul edildi',                   group: 'Takas' },
    { key: 'trade-shipped',               name: 'Takas kargoya verildi',                group: 'Takas' },
    { key: 'trade-completed',             name: 'Takas tamamlandı',                     group: 'Takas' },
    // Misafir
    { key: 'guest-checkout-otp',          name: 'Misafir sipariş OTP kodu',             group: 'Misafir' },
    // Fatura
    { key: 'invoice-buyer',               name: 'Fatura (alıcı)',                       group: 'Fatura' },
    { key: 'invoice-seller',              name: 'Satış faturası (satıcı)',               group: 'Fatura' },
    // Sipariş iptali
    { key: 'order-cancelled-buyer',       name: 'Sipariş iptal edildi (alıcı)',         group: 'Sipariş' },
    { key: 'order-cancelled-seller',      name: 'Sipariş iptal edildi (satıcı)',        group: 'Sipariş' },
    // İade akışı
    { key: 'refund-requested-seller',     name: 'İade talebi alındı (satıcı)',          group: 'İade' },
    { key: 'refund-approved-buyer',       name: 'İade onaylandı (alıcı)',               group: 'İade' },
    { key: 'refund-rejected-buyer',       name: 'İade reddedildi (alıcı)',              group: 'İade' },
    { key: 'refund-return-label-buyer',   name: 'İade kargo bilgileri (alıcı)',         group: 'İade' },
    // Değerlendirme
    { key: 'review-received-seller',      name: 'Değerlendirme alındı (satıcı)',        group: 'Değerlendirme' },
    // İlan & Stok
    { key: 'listing-expiring',            name: 'İlan süresi doluyor',                  group: 'İlan' },
    { key: 'listing-expired',             name: 'İlan süresi doldu',                    group: 'İlan' },
    { key: 'back-in-stock',               name: 'Stoğa geri geldi',                     group: 'İlan' },
    // Sosyal
    { key: 'new-follower',                name: 'Yeni takipçi',                         group: 'Sosyal' },
    // Ödeme aktarımı
    { key: 'payout-released-seller',      name: 'Ödeme aktarıldı (satıcı)',             group: 'Ödeme' },
  ];

  substituteVariables(text: string, data: Record<string, any>): string {
    if (!text) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = data[key];
      return val != null ? String(val) : `{{${key}}}`;
    });
  }

  async getEmailTemplates() {
    const dbTemplates = await this.prisma.emailTemplate.findMany();
    const dbMap = new Map(dbTemplates.map((t) => [t.key, t]));
    const list = this.EMAIL_TEMPLATE_KEYS.map(({ key, name, group }) => {
      const db = dbMap.get(key);
      return {
        key,
        name: db?.name ?? name,
        group,
        subject: db?.subject ?? null,
        hasCustomBody: !!db?.bodyHtml,
        variablesJson: db?.variablesJson,
        updatedAt: db?.updatedAt ?? null,
      };
    });
    return { data: list };
  }

  async getEmailTemplate(key: string) {
    const db = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const meta = this.EMAIL_TEMPLATE_KEYS.find((m) => m.key === key);
    if (!meta && !db) throw new NotFoundException('Şablon bulunamadı');
    return {
      key,
      name: db?.name ?? meta?.name ?? key,
      subject: db?.subject ?? null,
      bodyHtml: db?.bodyHtml ?? null,
      variablesJson: db?.variablesJson ?? null,
      isCustom: !!db,
    };
  }

  async updateEmailTemplate(adminId: string, key: string, dto: UpdateEmailTemplateDto) {
    const meta = this.EMAIL_TEMPLATE_KEYS.find((m) => m.key === key);
    if (!meta) throw new NotFoundException('Geçersiz şablon anahtarı');
    const existing = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const data = {
      name: dto.name ?? meta.name,
      subject: dto.subject ?? existing?.subject ?? '',
      bodyHtml: dto.bodyHtml ?? existing?.bodyHtml ?? '',
      variablesJson: dto.variablesJson ?? existing?.variablesJson ?? null,
    };
    const template = await this.prisma.emailTemplate.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
    await this.createAuditLog(adminId, 'email_template_update', 'EmailTemplate', template.id, existing, template);
    return template;
  }

  async resetEmailTemplate(adminId: string, key: string) {
    const meta = this.EMAIL_TEMPLATE_KEYS.find((m) => m.key === key);
    if (!meta) throw new NotFoundException('Geçersiz şablon anahtarı');
    const existing = await this.prisma.emailTemplate.findUnique({ where: { key } });
    if (existing) {
      await this.prisma.emailTemplate.delete({ where: { key } });
      await this.createAuditLog(adminId, 'email_template_reset', 'EmailTemplate', existing.id, existing, null);
    }
    return { success: true };
  }

  async previewEmailTemplate(
    key: string,
    templateData?: Record<string, any>,
    overrideHtml?: string,
    overrideSubject?: string,
  ) {
    const sample = templateData || {
      name: 'Örnek Kullanıcı',
      buyerName: 'Alıcı',
      sellerName: 'Satıcı',
      orderNumber: 'TRD-12345',
      orderId: 'sample-order-id',
      productTitle: 'Örnek Ürün',
      totalAmount: 199.99,
      verifyUrl: 'https://tarodan.com/verify?token=sample',
      resetUrl: 'https://tarodan.com/reset?token=sample',
      trackingNumber: '1234567890',
      provider: 'Sürat Kargo',
    };

    // Draft preview — admin is editing but hasn't saved yet
    if (overrideHtml !== undefined || overrideSubject !== undefined) {
      const html = overrideHtml
        ? this.substituteVariables(overrideHtml, sample)
        : renderEmailTemplate(key, sample, 'https://tarodan.com');
      const subject = overrideSubject
        ? this.substituteVariables(overrideSubject, sample)
        : getEmailTemplateSubject(key, sample);
      return { subject, html };
    }

    const db = await this.prisma.emailTemplate.findUnique({ where: { key } });
    if (db?.bodyHtml) {
      return {
        subject: this.substituteVariables(db.subject || getEmailTemplateSubject(key, sample), sample),
        html: this.substituteVariables(db.bodyHtml, sample),
      };
    }

    // No custom template — return the actual default so admin can see what's being sent
    return {
      subject: getEmailTemplateSubject(key, sample),
      html: renderEmailTemplate(key, sample, 'https://tarodan.com'),
    };
  }

  async sendTestEmail(key: string, dto: { to: string; templateData?: Record<string, any> }) {
    await this.eventService.queueEmail({
      to: dto.to,
      template: key,
      subject: '',
      templateData: dto.templateData || {},
    });
    return { success: true, message: 'Test e-postası kuyruğa eklendi' };
  }

  // ==================== TAX SETTINGS (Regions, Rates, Rules, Reporting) ====================
  /** Prisma client with Tax models; at runtime may be missing until prisma generate is run */
  private get taxPrisma(): any {
    return this.prisma as any;
  }

  private get hasTaxModels(): boolean {
    return !!(this.taxPrisma.taxRegion && this.taxPrisma.taxRate && this.taxPrisma.taxRule);
  }

  async getTaxRegions() {
    if (!this.hasTaxModels) return { data: [] };
    const regions = await this.taxPrisma.taxRegion.findMany({
      include: {
        _count: { select: { taxRates: true, taxRules: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      data: regions.map((r: any) => ({
        id: r.id,
        name: r.name,
        countryCode: r.countryCode,
        regionCode: r.regionCode,
        isDefault: r.isDefault,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        ratesCount: r._count.taxRates,
        rulesCount: r._count.taxRules,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  async createTaxRegion(adminId: string, dto: {
    name: string;
    countryCode: string;
    regionCode?: string;
    isDefault?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    if (dto.isDefault) {
      await this.taxPrisma.taxRegion.updateMany({ data: { isDefault: false } });
    }
    const region = await this.taxPrisma.taxRegion.create({
      data: {
        name: dto.name,
        countryCode: dto.countryCode.toUpperCase(),
        regionCode: dto.regionCode ?? null,
        isDefault: dto.isDefault ?? false,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'tax_region_create', 'TaxRegion', region.id, null, region);
    return region;
  }

  async updateTaxRegion(adminId: string, id: string, dto: {
    name?: string;
    countryCode?: string;
    regionCode?: string;
    isDefault?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const existing = await this.taxPrisma.taxRegion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vergi bölgesi bulunamadı');
    if (dto.isDefault) {
      await this.taxPrisma.taxRegion.updateMany({ data: { isDefault: false } });
    }
    const region = await this.taxPrisma.taxRegion.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.countryCode != null && { countryCode: dto.countryCode.toUpperCase() }),
        ...(dto.regionCode !== undefined && { regionCode: dto.regionCode || null }),
        ...(dto.isDefault != null && { isDefault: dto.isDefault }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.createAuditLog(adminId, 'tax_region_update', 'TaxRegion', id, existing, region);
    return region;
  }

  async deleteTaxRegion(adminId: string, id: string) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const region = await this.taxPrisma.taxRegion.findUnique({
      where: { id },
      include: { _count: { select: { taxRates: true } } },
    });
    if (!region) throw new NotFoundException('Vergi bölgesi bulunamadı');
    if (region._count.taxRates > 0) {
      throw new BadRequestException('Bu bölgede vergi oranları tanımlı. Önce oranları silin.');
    }
    await this.taxPrisma.taxRule.deleteMany({ where: { taxRegionId: id } });
    await this.taxPrisma.taxRegion.delete({ where: { id } });
    await this.createAuditLog(adminId, 'tax_region_delete', 'TaxRegion', id, region, null);
    return { success: true };
  }

  async getTaxRates(regionId?: string) {
    if (!this.hasTaxModels) return { data: [] };
    const where = regionId ? { taxRegionId: regionId } : {};
    const rates = await this.taxPrisma.taxRate.findMany({
      where,
      include: {
        taxRegion: { select: { id: true, name: true, countryCode: true } },
      },
      orderBy: [{ taxRegionId: 'asc' }, { sortOrder: 'asc' }, { rate: 'asc' }],
    });
    return {
      data: rates.map((r: any) => ({
        id: r.id,
        taxRegionId: r.taxRegionId,
        taxRegionName: r.taxRegion.name,
        countryCode: r.taxRegion.countryCode,
        name: r.name,
        rate: Number(r.rate),
        isDefault: r.isDefault,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  async createTaxRate(adminId: string, dto: {
    taxRegionId: string;
    name: string;
    rate: number;
    isDefault?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const region = await this.taxPrisma.taxRegion.findUnique({ where: { id: dto.taxRegionId } });
    if (!region) throw new NotFoundException('Vergi bölgesi bulunamadı');
    if (dto.isDefault) {
      await this.taxPrisma.taxRate.updateMany({
        where: { taxRegionId: dto.taxRegionId },
        data: { isDefault: false },
      });
    }
    const rate = await this.taxPrisma.taxRate.create({
      data: {
        taxRegionId: dto.taxRegionId,
        name: dto.name,
        rate: dto.rate,
        isDefault: dto.isDefault ?? false,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'tax_rate_create', 'TaxRate', rate.id, null, rate);
    return rate;
  }

  async updateTaxRate(adminId: string, id: string, dto: {
    name?: string;
    rate?: number;
    isDefault?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const existing = await this.taxPrisma.taxRate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vergi oranı bulunamadı');
    if (dto.isDefault != null && dto.isDefault) {
      await this.taxPrisma.taxRate.updateMany({
        where: { taxRegionId: existing.taxRegionId },
        data: { isDefault: false },
      });
    }
    const rate = await this.taxPrisma.taxRate.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.rate != null && { rate: dto.rate }),
        ...(dto.isDefault != null && { isDefault: dto.isDefault }),
        ...(dto.effectiveFrom !== undefined && { effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null }),
        ...(dto.effectiveTo !== undefined && { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.createAuditLog(adminId, 'tax_rate_update', 'TaxRate', id, existing, rate);
    return rate;
  }

  async deleteTaxRate(adminId: string, id: string) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const rate = await this.taxPrisma.taxRate.findUnique({
      where: { id },
      include: { _count: { select: { taxRules: true } } },
    });
    if (!rate) throw new NotFoundException('Vergi oranı bulunamadı');
    if (rate._count.taxRules > 0) {
      throw new BadRequestException('Bu orana bağlı vergi kuralları var. Önce kuralları silin veya güncelleyin.');
    }
    await this.taxPrisma.taxRate.delete({ where: { id } });
    await this.createAuditLog(adminId, 'tax_rate_delete', 'TaxRate', id, rate, null);
    return { success: true };
  }

  async getTaxRules(regionId?: string) {
    if (!this.hasTaxModels) return { data: [] };
    const where = regionId ? { taxRegionId: regionId } : {};
    const rules = await this.taxPrisma.taxRule.findMany({
      where,
      include: {
        taxRegion: { select: { id: true, name: true, countryCode: true } },
        taxRate: { select: { id: true, name: true, rate: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ taxRegionId: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });
    return {
      data: rules.map((r: any) => ({
        id: r.id,
        taxRegionId: r.taxRegionId,
        taxRegionName: r.taxRegion.name,
        taxRateId: r.taxRateId,
        taxRateName: r.taxRate.name,
        taxRateValue: Number(r.taxRate.rate),
        scope: r.scope,
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? null,
        priority: r.priority,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  async createTaxRule(adminId: string, dto: {
    taxRegionId: string;
    taxRateId: string;
    scope: string;
    categoryId?: string;
    priority?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const region = await this.taxPrisma.taxRegion.findUnique({ where: { id: dto.taxRegionId } });
    if (!region) throw new NotFoundException('Vergi bölgesi bulunamadı');
    const rate = await this.taxPrisma.taxRate.findUnique({ where: { id: dto.taxRateId } });
    if (!rate) throw new NotFoundException('Vergi oranı bulunamadı');
    if (rate.taxRegionId !== dto.taxRegionId) {
      throw new BadRequestException('Vergi oranı bu bölgeye ait değil.');
    }
    if (dto.scope === 'category' && !dto.categoryId) {
      throw new BadRequestException('Kategori kuralı için categoryId gerekli.');
    }
    const rule = await this.taxPrisma.taxRule.create({
      data: {
        taxRegionId: dto.taxRegionId,
        taxRateId: dto.taxRateId,
        scope: dto.scope as 'default_rate' | 'category' | 'product',
        categoryId: dto.categoryId ?? null,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'tax_rule_create', 'TaxRule', rule.id, null, rule);
    return rule;
  }

  async updateTaxRule(adminId: string, id: string, dto: {
    taxRateId?: string;
    scope?: string;
    categoryId?: string;
    priority?: number;
    isActive?: boolean;
  }) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const existing = await this.taxPrisma.taxRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vergi kuralı bulunamadı');
    const rate = await this.taxPrisma.taxRule.update({
      where: { id },
      data: {
        ...(dto.taxRateId != null && { taxRateId: dto.taxRateId }),
        ...(dto.scope != null && { scope: dto.scope as 'default_rate' | 'category' | 'product' }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId || null }),
        ...(dto.priority != null && { priority: dto.priority }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
    await this.createAuditLog(adminId, 'tax_rule_update', 'TaxRule', id, existing, rate);
    return rate;
  }

  async deleteTaxRule(adminId: string, id: string) {
    if (!this.hasTaxModels) throw new BadRequestException('Tax models not available. Run: npx prisma generate (in apps/api)');
    const rule = await this.taxPrisma.taxRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Vergi kuralı bulunamadı');
    await this.taxPrisma.taxRule.delete({ where: { id } });
    await this.createAuditLog(adminId, 'tax_rule_delete', 'TaxRule', id, rule, null);
    return { success: true };
  }

  /**
   * Tax reporting: aggregate tax from invoices by period and optionally by region.
   */
  async getTaxReport(query: {
    fromDate?: string;
    toDate?: string;
    groupBy?: 'day' | 'month' | 'year' | 'region';
    regionId?: string;
  }) {
    const from = query.fromDate ? new Date(query.fromDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const to = query.toDate ? new Date(query.toDate) : new Date();
    if (from > to) throw new BadRequestException('fromDate must be before toDate');

    const invoices = await this.prisma.invoice.findMany({
      where: {
        issuedAt: { gte: from, lte: to },
        status: { not: 'cancelled' },
      },
      select: {
        id: true,
        taxAmount: true,
        total: true,
        subtotal: true,
        issuedAt: true,
        orderId: true,
      },
      orderBy: { issuedAt: 'asc' },
    });

    const totalTaxCollected = invoices.reduce((sum, inv) => sum + Number(inv.taxAmount), 0);
    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const invoiceCount = invoices.length;

    const summary = {
      fromDate: from.toISOString().slice(0, 10),
      toDate: to.toISOString().slice(0, 10),
      totalTaxCollected: Math.round(totalTaxCollected * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      invoiceCount,
    };

    let breakdown: Array<{ period: string; taxCollected: number; revenue: number; count: number }> = [];
    const groupBy = query.groupBy || 'month';

    if (groupBy === 'day') {
      const byDay = new Map<string, { tax: number; revenue: number; count: number }>();
      for (const inv of invoices) {
        const key = inv.issuedAt.toISOString().slice(0, 10);
        const cur = byDay.get(key) || { tax: 0, revenue: 0, count: 0 };
        cur.tax += Number(inv.taxAmount);
        cur.revenue += Number(inv.total);
        cur.count += 1;
        byDay.set(key, cur);
      }
      breakdown = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({
          period,
          taxCollected: Math.round(v.tax * 100) / 100,
          revenue: Math.round(v.revenue * 100) / 100,
          count: v.count,
        }));
    } else if (groupBy === 'month') {
      const byMonth = new Map<string, { tax: number; revenue: number; count: number }>();
      for (const inv of invoices) {
        const key = inv.issuedAt.toISOString().slice(0, 7);
        const cur = byMonth.get(key) || { tax: 0, revenue: 0, count: 0 };
        cur.tax += Number(inv.taxAmount);
        cur.revenue += Number(inv.total);
        cur.count += 1;
        byMonth.set(key, cur);
      }
      breakdown = Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({
          period,
          taxCollected: Math.round(v.tax * 100) / 100,
          revenue: Math.round(v.revenue * 100) / 100,
          count: v.count,
        }));
    } else if (groupBy === 'year') {
      const byYear = new Map<string, { tax: number; revenue: number; count: number }>();
      for (const inv of invoices) {
        const key = inv.issuedAt.getFullYear().toString();
        const cur = byYear.get(key) || { tax: 0, revenue: 0, count: 0 };
        cur.tax += Number(inv.taxAmount);
        cur.revenue += Number(inv.total);
        cur.count += 1;
        byYear.set(key, cur);
      }
      breakdown = Array.from(byYear.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({
          period,
          taxCollected: Math.round(v.tax * 100) / 100,
          revenue: Math.round(v.revenue * 100) / 100,
          count: v.count,
        }));
    }

    return {
      summary,
      breakdown,
      data: invoices.map((inv) => ({
        id: inv.id,
        orderId: inv.orderId,
        taxAmount: Number(inv.taxAmount),
        total: Number(inv.total),
        issuedAt: inv.issuedAt,
      })),
    };
  }

  // ==================== MEMBERSHIP TIER MANAGEMENT ====================

  /**
   * Get membership tiers
   */
  async getMembershipTiers() {
    const tiers = await this.prisma.membershipTier.findMany({
      include: {
        _count: {
          select: { userMemberships: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      data: tiers.map((t) => ({
        id: t.id,
        type: t.type,
        name: t.name,
        description: t.description,
        monthlyPrice: Number(t.monthlyPrice),
        yearlyPrice: Number(t.yearlyPrice),
        maxFreeListings: t.maxFreeListings,
        maxTotalListings: t.maxTotalListings,
        maxImagesPerListing: t.maxImagesPerListing,
        canCreateCollections: t.canCreateCollections,
        canTrade: t.canTrade,
        isAdFree: t.isAdFree,
        featuredListingSlots: t.featuredListingSlots,
        commissionDiscount: Number(t.commissionDiscount),
        isActive: t.isActive,
        sortOrder: t.sortOrder,
        userCount: t._count.userMemberships,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * Update membership tier
   */
  async updateMembershipTier(adminId: string, tierId: string, dto: {
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
    featuredListingSlots?: number;
    commissionDiscount?: number;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) {
      throw new NotFoundException('Üyelik seviyesi bulunamadı');
    }

    const oldTier = { ...tier };

    const updatedTier = await this.prisma.membershipTier.update({
      where: { id: tierId },
      data: {
        name: dto.name,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice !== undefined ? dto.monthlyPrice : undefined,
        yearlyPrice: dto.yearlyPrice !== undefined ? dto.yearlyPrice : undefined,
        maxFreeListings: dto.maxFreeListings,
        maxTotalListings: dto.maxTotalListings,
        maxImagesPerListing: dto.maxImagesPerListing,
        canCreateCollections: dto.canCreateCollections,
        canTrade: dto.canTrade,
        isAdFree: dto.isAdFree,
        featuredListingSlots: dto.featuredListingSlots,
        commissionDiscount: dto.commissionDiscount !== undefined ? dto.commissionDiscount : undefined,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'membership_tier_update', 'MembershipTier', tierId, oldTier, updatedTier);

    return updatedTier;
  }

  // ==================== PRODUCT DELETION (ADMIN) ====================
  // Taşındı: admin-product.service.ts — imzalar aynen korunuyor (facade delege).

  async deleteProduct(adminId: string, productId: string, hardDelete: boolean = false) {
    return this.productService.deleteProduct(adminId, productId, hardDelete);
  }

  async restoreProduct(adminId: string, productId: string) {
    return this.productService.restoreProduct(adminId, productId);
  }

  // ==================== BRAND MANAGEMENT ====================

  /**
   * Get all brands
   */
  async getBrands() {
    const brands = await this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      data: brands.map((b: Brand) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logo: b.logo,
        description: b.description,
        website: b.website,
        country: b.country,
        foundedYear: b.foundedYear,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
    };
  }

  /**
   * Create a new brand
   */
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
    // Generate slug from name
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Check if brand with same name or slug exists
    const existing = await this.prisma.brand.findFirst({
      where: {
        OR: [
          { name: { equals: dto.name, mode: 'insensitive' } },
          { slug },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('Bu isimde bir marka zaten mevcut');
    }

    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name,
        slug,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        foundedYear: dto.foundedYear,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'brand_create', 'Brand', brand.id, null, brand);

    this.logger.log(`Brand created: ${brand.name} (${brand.id}) by admin ${adminId}`);

    return brand;
  }

  /**
   * Update brand
   */
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
    const existing = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!existing) {
      throw new NotFoundException('Marka bulunamadı');
    }

    // If name is being changed, check for duplicates and update slug
    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = dto.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      const duplicate = await this.prisma.brand.findFirst({
        where: {
          OR: [
            { name: { equals: dto.name, mode: 'insensitive' } },
            { slug },
          ],
          NOT: { id: brandId },
        },
      });

      if (duplicate) {
        throw new BadRequestException('Bu isimde bir marka zaten mevcut');
      }
    }

    const updated = await this.prisma.brand.update({
      where: { id: brandId },
      data: {
        name: dto.name,
        slug: dto.name ? slug : undefined,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        foundedYear: dto.foundedYear,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'brand_update', 'Brand', brandId, existing, updated);

    this.logger.log(`Brand updated: ${updated.name} (${updated.id}) by admin ${adminId}`);

    return updated;
  }

  /**
   * Delete brand
   */
  async deleteBrand(adminId: string, brandId: string) {
    const existing = await this.prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        _count: { select: { products: true, carModels: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Marka bulunamadı');
    }

    const { products: productCount, carModels: carModelCount } = (existing as any)._count;
    if (productCount > 0 || carModelCount > 0) {
      throw new ConflictException(
        `Bu marka silinemez: ${productCount} ürün ve ${carModelCount} araç modeli ile ilişkili.`,
      );
    }

    await this.prisma.brand.delete({
      where: { id: brandId },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'brand_delete', 'Brand', brandId, existing, null);

    this.logger.log(`Brand deleted: ${existing.name} (${existing.id}) by admin ${adminId}`);

    return { success: true };
  }

  // ==================== MANUFACTURER MANAGEMENT ====================

  async getManufacturers() {
    const manufacturers = await this.prisma.manufacturer.findMany({
      orderBy: { name: 'asc' },
    });
    return {
      data: manufacturers.map(m => ({
        ...m,
        logo: this.resolveProductImageUrl(m.logo),
      })),
    };
  }

  async createManufacturer(
    adminId: string,
    dto: { name: string; logo?: string; description?: string; website?: string; country?: string; foundedYear?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const existing = await this.prisma.manufacturer.findFirst({
      where: { OR: [{ name: { equals: dto.name, mode: 'insensitive' } }, { slug }] },
    });
    if (existing) throw new BadRequestException('Bu isimde bir üretici zaten mevcut');

    const manufacturer = await this.prisma.manufacturer.create({
      data: {
        name: dto.name,
        slug,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        foundedYear: dto.foundedYear,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'manufacturer_create', 'Manufacturer', manufacturer.id, null, manufacturer);
    return manufacturer;
  }

  async updateManufacturer(
    adminId: string,
    id: string,
    dto: { name?: string; logo?: string; description?: string; website?: string; country?: string; foundedYear?: number | null; sortOrder?: number; isActive?: boolean },
  ) {
    const existing = await this.prisma.manufacturer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Üretici bulunamadı');

    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = dto.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
      const duplicate = await this.prisma.manufacturer.findFirst({
        where: { OR: [{ name: { equals: dto.name, mode: 'insensitive' } }, { slug }], NOT: { id } },
      });
      if (duplicate) throw new BadRequestException('Bu isimde bir üretici zaten mevcut');
    }

    const updated = await this.prisma.manufacturer.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slug : undefined,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        foundedYear: dto.foundedYear,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.createAuditLog(adminId, 'manufacturer_update', 'Manufacturer', id, existing, updated);
    return updated;
  }

  async deleteManufacturer(adminId: string, id: string) {
    const existing = await this.prisma.manufacturer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Üretici bulunamadı');
    await this.prisma.manufacturer.delete({ where: { id } });
    await this.createAuditLog(adminId, 'manufacturer_delete', 'Manufacturer', id, existing, null);
    return { success: true };
  }

  // ==================== CAR MODEL MANAGEMENT ====================

  async getCarModels(brandId?: string) {
    const where = brandId ? { brandId } : {};
    const models = await this.prisma.carModel.findMany({
      where,
      orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
      include: { brand: { select: { id: true, name: true, slug: true } } },
    });
    return { data: models };
  }

  async createCarModel(
    adminId: string,
    dto: { brandId: string; name: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadı');

    const slug =
      dto.slug ||
      `${brand.slug}-${dto.name}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

    const existing = await this.prisma.carModel.findFirst({
      where: { OR: [{ slug }, { brandId: dto.brandId, name: { equals: dto.name, mode: 'insensitive' } }] },
    });
    if (existing) throw new BadRequestException('Bu isimde veya slug ile bir model zaten mevcut');

    const model = await this.prisma.carModel.create({
      data: {
        brandId: dto.brandId,
        name: dto.name,
        slug,
        yearStart: dto.yearStart,
        yearEnd: dto.yearEnd,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.createAuditLog(adminId, 'car_model_create', 'CarModel', model.id, null, model);
    await this.cache.delPattern('car-models:*');
    return model;
  }

  async updateCarModel(
    adminId: string,
    id: string,
    dto: { name?: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const existing = await this.prisma.carModel.findUnique({ where: { id }, include: { brand: true } });
    if (!existing) throw new NotFoundException('Model bulunamadı');

    let slug = existing.slug;
    if (dto.slug) slug = dto.slug;
    else if (dto.name && dto.name !== existing.name) {
      slug = `${existing.brand.slug}-${dto.name}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }

    if (slug !== existing.slug) {
      const duplicate = await this.prisma.carModel.findFirst({ where: { slug, NOT: { id } } });
      if (duplicate) throw new BadRequestException('Bu slug ile bir model zaten mevcut');
    }

    const updated = await this.prisma.carModel.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug || (dto.name ? slug : undefined),
        yearStart: dto.yearStart,
        yearEnd: dto.yearEnd,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.createAuditLog(adminId, 'car_model_update', 'CarModel', id, existing, updated);
    await this.cache.delPattern('car-models:*');
    return updated;
  }

  async deleteCarModel(adminId: string, id: string) {
    const existing = await this.prisma.carModel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Model bulunamadı');
    await this.prisma.carModel.delete({ where: { id } });
    await this.createAuditLog(adminId, 'car_model_delete', 'CarModel', id, existing, null);
    await this.cache.delPattern('car-models:*');
    return { success: true };
  }

  // ==================== SHIPPING (view-only) ====================

  /**
   * Get list of shipments
   */
  async getShipments(query: {
    page?: number;
    limit?: number;
    status?: string;
    carrierId?: string;
  }) {
    const { page = 1, limit = 10, status, carrierId } = query;
    const where: Prisma.ShipmentWhereInput = {};

    if (status) where.status = status as any;
    if (carrierId) where.provider = carrierId;

    const [total, shipments] = await Promise.all([
      this.prisma.shipment.count({ where }),
      this.prisma.shipment.findMany({
        where,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: shipments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==================== NOTIFICATION MANAGEMENT ====================

  /**
   * Get notification history
   */
  async getNotificationHistory(query: {
    page?: number;
    limit?: number;
    channel?: string;
    status?: string;
    userId?: string;
    type?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, limit = 20 } = query;
    const where: Prisma.NotificationLogWhereInput = {};

    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;
    if (query.type) where.type = query.type;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    // Başlık/içerik veya alıcı kullanıcı ad/e-posta araması (case-insensitive).
    // userId NotificationLog'da düz alan (ilişki yok) → eşleşen kullanıcıları
    // ayrı sorgulayıp id'lerini OR'a ekliyoruz.
    const trimmedSearch = query.search?.trim();
    if (trimmedSearch) {
      const matchingUsers = await this.prisma.user.findMany({
        where: {
          OR: [
            { displayName: { contains: trimmedSearch, mode: 'insensitive' } },
            { email: { contains: trimmedSearch, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      const matchingUserIds = matchingUsers.map((u) => u.id);
      where.OR = [
        { title: { contains: trimmedSearch, mode: 'insensitive' } },
        { body: { contains: trimmedSearch, mode: 'insensitive' } },
        ...(matchingUserIds.length > 0 ? [{ userId: { in: matchingUserIds } }] : []),
      ];
    }

    const [total, logs] = await Promise.all([
      this.prisma.notificationLog.count({ where }),
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get user info for logs
    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return {
      data: logs.map(l => ({
        ...l,
        user: userMap.get(l.userId) || null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Send notification to users
   */
  async sendNotification(adminId: string, dto: {
    title: string;
    body: string;
    channels: string[];
    targetType: 'all' | 'segment' | 'user_ids';
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    data?: Record<string, any>;
  }) {
    let targetUserIds: string[] = [];

    try {
      if (dto.targetType === 'user_ids') {
        targetUserIds = dto.userIds || [];
      } else if (dto.targetType === 'all') {
        const users = await this.prisma.user.findMany({
          where: { isBanned: false },
          select: { id: true },
        });
        targetUserIds = users.map(u => u.id);
      } else if (dto.targetType === 'segment' && dto.segmentCriteria) {
        const where: Prisma.UserWhereInput = { isBanned: false };
        if (dto.segmentCriteria.isSeller !== undefined) {
          where.isSeller = dto.segmentCriteria.isSeller;
        }
        if (dto.segmentCriteria.membershipTier) {
          where.membership = { tier: { type: dto.segmentCriteria.membershipTier as any } };
        }
        const users = await this.prisma.user.findMany({
          where,
          select: { id: true },
        });
        targetUserIds = users.map(u => u.id);
      }

      if (targetUserIds.length === 0) {
        throw new BadRequestException('Hedef kullanıcı bulunamadı');
      }

      // Create notification logs - always include in_app for user visibility
      const notificationLogs: Array<{
        userId: string;
        channel: string;
        type: string;
        title: string;
        body: string;
        data: any;
        status: string;
        sentAt?: Date;
      }> = [];

      for (const userId of targetUserIds) {
        // Always create an in_app entry so users see it in their notification center
        notificationLogs.push({
          userId,
          channel: 'in_app',
          type: 'admin_broadcast',
          title: dto.title,
          body: dto.body,
          data: dto.data || ({} as any),
          status: 'sent',
          sentAt: new Date(),
        });

        // Create entries for other selected channels (for tracking/audit)
        for (const channel of dto.channels) {
          if (channel !== 'in_app') {
            notificationLogs.push({
              userId,
              channel,
              type: 'admin_broadcast',
              title: dto.title,
              body: dto.body,
              data: dto.data || ({} as any),
              status: 'pending',
            });
          }
        }
      }

      // Chunk the createMany operation to avoid parameter limit issues in PostgreSQL
      const chunkSize = 5000;
      for (let i = 0; i < notificationLogs.length; i += chunkSize) {
        const chunk = notificationLogs.slice(i, i + chunkSize);
        await this.prisma.notificationLog.createMany({
          data: chunk,
        });
      }

      // Trigger broadcast events (handles queues for Email/Push and creates In-App logs)
      // Note: emitAdminBroadcast handles its own In-App log creation to ensure consistency, 
      // but we created logs above for consistency with the audit log and historical tracking.
      await this.eventService.emitAdminBroadcast({
        userIds: targetUserIds,
        title: dto.title,
        body: dto.body,
        channels: dto.channels,
        data: dto.data
      });

      // Update the logs we created to 'sent' status since we just emitted them
      await this.prisma.notificationLog.updateMany({
        where: {
          userId: { in: targetUserIds },
          channel: { in: dto.channels },
          title: dto.title,
          body: dto.body,
          status: 'pending'
        },
        data: {
          status: 'sent',
          sentAt: new Date()
        }
      });

      // Log the action
      await this.createAuditLog(
        adminId,
        'notification_send',
        'NotificationLog',
        'bulk',
        null,
        {
          targetCount: targetUserIds.length,
          channels: dto.channels,
          title: dto.title,
          targetType: dto.targetType
        }
      );

      this.logger.log(`Admin ${adminId} sent notification to ${targetUserIds.length} users via ${dto.channels.join(', ')}`);

      return {
        success: true,
        targetCount: targetUserIds.length,
        channels: dto.channels,
        message: `Bildirim ${targetUserIds.length} kullanıcıya gönderildi`,
      };
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Bildirim gönderilemedi: ${error.message}`);
    }
  }

  /**
   * Schedule a notification
   */
  async scheduleNotification(adminId: string, dto: {
    title: string;
    body: string;
    channels: string[];
    targetType: 'all' | 'segment' | 'user_ids';
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    scheduledFor: string;
  }) {
    const scheduledDate = new Date(dto.scheduledFor);
    if (scheduledDate <= new Date()) {
      throw new BadRequestException('Zamanlama tarihi gelecekte olmalıdır');
    }

    const scheduled = await this.prisma.scheduledNotification.create({
      data: {
        title: dto.title,
        body: dto.body,
        channels: dto.channels,
        targetType: dto.targetType,
        targetData: dto.targetType === 'user_ids'
          ? (dto.userIds as any)
          : (dto.segmentCriteria as any) || Prisma.JsonNull,
        scheduledFor: scheduledDate,
        createdBy: adminId,
        status: 'pending',
      },
    });

    await this.createAuditLog(adminId, 'notification_schedule', 'ScheduledNotification', scheduled.id, null, scheduled);

    this.logger.log(`Notification scheduled for ${dto.scheduledFor} by admin ${adminId}`);

    return scheduled;
  }

  /**
   * Get scheduled notifications
   */
  async getScheduledNotifications(query?: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 20 } = query || {};
    const where: Prisma.ScheduledNotificationWhereInput = {};

    if (query?.status) {
      where.status = query.status;
    }

    const [total, notifications] = await Promise.all([
      this.prisma.scheduledNotification.count({ where }),
      this.prisma.scheduledNotification.findMany({
        where,
        orderBy: { scheduledFor: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: notifications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Cancel scheduled notification
   */
  async cancelScheduledNotification(adminId: string, notificationId: string) {
    const existing = await this.prisma.scheduledNotification.findUnique({
      where: { id: notificationId },
    });

    if (!existing) {
      throw new NotFoundException('Zamanlanmış bildirim bulunamadı');
    }

    if (existing.status !== 'pending') {
      throw new BadRequestException('Sadece bekleyen bildirimler iptal edilebilir');
    }

    const updated = await this.prisma.scheduledNotification.update({
      where: { id: notificationId },
      data: { status: 'cancelled' },
    });

    await this.createAuditLog(adminId, 'notification_cancel', 'ScheduledNotification', notificationId, existing, updated);

    return { success: true };
  }

  // ==================== ERROR LOGS ====================

  /**
   * Get error logs with filtering and pagination
   */
  async getErrorLogs(query: {
    page?: number;
    limit?: number;
    severity?: string;
    source?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, severity, source, userId, startDate, endDate, search } = query;
    const where: Prisma.ErrorLogWhereInput = {};

    if (severity) where.severity = severity;
    if (source) where.source = source;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      const ids = await fulltextErrorLogSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0, stats: [] };
      }
      where.id = { in: ids };
    }

    const [total, logs] = await Promise.all([
      this.prisma.errorLog.count({ where }),
      this.prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get severity stats
    const stats = await this.prisma.errorLog.groupBy({
      by: ['severity'],
      _count: { id: true },
      where: startDate || endDate ? {
        createdAt: where.createdAt,
      } : undefined,
    });

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        critical: stats.find(s => s.severity === 'critical')?._count?.id || 0,
        error: stats.find(s => s.severity === 'error')?._count?.id || 0,
        warning: stats.find(s => s.severity === 'warning')?._count?.id || 0,
      },
    };
  }

  // ==================== SECURITY LOGS ====================

  /**
   * Get security logs with filtering and pagination
   */
  async getSecurityLogs(query: {
    page?: number;
    limit?: number;
    eventType?: string;
    severity?: string;
    ipAddress?: string;
    userId?: string;
    resolved?: boolean;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, eventType, severity, ipAddress, userId, resolved, startDate, endDate, search } = query;
    const where: Prisma.SecurityLogWhereInput = {};

    if (eventType) where.eventType = eventType;
    if (severity) where.severity = severity;
    if (ipAddress) where.ipAddress = ipAddress;
    if (userId) where.userId = userId;
    if (resolved !== undefined) where.resolved = resolved;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      const ids = await fulltextSecurityLogSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }

    const [total, logs] = await Promise.all([
      this.prisma.securityLog.count({ where }),
      this.prisma.securityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get event type stats
    const stats = await this.prisma.securityLog.groupBy({
      by: ['eventType'],
      _count: { id: true },
      where: { resolved: false },
    });

    // Count unresolved high severity
    const unresolvedHighSeverity = await this.prisma.securityLog.count({
      where: { resolved: false, severity: { in: ['high', 'critical'] } },
    });

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        byEventType: stats.reduce((acc, s) => {
          acc[s.eventType] = s._count.id;
          return acc;
        }, {} as Record<string, number>),
        unresolvedHighSeverity,
      },
    };
  }

  /**
   * Resolve a security issue
   */
  async resolveSecurityIssue(adminId: string, logId: string, notes?: string) {
    const existing = await this.prisma.securityLog.findUnique({
      where: { id: logId },
    });

    if (!existing) {
      throw new NotFoundException('Güvenlik kaydı bulunamadı');
    }

    if (existing.resolved) {
      throw new BadRequestException('Bu sorun zaten çözümlendi');
    }

    const updated = await this.prisma.securityLog.update({
      where: { id: logId },
      data: {
        resolved: true,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        details: {
          ...(existing.details as Record<string, any> || {}),
          resolutionNotes: notes,
        },
      },
    });

    await this.createAuditLog(adminId, 'security_issue_resolve', 'SecurityLog', logId, existing, updated);

    this.logger.log(`Security issue ${logId} resolved by admin ${adminId}`);

    return updated;
  }

  /**
   * Block an IP address
   */
  async blockIP(adminId: string, ipAddress: string, reason?: string) {
    // Log the block action
    const blockLog = await this.prisma.securityLog.create({
      data: {
        eventType: 'ip_block',
        severity: 'high',
        ipAddress,
        details: { reason, blockedBy: adminId },
      },
    });

    await this.createAuditLog(adminId, 'ip_block', 'SecurityLog', blockLog.id, null, blockLog);

    this.logger.log(`IP ${ipAddress} blocked by admin ${adminId}. Reason: ${reason}`);

    return { success: true, ipAddress, blockedAt: blockLog.createdAt };
  }

  // ==================== EMAIL LOGS ====================

  /**
   * Get email logs with filtering and pagination
   */
  async getEmailLogs(query: {
    page?: number;
    limit?: number;
    status?: string;
    template?: string;
    to?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, status, template, to, userId, startDate, endDate, search } = query;
    const where: Prisma.EmailLogWhereInput = {};

    if (status) where.status = status;
    if (template) where.template = template;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const searchTerm = search || to;
    if (searchTerm) {
      const ids = await fulltextEmailLogSearch(this.prisma, searchTerm);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }

    const [total, logs] = await Promise.all([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Get status stats
    const stats = await this.prisma.emailLog.groupBy({
      by: ['status'],
      _count: { id: true },
      where: startDate || endDate ? {
        createdAt: where.createdAt,
      } : undefined,
    });

    // Get template stats
    const templateStats = await this.prisma.emailLog.groupBy({
      by: ['template'],
      _count: { id: true },
      where: {
        template: { not: null },
        createdAt: startDate || endDate ? where.createdAt : undefined,
      },
      take: 10,
      orderBy: { _count: { id: 'desc' } },
    });

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        byStatus: stats.reduce((acc, s) => {
          acc[s.status] = s._count.id;
          return acc;
        }, {} as Record<string, number>),
        byTemplate: templateStats.reduce((acc, s) => {
          if (s.template) acc[s.template] = s._count.id;
          return acc;
        }, {} as Record<string, number>),
        deliveryRate: (() => {
          const sent = stats.find(s => s.status === 'sent')?._count?.id || 0;
          const delivered = stats.find(s => s.status === 'delivered')?._count?.id || 0;
          const total = sent + delivered;
          return total > 0 ? Math.round((delivered / total) * 100) : 0;
        })(),
        bounceRate: (() => {
          const total = stats.reduce((sum, s) => sum + s._count.id, 0);
          const bounced = stats.find(s => s.status === 'bounced')?._count?.id || 0;
          return total > 0 ? Math.round((bounced / total) * 100) : 0;
        })(),
      },
    };
  }

  // ==================== COLLECTION MANAGEMENT ====================

  /**
   * Get collections with filtering and pagination (admin view)
   */
  async getCollections(query: {
    search?: string;
    userId?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'name' | 'likeCount' | 'viewCount';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page = 1, limit = 20, search, userId, isPublic, isFeatured, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const esSortMap: Record<string, 'popular' | 'recent' | 'name'> = {
      createdAt: 'recent', viewCount: 'popular', likeCount: 'popular', name: 'name',
    };

    if (search && this.searchService.isAvailable()) {
      const esResult = await this.searchService.searchCollections({
        query: search,
        isPublic,
        isFeatured,
        userId,
        sortBy: esSortMap[sortBy] ?? 'recent',
        page,
        pageSize: limit,
      });

      if (esResult && esResult.ids.length > 0) {
        const collections = await this.prisma.collection.findMany({
          where: { id: { in: esResult.ids } },
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true, membership: { select: { tier: { select: { type: true } } } } } },
            _count: { select: { items: true } },
          },
        });
        const orderMap = new Map(esResult.ids.map((id, i) => [id, i]));
        collections.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        return {
          data: collections.map(c => ({
            id: c.id, name: c.name, slug: c.slug, description: c.description,
            coverImageUrl: c.coverImageKey ? this.storageService.getPublicAssetUrl(c.coverImageKey) : undefined, isPublic: c.isPublic, isFeatured: c.isFeatured,
            viewCount: c.viewCount, likeCount: c.likeCount, itemCount: c._count.items,
            owner: { ...c.user, membershipTier: c.user.membership?.tier?.type ?? null }, createdAt: c.createdAt, updatedAt: c.updatedAt,
          })),
          total: esResult.total, page, limit, totalPages: Math.ceil(esResult.total / limit),
        };
      }
      if (esResult && esResult.total === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    const where: Prisma.CollectionWhereInput = {};
    if (search) {
      const ids = await fulltextCollectionSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (userId) where.userId = userId;
    if (isPublic !== undefined) where.isPublic = isPublic;
    if (isFeatured !== undefined) where.isFeatured = isFeatured;

    const [total, collections] = await Promise.all([
      this.prisma.collection.count({ where }),
      this.prisma.collection.findMany({
        where,
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true, membership: { select: { tier: { select: { type: true } } } } } },
          _count: { select: { items: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: collections.map(c => ({
        id: c.id, name: c.name, slug: c.slug, description: c.description,
        coverImageUrl: c.coverImageKey ? this.storageService.getPublicAssetUrl(c.coverImageKey) : undefined, isPublic: c.isPublic, isFeatured: c.isFeatured,
        viewCount: c.viewCount, likeCount: c.likeCount, itemCount: c._count.items,
        owner: { ...c.user, membershipTier: c.user.membership?.tier?.type ?? null }, createdAt: c.createdAt, updatedAt: c.updatedAt,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get collection by ID with items (admin view)
   */
  async getCollectionById(collectionId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                price: true,
                images: { take: 1, select: { cardKey: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    return {
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description,
      coverImageUrl: collection.coverImageKey ? this.storageService.getPublicAssetUrl(collection.coverImageKey) : undefined,
      isPublic: collection.isPublic,
      isFeatured: collection.isFeatured,
      viewCount: collection.viewCount,
      likeCount: collection.likeCount,
      itemCount: collection.items.length,
      owner: collection.user,
      items: await Promise.all(collection.items.map(async item => ({
        id: item.id,
        productId: item.productId,
        sortOrder: item.sortOrder,
        product: item.product ? {
          id: item.product.id,
          title: item.product.title,
          price: Number(item.product.price),
          images: await Promise.all((item.product.images || []).map(async (img: any) => ({
            ...img,
            url: this.resolveProductImageUrl(img.cardKey),
          }))),
        } : null,
        customTitle: item.customTitle,
        customImageUrl: item.customImageUrl,
      }))),
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  /**
   * Create collection (admin)
   */
  async createAdminCollection(adminId: string, dto: {
    name: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageKey?: string;
    userId?: string;
  }) {
    const slug = this.generateSlug(dto.name);
    const userId = dto.userId || adminId;

    // Check for unique slug within user's collections
    const existingSlug = await this.prisma.collection.findFirst({
      where: { userId, slug },
    });

    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    const collection = await this.prisma.collection.create({
      data: {
        userId,
        name: dto.name,
        slug: finalSlug,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
        isFeatured: dto.isFeatured ?? false,
        coverImageKey: dto.coverImageKey,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    await this.createAuditLog(adminId, 'collection_create', 'Collection', collection.id, null, collection);

    return {
      ...collection,
      itemCount: 0,
      owner: collection.user,
    };
  }

  /**
   * Update collection (admin)
   */
  async updateAdminCollection(adminId: string, collectionId: string, dto: {
    name?: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageKey?: string;
  }) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    const updateData: Prisma.CollectionUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
      updateData.slug = this.generateSlug(dto.name);
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;
    if (dto.isFeatured !== undefined) updateData.isFeatured = dto.isFeatured;
    if (dto.coverImageKey !== undefined) updateData.coverImageKey = dto.coverImageKey;

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: updateData,
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        _count: { select: { items: true } },
      },
    });

    await this.createAuditLog(adminId, 'collection_update', 'Collection', collectionId, existing, updated);

    return {
      ...updated,
      itemCount: updated._count.items,
      owner: updated.user,
    };
  }

  /**
   * Delete collection (admin)
   */
  async deleteAdminCollection(adminId: string, collectionId: string) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    await this.prisma.collection.delete({
      where: { id: collectionId },
    });

    await this.createAuditLog(adminId, 'collection_delete', 'Collection', collectionId, existing, null);

    return { success: true };
  }

  /**
   * Add products to collection
   */
  async addItemsToCollection(adminId: string, collectionId: string, productIds: string[]) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: { _count: { select: { items: true } } },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    // Get max sort order
    const maxSortOrder = collection._count.items;

    // Create items
    const createdItems = await Promise.all(
      productIds.map((productId, index) =>
        this.prisma.collectionItem.create({
          data: {
            collectionId,
            productId,
            sortOrder: maxSortOrder + index,
          },
          include: {
            product: {
              select: {
                id: true,
                title: true,
                price: true,
                images: { take: 1, select: { cardKey: true } },
              },
            },
          },
        }).catch(() => null) // Ignore duplicates
      )
    );

    const successfulItems = createdItems.filter(item => item !== null);

    await this.createAuditLog(adminId, 'collection_items_add', 'Collection', collectionId, null, { addedProductIds: productIds });

    return {
      success: true,
      addedCount: successfulItems.length,
      items: successfulItems,
    };
  }

  /**
   * Remove item from collection
   */
  async removeItemFromAdminCollection(adminId: string, collectionId: string, itemId: string) {
    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, collectionId },
    });

    if (!item) {
      throw new NotFoundException('Koleksiyon öğesi bulunamadı');
    }

    await this.prisma.collectionItem.delete({
      where: { id: itemId },
    });

    await this.createAuditLog(adminId, 'collection_item_remove', 'CollectionItem', itemId, item, null);

    return { success: true };
  }

  /**
   * Set collection visibility
   */
  async setCollectionVisibility(adminId: string, collectionId: string, isPublic: boolean) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: { isPublic },
    });

    await this.createAuditLog(adminId, 'collection_visibility_change', 'Collection', collectionId, { isPublic: existing.isPublic }, { isPublic });

    return { success: true, isPublic: updated.isPublic };
  }

  /**
   * Set collection featured status
   */
  async setCollectionFeatured(adminId: string, collectionId: string, isFeatured: boolean) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: { isFeatured },
    });

    await this.createAuditLog(adminId, 'collection_featured_change', 'Collection', collectionId, { isFeatured: existing.isFeatured }, { isFeatured });

    // Anasayfa "haftanın koleksiyoneri" snapshot'ını ve cache'ini düşür; sonraki
    // okuma yeni isFeatured durumuna göre kazananı yeniden hesaplayıp saklar.
    await this.prisma.featuredSnapshot
      .deleteMany({ where: { type: 'collector' } })
      .catch(() => {});
    if (this.cache) {
      await this.cache.del('featured:collector').catch(() => {});
      await this.cache.delPattern('featured:top-collections:*').catch(() => {});
    }

    return { success: true, isFeatured: updated.isFeatured };
  }

  // ==================== ATTRIBUTE GROUP MANAGEMENT ====================

  /**
   * Get attribute groups with their attributes
   */
  async getAttributeGroups(query: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, search, isActive } = query;
    const where: Prisma.AttributeGroupWhereInput = {};

    if (search) {
      const ids = await fulltextAttributeGroupSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const [total, groups] = await Promise.all([
      this.prisma.attributeGroup.count({ where }),
      this.prisma.attributeGroup.findMany({
        where,
        include: {
          attributes: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { attributes: true } },
        },
        orderBy: { sortOrder: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: groups.map(g => ({
        ...g,
        attributeCount: g._count.attributes,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get attribute group by ID
   */
  async getAttributeGroupById(groupId: string) {
    const group = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
      include: {
        attributes: {
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { productAttributes: true } },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    return {
      ...group,
      attributeCount: group.attributes.length,
      attributes: group.attributes.map(a => ({
        ...a,
        usageCount: a._count.productAttributes,
      })),
    };
  }

  /**
   * Create attribute group
   */
  async createAttributeGroup(adminId: string, dto: {
    name: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const slug = this.generateSlug(dto.name);

    const existing = await this.prisma.attributeGroup.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });

    if (existing) {
      throw new BadRequestException('Bu isimde bir özellik grubu zaten mevcut');
    }

    const group = await this.prisma.attributeGroup.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        isRequired: dto.isRequired ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.createAuditLog(adminId, 'attribute_group_create', 'AttributeGroup', group.id, null, group);

    return { ...group, attributeCount: 0 };
  }

  /**
   * Update attribute group
   */
  async updateAttributeGroup(adminId: string, groupId: string, dto: {
    name?: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const existing = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
    });

    if (!existing) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    const updateData: Prisma.AttributeGroupUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
      updateData.slug = this.generateSlug(dto.name);
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isRequired !== undefined) updateData.isRequired = dto.isRequired;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const updated = await this.prisma.attributeGroup.update({
      where: { id: groupId },
      data: updateData,
      include: { _count: { select: { attributes: true } } },
    });

    await this.createAuditLog(adminId, 'attribute_group_update', 'AttributeGroup', groupId, existing, updated);

    return { ...updated, attributeCount: updated._count.attributes };
  }

  /**
   * Delete attribute group
   */
  async deleteAttributeGroup(adminId: string, groupId: string) {
    const existing = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
      include: { _count: { select: { attributes: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    if (existing._count.attributes > 0) {
      throw new BadRequestException(`Bu grupta ${existing._count.attributes} özellik değeri var. Önce değerleri silin.`);
    }

    await this.prisma.attributeGroup.delete({
      where: { id: groupId },
    });

    await this.createAuditLog(adminId, 'attribute_group_delete', 'AttributeGroup', groupId, existing, null);

    return { success: true };
  }

  // ==================== ATTRIBUTE VALUE MANAGEMENT ====================

  /**
   * Get attributes with filtering
   */
  async getAttributes(query: {
    groupId?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, groupId, search, isActive } = query;
    const where: Prisma.AttributeWhereInput = {};

    if (groupId) where.groupId = groupId;
    if (search) {
      const ids = await fulltextAttributeSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const [total, attributes] = await Promise.all([
      this.prisma.attribute.count({ where }),
      this.prisma.attribute.findMany({
        where,
        include: {
          group: { select: { id: true, name: true } },
          _count: { select: { productAttributes: true } },
        },
        orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: attributes.map(a => ({
        ...a,
        usageCount: a._count.productAttributes,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create attribute value
   */
  async createAttribute(adminId: string, dto: {
    groupId: string;
    value: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Verify group exists
    const group = await this.prisma.attributeGroup.findUnique({
      where: { id: dto.groupId },
    });

    if (!group) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    // Scale group: use same slug normalization as product.service linkProductAttributes
    const slug =
      group.slug === 'scale'
        ? dto.value.replace(/\s/g, '').replace(/[:\/]/g, '').toLowerCase() || this.generateSlug(dto.value)
        : this.generateSlug(dto.value);

    // Check for duplicate
    const existing = await this.prisma.attribute.findFirst({
      where: { groupId: dto.groupId, slug },
    });

    if (existing) {
      throw new BadRequestException('Bu değer bu grupta zaten mevcut');
    }

    const attribute = await this.prisma.attribute.create({
      data: {
        groupId: dto.groupId,
        value: dto.value,
        slug,
        displayValue: dto.displayValue?.trim() || null,
        color: dto.color,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: {
        group: { select: { id: true, name: true } },
      },
    });

    await this.createAuditLog(adminId, 'attribute_create', 'Attribute', attribute.id, null, attribute);

    return { ...attribute, usageCount: 0 };
  }

  /**
   * Update attribute value
   */
  async updateAttribute(adminId: string, attributeId: string, dto: {
    value?: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
    });

    if (!existing) {
      throw new NotFoundException('Özellik değeri bulunamadı');
    }

    const updateData: Prisma.AttributeUpdateInput = {};
    if (dto.value !== undefined) {
      updateData.value = dto.value;
      const group = await this.prisma.attributeGroup.findUnique({ where: { id: existing.groupId } });
      updateData.slug =
        group?.slug === 'scale'
          ? dto.value.replace(/\s/g, '').replace(/[:\/]/g, '').toLowerCase() || this.generateSlug(dto.value)
          : this.generateSlug(dto.value);
    }
    if (dto.displayValue !== undefined) updateData.displayValue = dto.displayValue?.trim() || null;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.prisma.attribute.update({
      where: { id: attributeId },
      data: updateData,
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { productAttributes: true } },
      },
    });

    await this.createAuditLog(adminId, 'attribute_update', 'Attribute', attributeId, existing, updated);

    return { ...updated, usageCount: updated._count.productAttributes };
  }

  /**
   * Delete attribute value
   */
  async deleteAttribute(adminId: string, attributeId: string) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
      include: { _count: { select: { productAttributes: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Özellik değeri bulunamadı');
    }

    if (existing._count.productAttributes > 0) {
      throw new BadRequestException(`Bu özellik ${existing._count.productAttributes} üründe kullanılıyor. Önce ürünlerden kaldırın.`);
    }

    await this.prisma.attribute.delete({
      where: { id: attributeId },
    });

    await this.createAuditLog(adminId, 'attribute_delete', 'Attribute', attributeId, existing, null);

    return { success: true };
  }

  // ==================== REVIEWS & RATINGS ====================

  /**
   * Get product reviews
   */
  async getReviews(query: RatingQueryDto) {
    const { page = 1, limit = 20, status, productId, search, sortBy } = query;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (productId) {
      where.productId = productId;
    }

    if (search) {
      const [ratingIds, userIds, productIds] = await Promise.all([
        fulltextProductRatingSearch(this.prisma, search),
        fulltextUserDisplayNameSearch(this.prisma, search),
        fulltextProductSearch(this.prisma, search),
      ]);
      const conditions: any[] = [];
      if (ratingIds.length > 0) conditions.push({ id: { in: ratingIds } });
      if (userIds.length > 0) conditions.push({ userId: { in: userIds } });
      if (productIds.length > 0) conditions.push({ productId: { in: productIds } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
    }

    const orderBy: any = {};
    if (sortBy === 'newest') orderBy.createdAt = 'desc';
    else if (sortBy === 'oldest') orderBy.createdAt = 'asc';
    else if (sortBy === 'highest_score') orderBy.score = 'desc';
    else if (sortBy === 'lowest_score') orderBy.score = 'asc';
    else orderBy.createdAt = 'desc';

    const [total, reviews] = await Promise.all([
      this.prisma.productRating.count({ where }),
      this.prisma.productRating.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
          product: { select: { id: true, title: true, images: { take: 1 } } },
        },
      }),
    ]);

    const resolvedReviews = reviews.map((review: any) => ({
      ...review,
      product: review.product ? {
        ...review.product,
        images: (review.product.images || []).map((img: any) => ({
          ...img,
          url: this.resolveProductImageUrl(img.cardKey) || this.resolveProductImageUrl(img.url) || img.url,
        })),
      } : review.product,
    }));

    return {
      data: resolvedReviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update review status
   */
  async updateReviewStatus(adminId: string, reviewId: string, status: RatingStatus) {
    const review = await this.prisma.productRating.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Yorum bulunamadı');
    }

    // Cast to any to avoid TS error if prisma client is not generated
    const updated = await this.prisma.productRating.update({
      where: { id: reviewId },
      data: { status } as any,
    });

    await this.createAuditLog(adminId, 'review_status_update', 'Rating', reviewId, review, updated);

    await this.ratingService.updateProductRatingStats(review.productId);

    return updated;
  }

  /**
   * Get seller (user) ratings for admin panel
   */
  async getUserRatings(query: { page?: number; limit?: number; search?: string; status?: string }) {
    const p = Number(query.page) || 1;
    const lim = Number(query.limit) || 20;
    const search = query.search;
    const status = query.status;
    const where: any = {};

    if (search) {
      where.OR = [
        { giver: { displayName: { contains: search, mode: 'insensitive' } } },
        { receiver: { displayName: { contains: search, mode: 'insensitive' } } },
        { comment: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      where.status = status;
    }

    const [total, ratings] = await Promise.all([
      this.prisma.rating.count({ where }),
      this.prisma.rating.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * lim,
        take: lim,
        include: {
          giver: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
        },
      }),
    ]);

    return {
      data: ratings,
      meta: { total, page: p, limit: lim, totalPages: Math.ceil(total / lim) },
    };
  }

  // ==================== SELLER APPLICATIONS ====================

  async getSellerApplications(query: { page?: number; limit?: number; search?: string; status?: string }) {
    const p = Number(query.page) || 1;
    const lim = Number(query.limit) || 20;
    const search = query.search?.trim();
    const status = query.status as BusinessStatus | undefined;

    const where: Prisma.UserWhereInput = {
      companyName: { not: null },
      businessStatus: status ?? undefined,
    };

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { taxId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, applications] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * lim,
        take: lim,
        select: {
          id: true,
          displayName: true,
          email: true,
          phone: true,
          companyName: true,
          taxId: true,
          businessStatus: true,
          isSeller: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: applications,
      meta: { total, page: p, limit: lim, totalPages: Math.ceil(total / lim) },
    };
  }

  async approveSellerApplication(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
    if (!user.companyName) throw new BadRequestException('Bu kullanıcı kurumsal hesap değil');
    if (user.businessStatus === BusinessStatus.approved) throw new BadRequestException('Bu başvuru zaten onaylanmış');

    const previous = { businessStatus: user.businessStatus, isSeller: user.isSeller };
    await this.prisma.user.update({
      where: { id: userId },
      data: { businessStatus: BusinessStatus.approved, isSeller: true, sellerType: 'individual' },
    });
    await this.createAuditLog(adminId, 'seller_application_approve', 'User', userId, previous, { businessStatus: 'approved', isSeller: true });

    // In-app + push bildirimi
    await this.notificationService.send({
      userId,
      type: NotificationType.SELLER_APPLICATION_APPROVED,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data: {},
    });
    // E-posta template sistemi üzerinden (admin panelinden özelleştirilebilir)
    await this.eventService.queueEmail({
      to: user.email,
      subject: '',
      template: 'seller-application-approved',
      templateData: {
        name: user.displayName || user.email,
        companyName: user.companyName || '',
      },
    });
    return { success: true };
  }

  async rejectSellerApplication(adminId: string, userId: string, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
    if (!user.companyName) throw new BadRequestException('Bu kullanıcı kurumsal hesap değil');
    if (user.businessStatus === BusinessStatus.rejected) throw new BadRequestException('Bu başvuru zaten reddedilmiş');

    const previous = { businessStatus: user.businessStatus };
    await this.prisma.user.update({
      where: { id: userId },
      data: { businessStatus: BusinessStatus.rejected, isSeller: false },
    });
    await this.createAuditLog(adminId, 'seller_application_reject', 'User', userId, previous, { businessStatus: 'rejected', reason });

    // In-app + push bildirimi
    await this.notificationService.send({
      userId,
      type: NotificationType.SELLER_APPLICATION_REJECTED,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data: { reason: reason ? ` Neden: ${reason}` : '' },
    });
    // E-posta template sistemi üzerinden (admin panelinden özelleştirilebilir)
    await this.eventService.queueEmail({
      to: user.email,
      subject: '',
      template: 'seller-application-rejected',
      templateData: {
        name: user.displayName || user.email,
        companyName: user.companyName || '',
        reason: reason || '',
      },
    });
    return { success: true };
  }

  /**
   * Update seller (user) rating status (approve/reject)
   */
  async updateUserRatingStatus(adminId: string, ratingId: string, status: RatingStatus) {
    const rating = await this.prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw new NotFoundException('Kullanıcı yorumu bulunamadı');
    const previous = { ...rating };
    await this.prisma.rating.update({
      where: { id: ratingId },
      data: { status },
    });
    await this.createAuditLog(adminId, 'user_rating_status_update', 'Rating', ratingId, previous, { status });
    return { success: true };
  }

  async applyOrderCoupon(orderId: string, adminId: string, code: string | null) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true },
    });

    if (!order) throw new NotFoundException('Sipariş bulunamadı');

    // Kuponu kaldırma
    if (!code) {
      const previous = { discountCode: order.discountCode, discountAmount: order.discountAmount };
      const baseTotal = Number(order.totalAmount) + Number(order.discountAmount ?? 0);
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          discountCode: null,
          discountAmount: new Prisma.Decimal(0),
          discountBreakdown: Prisma.JsonNull,
          ...(order.status === OrderStatus.pending_payment ? { totalAmount: new Prisma.Decimal(baseTotal) } : {}),
        },
      });
      await this.createAuditLog(adminId, 'order_coupon_removed', 'Order', orderId, previous, { discountCode: null });
      return { success: true, discountCode: null, discountAmount: 0 };
    }

    const discount = await this.prisma.discount.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!discount) throw new BadRequestException('Kupon kodu bulunamadı');
    if (!discount.isActive) throw new BadRequestException('Bu kupon aktif değil');
    const now = new Date();
    if (now < discount.startDate) throw new BadRequestException('Bu kupon henüz başlamadı');
    if (now > discount.endDate) throw new BadRequestException('Bu kuponun süresi doldu');
    if (discount.usageLimitTotal && discount.usedCount >= discount.usageLimitTotal) {
      throw new BadRequestException('Bu kupon kullanım limitine ulaştı');
    }

    const productPrice = Number(order.product.price);
    const baseTotal = Number(order.totalAmount) + Number(order.discountAmount ?? 0);
    const subtotal = productPrice;

    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = subtotal * (Number(discount.value) / 100);
    } else if (discount.type === 'fixed_amount') {
      discountAmount = Math.min(Number(discount.value), subtotal);
    }

    if (discount.maxDiscountAmount) {
      discountAmount = Math.min(discountAmount, Number(discount.maxDiscountAmount));
    }

    const newTotal = Math.max(0, baseTotal - discountAmount);

    const previous = { discountCode: order.discountCode, discountAmount: order.discountAmount, totalAmount: order.totalAmount };
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        discountCode: discount.code,
        discountAmount: new Prisma.Decimal(discountAmount),
        discountBreakdown: { couponDiscount: discountAmount, appliedDiscountId: discount.id } as any,
        ...(order.status === OrderStatus.pending_payment ? { totalAmount: new Prisma.Decimal(newTotal) } : {}),
      },
    });

    await this.createAuditLog(adminId, 'order_coupon_applied', 'Order', orderId, previous, { discountCode: discount.code, discountAmount });
    return { success: true, discountCode: discount.code, discountAmount, discountName: discount.name };
  }

}

