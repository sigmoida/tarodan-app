import { Injectable } from "@nestjs/common";
import {
  AddOrderTrackingDto,
  AnalyticsQueryDto,
  UpdateOrderStatusDto,
  ReportQueryDto,
} from "../dto";
import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";
import { AdminAnalyticsOrderService } from "./admin-analytics-order.service";
import { AdminAnalyticsReportService } from "./admin-analytics-report.service";

/**
 * Analitik & raporlar (+ banner aralığındaki sipariş detay/işlem yardımcıları
 * ve unbanUser) — ince alt-facade. Her public imza aynen korunur (AdminService
 * buraya delege eder) ve odaklı alt servislere delege eder: dashboard/analitik
 * -> dashboard; admin sipariş işlemleri -> order; rapor üreticileri -> report.
 * Paylaşılan leaf yardımcılar (resolveProductImageUrl, getDateKey) AdminAnalyticsCommonService'te.
 * DI grafı asiklik: facade -> {dashboard, order, report}; dashboard/order -> common (leaf);
 * forwardRef yok.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly dashboard: AdminAnalyticsDashboardService,
    private readonly order: AdminAnalyticsOrderService,
    private readonly report: AdminAnalyticsReportService,
  ) {}

  // ==================== ANALYTICS & REPORTS ====================

  async getDashboardStats() {
    return this.dashboard.getDashboardStats();
  }

  async saveAnalyticsSnapshot() {
    return this.dashboard.saveAnalyticsSnapshot();
  }

  async getSalesAnalytics(query: AnalyticsQueryDto) {
    return this.dashboard.getSalesAnalytics(query);
  }

  async getRevenueAnalytics(query: AnalyticsQueryDto) {
    return this.dashboard.getRevenueAnalytics(query);
  }

  async getUserAnalytics(query: AnalyticsQueryDto) {
    return this.dashboard.getUserAnalytics(query);
  }

  async getRecentOrders(limit: number = 10) {
    return this.dashboard.getRecentOrders(limit);
  }

  async getTopProducts(limit: number = 10) {
    return this.dashboard.getTopProducts(limit);
  }

  async getTopSellers(limit: number = 10) {
    return this.dashboard.getTopSellers(limit);
  }

  async getPendingActions() {
    return this.dashboard.getPendingActions();
  }

  async getCommissionRevenue(query: AnalyticsQueryDto) {
    return this.dashboard.getCommissionRevenue(query);
  }

  async getOrderById(orderId: string) {
    return this.order.getOrderById(orderId);
  }

  async getOrderGroupFile(orderId: string) {
    return this.order.getOrderGroupFile(orderId);
  }

  async updateOrderStatus(
    adminId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    return this.order.updateOrderStatus(adminId, orderId, dto);
  }

  async addOrderTracking(
    adminId: string,
    orderId: string,
    dto: AddOrderTrackingDto,
  ) {
    return this.order.addOrderTracking(adminId, orderId, dto);
  }

  async generateOrderInvoice(orderId: string) {
    return this.order.generateOrderInvoice(orderId);
  }

  async unbanUser(adminId: string, userId: string) {
    return this.order.unbanUser(adminId, userId);
  }

  async generateSalesReport(query: ReportQueryDto) {
    return this.report.generateSalesReport(query);
  }

  async generateUsersReport(query: ReportQueryDto) {
    return this.report.generateUsersReport(query);
  }

  async generateProductsReport(query: ReportQueryDto) {
    return this.report.generateProductsReport(query);
  }

  async generateTradesReport(query: ReportQueryDto) {
    return this.report.generateTradesReport(query);
  }

  async getCommissionReport(query: ReportQueryDto) {
    return this.report.getCommissionReport(query);
  }

  async generateCustomReport(query: ReportQueryDto) {
    return this.report.generateCustomReport(query);
  }
}
