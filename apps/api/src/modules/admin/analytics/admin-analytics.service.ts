import { Injectable } from "@nestjs/common";
import type { DashboardPeriodQuery } from "@tarodan/types";
import {
  AddOrderTrackingDto,
  AnalyticsQueryDto,
  UpdateOrderStatusDto,
} from "../dto";
import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";
import { AdminAnalyticsOrderService } from "./admin-analytics-order.service";

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
  ) {}

  // ==================== ANALYTICS & REPORTS ====================

  async getDashboardStats(query?: DashboardPeriodQuery) {
    return this.dashboard.getDashboardStats(query);
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
}
