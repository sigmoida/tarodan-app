import {
  Controller,
  Get,
  Query,
  Res,
  Header,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService, ReportFilter } from './reports.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRoute } from '../auth/decorators/admin-route.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminRole } from '@prisma/client';

@Controller('reports')
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@RequirePermission('analytics')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private parseFilter(query: any): ReportFilter {
    return {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      status: query.status,
    };
  }

  // ==========================================================================
  // SALES REPORTS
  // ==========================================================================

  /**
   * Get sales report
   * GET /reports/sales
   */
  @Get('sales')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async getSalesReport(@Query() query: any) {
    const filter = this.parseFilter(query);
    return this.reportsService.generateSalesReport(filter);
  }

  /**
   * Export sales report as CSV
   * GET /reports/sales/export/csv
   */
  @Get('sales/export/csv')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename=sales-report.csv')
  async exportSalesCSV(@Query() query: any, @Res() res: Response) {
    const filter = this.parseFilter(query);
    const csv = await this.reportsService.exportSalesReportCSV(filter);
    res.send(csv);
  }

  /**
   * Export sales report as JSON (for PDF)
   * GET /reports/sales/export/json
   */
  @Get('sales/export/json')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async exportSalesJSON(@Query() query: any) {
    const filter = this.parseFilter(query);
    return this.reportsService.exportSalesReportJSON(filter);
  }

  // ==========================================================================
  // TRADE REPORTS
  // ==========================================================================

  /**
   * Get trade report
   * GET /reports/trades
   */
  @Get('trades')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async getTradeReport(@Query() query: any) {
    const filter = this.parseFilter(query);
    return this.reportsService.generateTradeReport(filter);
  }

  /**
   * Export trade report as CSV
   * GET /reports/trades/export/csv
   */
  @Get('trades/export/csv')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename=trade-report.csv')
  async exportTradeCSV(@Query() query: any, @Res() res: Response) {
    const filter = this.parseFilter(query);
    const csv = await this.reportsService.exportTradeReportCSV(filter);
    res.send(csv);
  }

  // ==========================================================================
  // USER REPORTS
  // ==========================================================================

  /**
   * Get user report
   * GET /reports/users
   */
  @Get('users')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async getUserReport(@Query() query: any) {
    const filter = this.parseFilter(query);
    return this.reportsService.generateUserReport(filter);
  }

  /**
   * Export user report as CSV
   * GET /reports/users/export/csv
   */
  @Get('users/export/csv')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename=user-report.csv')
  async exportUserCSV(@Query() query: any, @Res() res: Response) {
    const filter = this.parseFilter(query);
    const csv = await this.reportsService.exportUserReportCSV(filter);
    res.send(csv);
  }

  // ==========================================================================
  // PRODUCT REPORTS
  // ==========================================================================

  /**
   * Get product report
   * GET /reports/products
   */
  @Get('products')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async getProductReport(@Query() query: any) {
    const filter = this.parseFilter(query);
    return this.reportsService.generateProductReport(filter);
  }

  // ==========================================================================
  // SITE ACCESS REPORTS
  // ==========================================================================

  /**
   * Get site access report
   * GET /reports/access
   * Requirement: Site access reports (requirements.txt)
   */
  @Get('access')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async getSiteAccessReport(@Query() query: any) {
    const filter = this.parseFilter(query);
    return this.reportsService.generateAccessReport(filter);
  }

  /**
   * Get real-time visitor stats
   * GET /reports/access/realtime
   */
  @Get('access/realtime')
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  async getRealtimeStats() {
    return this.reportsService.getRealtimeVisitorStats();
  }

  /**
   * Export access report as CSV
   * GET /reports/access/export/csv
   */
  @Get('access/export/csv')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename=access-report.csv')
  async exportAccessCSV(@Query() query: any, @Res() res: Response) {
    const filter = this.parseFilter(query);
    const csv = await this.reportsService.exportAccessReportCSV(filter);
    res.send(csv);
  }

  // ==========================================================================
  // DASHBOARD SUMMARY
  // ==========================================================================

  /**
   * Get dashboard summary
   * GET /reports/dashboard
   */
  @Get('dashboard')
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  async getDashboardSummary() {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const filter: ReportFilter = {
      startDate: thirtyDaysAgo,
      endDate: now,
    };

    const [sales, trades, users, products] = await Promise.all([
      this.reportsService.generateSalesReport(filter),
      this.reportsService.generateTradeReport(filter),
      this.reportsService.generateUserReport(filter),
      this.reportsService.generateProductReport(filter),
    ]);

    return {
      period: {
        start: filter.startDate,
        end: filter.endDate,
      },
      sales: {
        totalOrders: sales.totalOrders,
        totalRevenue: sales.totalRevenue,
        totalCommission: sales.totalCommission,
      },
      trades: {
        totalTrades: trades.totalTrades,
        completedTrades: trades.completedTrades,
        averageValue: trades.averageTradeValue,
      },
      users: {
        totalUsers: users.totalUsers,
        newUsers: users.newUsers,
        activeUsers: users.activeUsers,
      },
      products: {
        totalProducts: products.totalProducts,
        activeProducts: products.activeProducts,
        averagePrice: products.averagePrice,
      },
    };
  }
}
