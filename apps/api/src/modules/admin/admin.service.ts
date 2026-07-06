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
import { AdminSupportService } from './admin-support.service';
import { AdminContentService } from './admin-content.service';
import { AdminTaxService } from './admin-tax.service';
import { AdminMembershipService } from './admin-membership.service';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminCollectionService } from './admin-collection.service';
import { AdminNotificationService } from './admin-notification.service';
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
    private readonly adminSupportService: AdminSupportService,
    private readonly contentService: AdminContentService,
    private readonly taxService: AdminTaxService,
    private readonly membershipService: AdminMembershipService,
    private readonly catalogService: AdminCatalogService,
    private readonly collectionService: AdminCollectionService,
    private readonly adminNotificationService: AdminNotificationService,
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

  async updateSupportTicket(adminId: string, ticketId: string, dto: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
    note?: string;
  }) {
    return this.adminSupportService.updateSupportTicket(adminId, ticketId, dto);
  }

  async replyToSupportTicket(adminId: string, ticketId: string, message: string) {
    return this.adminSupportService.replyToSupportTicket(adminId, ticketId, message);
  }

  // ==================== CATEGORY MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getCategories() {
    return this.catalogService.getCategories();
  }

  async createCategory(adminId: string, dto: {
    name: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.catalogService.createCategory(adminId, dto);
  }

  async updateCategory(adminId: string, categoryId: string, dto: {
    name?: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
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

  async updateEmailTemplate(adminId: string, key: string, dto: UpdateEmailTemplateDto) {
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
    return this.contentService.previewEmailTemplate(key, templateData, overrideHtml, overrideSubject);
  }

  async sendTestEmail(key: string, dto: { to: string; templateData?: Record<string, any> }) {
    return this.contentService.sendTestEmail(key, dto);
  }

  // ==================== TAX SETTINGS (Regions, Rates, Rules, Reporting) ====================
  // Taşındı: admin-tax.service.ts — imzalar aynen korunuyor (facade delege).

  async getTaxRegions() {
    return this.taxService.getTaxRegions();
  }

  async createTaxRegion(adminId: string, dto: {
    name: string;
    countryCode: string;
    regionCode?: string;
    isDefault?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.taxService.createTaxRegion(adminId, dto);
  }

  async updateTaxRegion(adminId: string, id: string, dto: {
    name?: string;
    countryCode?: string;
    regionCode?: string;
    isDefault?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.taxService.updateTaxRegion(adminId, id, dto);
  }

  async deleteTaxRegion(adminId: string, id: string) {
    return this.taxService.deleteTaxRegion(adminId, id);
  }

  async getTaxRates(regionId?: string) {
    return this.taxService.getTaxRates(regionId);
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
    return this.taxService.createTaxRate(adminId, dto);
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
    return this.taxService.updateTaxRate(adminId, id, dto);
  }

  async deleteTaxRate(adminId: string, id: string) {
    return this.taxService.deleteTaxRate(adminId, id);
  }

  async getTaxRules(regionId?: string) {
    return this.taxService.getTaxRules(regionId);
  }

  async createTaxRule(adminId: string, dto: {
    taxRegionId: string;
    taxRateId: string;
    scope: string;
    categoryId?: string;
    priority?: number;
    isActive?: boolean;
  }) {
    return this.taxService.createTaxRule(adminId, dto);
  }

  async updateTaxRule(adminId: string, id: string, dto: {
    taxRateId?: string;
    scope?: string;
    categoryId?: string;
    priority?: number;
    isActive?: boolean;
  }) {
    return this.taxService.updateTaxRule(adminId, id, dto);
  }

  async deleteTaxRule(adminId: string, id: string) {
    return this.taxService.deleteTaxRule(adminId, id);
  }

  async getTaxReport(query: {
    fromDate?: string;
    toDate?: string;
    groupBy?: 'day' | 'month' | 'year' | 'region';
    regionId?: string;
  }) {
    return this.taxService.getTaxReport(query);
  }

  // ==================== MEMBERSHIP TIER MANAGEMENT ====================
  // Taşındı: admin-membership.service.ts — imzalar aynen korunuyor (facade delege).

  async getMembershipTiers() {
    return this.membershipService.getMembershipTiers();
  }

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
    return this.membershipService.updateMembershipTier(adminId, tierId, dto);
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
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getBrands() {
    return this.catalogService.getBrands();
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

  async getManufacturers() {
    return this.catalogService.getManufacturers();
  }

  async createManufacturer(
    adminId: string,
    dto: { name: string; logo?: string; description?: string; website?: string; country?: string; foundedYear?: number; sortOrder?: number; isActive?: boolean },
  ) {
    return this.catalogService.createManufacturer(adminId, dto);
  }

  async updateManufacturer(
    adminId: string,
    id: string,
    dto: { name?: string; logo?: string; description?: string; website?: string; country?: string; foundedYear?: number | null; sortOrder?: number; isActive?: boolean },
  ) {
    return this.catalogService.updateManufacturer(adminId, id, dto);
  }

  async deleteManufacturer(adminId: string, id: string) {
    return this.catalogService.deleteManufacturer(adminId, id);
  }

  // ==================== CAR MODEL MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getCarModels(brandId?: string) {
    return this.catalogService.getCarModels(brandId);
  }

  async createCarModel(
    adminId: string,
    dto: { brandId: string; name: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    return this.catalogService.createCarModel(adminId, dto);
  }

  async updateCarModel(
    adminId: string,
    id: string,
    dto: { name?: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    return this.catalogService.updateCarModel(adminId, id, dto);
  }

  async deleteCarModel(adminId: string, id: string) {
    return this.catalogService.deleteCarModel(adminId, id);
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
  // Taşındı: admin-notification.service.ts — imzalar aynen korunuyor (facade delege).

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
    return this.adminNotificationService.getNotificationHistory(query);
  }

  async sendNotification(adminId: string, dto: {
    title: string;
    body: string;
    channels: string[];
    targetType: 'all' | 'segment' | 'user_ids';
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    data?: Record<string, any>;
  }) {
    return this.adminNotificationService.sendNotification(adminId, dto);
  }

  async scheduleNotification(adminId: string, dto: {
    title: string;
    body: string;
    channels: string[];
    targetType: 'all' | 'segment' | 'user_ids';
    userIds?: string[];
    segmentCriteria?: Record<string, any>;
    scheduledFor: string;
  }) {
    return this.adminNotificationService.scheduleNotification(adminId, dto);
  }

  async getScheduledNotifications(query?: { page?: number; limit?: number; status?: string }) {
    return this.adminNotificationService.getScheduledNotifications(query);
  }

  async cancelScheduledNotification(adminId: string, notificationId: string) {
    return this.adminNotificationService.cancelScheduledNotification(adminId, notificationId);
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
  // Taşındı: admin-collection.service.ts — imzalar aynen korunuyor (facade delege).

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
    return this.collectionService.getCollections(query);
  }

  async getCollectionById(collectionId: string) {
    return this.collectionService.getCollectionById(collectionId);
  }

  async createAdminCollection(adminId: string, dto: {
    name: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageKey?: string;
    userId?: string;
  }) {
    return this.collectionService.createAdminCollection(adminId, dto);
  }

  async updateAdminCollection(adminId: string, collectionId: string, dto: {
    name?: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageKey?: string;
  }) {
    return this.collectionService.updateAdminCollection(adminId, collectionId, dto);
  }

  async deleteAdminCollection(adminId: string, collectionId: string) {
    return this.collectionService.deleteAdminCollection(adminId, collectionId);
  }

  async addItemsToCollection(adminId: string, collectionId: string, productIds: string[]) {
    return this.collectionService.addItemsToCollection(adminId, collectionId, productIds);
  }

  async removeItemFromAdminCollection(adminId: string, collectionId: string, itemId: string) {
    return this.collectionService.removeItemFromAdminCollection(adminId, collectionId, itemId);
  }

  async setCollectionVisibility(adminId: string, collectionId: string, isPublic: boolean) {
    return this.collectionService.setCollectionVisibility(adminId, collectionId, isPublic);
  }

  async setCollectionFeatured(adminId: string, collectionId: string, isFeatured: boolean) {
    return this.collectionService.setCollectionFeatured(adminId, collectionId, isFeatured);
  }

  // ==================== ATTRIBUTE GROUP MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getAttributeGroups(query: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    return this.catalogService.getAttributeGroups(query);
  }

  async getAttributeGroupById(groupId: string) {
    return this.catalogService.getAttributeGroupById(groupId);
  }

  async createAttributeGroup(adminId: string, dto: {
    name: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    return this.catalogService.createAttributeGroup(adminId, dto);
  }

  async updateAttributeGroup(adminId: string, groupId: string, dto: {
    name?: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    return this.catalogService.updateAttributeGroup(adminId, groupId, dto);
  }

  async deleteAttributeGroup(adminId: string, groupId: string) {
    return this.catalogService.deleteAttributeGroup(adminId, groupId);
  }

  // ==================== ATTRIBUTE VALUE MANAGEMENT ====================
  // Taşındı: admin-catalog.service.ts — imzalar aynen korunuyor (facade delege).

  async getAttributes(query: {
    groupId?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    return this.catalogService.getAttributes(query);
  }

  async createAttribute(adminId: string, dto: {
    groupId: string;
    value: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.catalogService.createAttribute(adminId, dto);
  }

  async updateAttribute(adminId: string, attributeId: string, dto: {
    value?: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.catalogService.updateAttribute(adminId, attributeId, dto);
  }

  async deleteAttribute(adminId: string, attributeId: string) {
    return this.catalogService.deleteAttribute(adminId, attributeId);
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

