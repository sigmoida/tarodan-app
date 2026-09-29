import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from "@nestjs/common";

import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { AdminService } from "../admin.service";
import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";
import { AdminDashboardStockService } from "./dashboard/admin-dashboard-stock.service";
import { AdminDashboardWorklistService } from "./dashboard/admin-dashboard-worklist.service";
import { AdvertisementService } from "../../advertisement/advertisement.service";
import { MediaService } from "../../media/media.service";
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
  ReorderAdsDto,
} from "../../advertisement/dto";
import { DiscountService } from "../../discount/discount.service";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
} from "../../discount/dto";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { BypassPermissionMatrix } from "../../auth/decorators/bypass-permission-matrix.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { AdminRole } from "@prisma/client";
import {
  CreateCommissionRuleDto,
  UpdateCommissionRuleDto,
  CommissionRuleResponseDto,
  UpdatePlatformSettingDto,
  PlatformSettingResponseDto,
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
  AnalyticsQueryDto,
  DashboardStatsQueryDto,
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
  PayoutTransactionsQueryDto,
  PayoutExportQueryDto,
  CreateTaxRegionDto,
  UpdateTaxRegionDto,
  CreateTaxRateDto,
  UpdateTaxRateDto,
  CreateTaxRuleDto,
  UpdateTaxRuleDto,
  TaxReportQueryDto,
  CreateStaticPageDto,
  UpdateStaticPageDto,
  UpdateEmailTemplateDto,
  UpdateProductDto,
  SendTestEmailDto,
  RatingQueryDto,
  UpdateRatingStatusDto,
  ApproveWarehouseTradeDto,
  RejectWarehouseTradeDto,
  MarkShipmentDto,
  MarkReturnLostDto,
  ForceCancelStuckDto,
  TradeShipmentQueryDto,
  RefundRequestQueryDto,
  AdminChangeMembershipDto,
} from "../dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminAnalyticsController {
  constructor(
    private readonly adminService: AdminService,
    // Yeni dashboard bölgeleri facade'e eklenmez: AdminService zaten çözülmeye
    // çalışılan tanrı-facade'dir (apps/api/CLAUDE.md §1/§15).
    private readonly worklistService: AdminDashboardWorklistService,
    private readonly stockService: AdminDashboardStockService,
    private readonly dashboardStatsService: AdminAnalyticsDashboardService,
  ) {}

  // ==================== ANALYTICS & REPORTS ====================

  @Get("dashboard")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Dashboard statistics for a period (daily | monthly | custom range), each metric also carrying its all-time figure",
  })
  @ApiResponse({ status: 400, description: "Invalid custom range" })
  async getDashboardStats(@Query() query: DashboardStatsQueryDto) {
    return this.adminService.getDashboardStats(query);
  }

  @Get("dashboard/recent-orders")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get recent orders for dashboard" })
  async getRecentOrders(@Query("limit") limit?: string) {
    return this.adminService.getRecentOrders(limit ? parseInt(limit, 10) : 10);
  }

  @Get("dashboard/top-products")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get top-N most-viewed products for dashboard" })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Max number of products to return (default 10)",
  })
  async getTopProducts(@Query("limit") limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 10;
    const safeLimit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 10;
    return this.adminService.getTopProducts(safeLimit);
  }

  @Get("dashboard/top-sellers")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Get top-N most-viewed sellers by tracked storefront views",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Max number of sellers to return (default 10)",
  })
  async getTopSellers(@Query("limit") limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 10;
    const safeLimit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 10;
    return this.adminService.getTopSellers(safeLimit);
  }

  /**
   * Zone A + Zone B — bekleyen iş kuyrukları ve uyarılar. Dönem filtresinden
   * BAĞIMSIZ: geçen aydan beri bekleyen iş bugünün işidir.
   *
   * Eski `dashboard/pending-actions` ucunun yerini alır. O uç iade talebini
   * `Order.status = refund_requested` ile sayıyordu — talebin kendi durumu
   * değil siparişin durumu — ve incelemeyi bekleyen talepleri kaçırıyordu.
   */
  @Get("dashboard/worklist")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Action queues and alerts awaiting an operator, with the age of the oldest item in each",
  })
  async getDashboardWorklist() {
    return this.worklistService.getWorklist();
  }

  @Get("dashboard/stock")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Current balances: escrow, open seller debt, active listings, memberships by tier, active boosts",
  })
  async getDashboardStock() {
    return this.stockService.getStock();
  }

  @Post("dashboard/refresh")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Drop the dashboard caches so the next read recomputes (the screen's explicit refresh control)",
  })
  async refreshDashboard() {
    await Promise.all([
      this.worklistService.invalidate(),
      this.stockService.invalidate(),
      this.dashboardStatsService.invalidatePeriodCache(),
    ]);
  }

  @Get("commission/revenue")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Get total commission revenue summary" })
  async getCommissionRevenue(@Query() query: AnalyticsQueryDto) {
    return this.adminService.getCommissionRevenue(query);
  }

  @Patch("settings/:key")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Update a specific platform setting by key" })
  @ApiParam({ name: "key", description: "Setting key" })
  async updateSettingByKey(
    @Param("key") key: string,
    @CurrentUser("id") adminId: string,
    @Body() body: { value: string; description?: string },
  ) {
    return this.adminService.updatePlatformSetting(adminId, {
      key,
      value: body.value,
      description: body.description,
    });
  }

  // ==================== AUDIT LOGS ====================

  @Get("audit-logs")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @RequirePermission("logs")
  @ApiOperation({ summary: "Get audit logs" })
  async getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.adminService.getAuditLogs(query);
  }
}
