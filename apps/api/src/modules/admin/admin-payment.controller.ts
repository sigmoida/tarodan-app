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
import { AdminService } from "./admin.service";
import { AdminPspReconciliationService } from "./admin-psp-reconciliation.service";
import { AdvertisementService } from "../advertisement/advertisement.service";
import { MediaService } from "../media/media.service";
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
  ReorderAdsDto,
} from "../advertisement/dto";
import { DiscountService } from "../discount/discount.service";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
} from "../discount/dto";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { BypassPermissionMatrix } from "../auth/decorators/bypass-permission-matrix.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { AdminRole } from "@prisma/client";
import { ForceCompleteOrderDto, ExtendConfirmationDto } from "../order/dto";
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
  ResolveDisputeDto,
  AnalyticsQueryDto,
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
  PayoutTransactionsQueryDto,
  PayoutScheduleQueryDto,
  PayoutExportQueryDto,
  ReleasePayoutDto,
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
  ManualRefundDto,
  RefundAttemptQueryDto,
  ResolveRefundAttemptDto,
} from "./dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminPaymentController {
  constructor(
    private readonly adminService: AdminService,
    private readonly pspReconciliation: AdminPspReconciliationService,
  ) {}

  // ==================== PAYMENT MANAGEMENT ====================

  @Get("payments")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all payments with filters" })
  @ApiResponse({ status: HttpStatus.OK, description: "List of payments" })
  async getPayments(@Query() query: AdminPaymentQueryDto) {
    return this.adminService.getPayments(query);
  }

  // NOTE: Literal sub-routes (statistics, failed) MUST be declared before the
  // parameterized `payments/:id` route. NestJS/Express match sequentially, so
  // otherwise `:id` would capture "statistics"/"failed" and these would 404.
  @Get("payments/statistics")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get payment statistics" })
  @ApiResponse({ status: HttpStatus.OK, description: "Payment statistics" })
  async getPaymentStatistics(@Query() query: PaymentStatisticsQueryDto) {
    return this.adminService.getPaymentStatistics(query);
  }

  @Get("payments/failed")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get failed payments" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of failed payments",
  })
  async getFailedPayments(@Query() query: AdminPaymentQueryDto) {
    return this.adminService.getFailedPayments(query);
  }

  @Get("payments/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get payment details by ID" })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Payment details" })
  async getPaymentById(@Param("id") id: string) {
    return this.adminService.getPaymentById(id);
  }

  @Post("payments/:id/manual-refund")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Manual refund by admin" })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Refund processed" })
  async manualRefund(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: ManualRefundDto,
  ) {
    return this.adminService.manualRefund(
      adminId,
      id,
      body.amount,
      body.reason,
      body.idempotencyKey,
    );
  }

  @Get("refund-attempts")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "List durable refund attempts" })
  async getRefundAttempts(@Query() query: RefundAttemptQueryDto) {
    return this.adminService.getRefundAttempts(query);
  }

  @Post("refund-attempts/:id/resolve")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resolve a refund attempt after provider reconciliation",
  })
  async resolveRefundAttempt(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: ResolveRefundAttemptDto,
  ) {
    return this.adminService.resolveRefundAttempt(adminId, id, dto);
  }

  @Post("payments/:id/force-cancel")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Force cancel payment by admin" })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Payment cancelled" })
  async forceCancelPayment(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: { reason: string },
  ) {
    return this.adminService.forceCancelPayment(adminId, id, body.reason);
  }

  // ==================== FINANCE OVERVIEW ====================

  @Get("finance/overview")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Finance overview: money-flow funnel (collected → escrow → transferred → platform revenue) + health counters",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Finance overview" })
  async getFinanceOverview() {
    return this.adminService.getFinanceOverview();
  }

  // ==================== PSP (PAYTR) RECONCILIATION ====================

  @Get("finance/psp/reconciliation")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "PSP reconciliation day cards: PayTR statement vs our records, diffs + match counts",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Day cards" })
  async getPspReconciliation(@Query("days") days?: string) {
    const parsed = days ? Number.parseInt(days, 10) : 7;
    return this.pspReconciliation.getReconciliationSummary(
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 31) : 7,
    );
  }

  @Get("finance/psp/statement-lines")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "PayTR statement lines (default: problem rows — unmatched/amount_mismatch)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Statement lines" })
  async getPspStatementLines(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.pspReconciliation.getStatementLines({
      status,
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get("finance/psp/settlements")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "PayTR settlements (realized + future_payments projections)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Settlements" })
  async getPspSettlements() {
    return this.pspReconciliation.getSettlements();
  }

  @Get("invoices/summary")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "eLogo invoice summary strip (month issued, pending, failed, exhausted)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Invoice summary" })
  async getInvoicesSummary() {
    return this.adminService.getInvoicesSummary();
  }

  // ==================== SELLER PAYOUTS ====================

  @Get("payouts/transfers")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "List real bank payout transfers (PayoutTransfer rows)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Payout transfers" })
  async getPayoutTransfers(
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.getPayoutTransfers({
      status,
      search,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get("payouts/adjustments")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "List seller account adjustments (debts deducted from payouts)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Seller adjustments" })
  async getPayoutAdjustments(
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.getPayoutAdjustments({
      status,
      type,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get("payouts/summary")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Get payout summary (pending, released, next releases)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Payout summary" })
  async getPayoutsSummary() {
    return this.adminService.getPayoutsSummary();
  }

  @Get("payouts/transactions")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get payout transaction history" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of payout transactions",
  })
  async getPayoutsTransactions(@Query() query: PayoutTransactionsQueryDto) {
    return this.adminService.getPayoutsTransactions(query);
  }

  @Get("payouts/schedule")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get payout schedule (upcoming releases)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Payout schedule" })
  async getPayoutsSchedule(@Query() query: PayoutScheduleQueryDto) {
    return this.adminService.getPayoutsSchedule(query);
  }

  @Get("payouts/export")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Export payout transactions as CSV" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "CSV content and filename",
  })
  async getPayoutsExport(@Query() query: PayoutExportQueryDto) {
    return this.adminService.getPayoutsExport(query);
  }

  @Post("payouts/release/:orderId")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Release payment hold to seller (manual)" })
  @ApiParam({ name: "orderId", description: "Order ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Hold released" })
  async releasePayout(
    @Param("orderId") orderId: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: ReleasePayoutDto,
  ) {
    return this.adminService.releasePayout(adminId, orderId, dto.reason);
  }

  @Post("payouts/release-trade/:tradeId")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Release trade cash payment hold (manual)" })
  @ApiParam({ name: "tradeId", description: "Trade ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Trade cash hold released",
  })
  async releaseTradePaymentHold(
    @Param("tradeId") tradeId: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.releaseTradePaymentHold(adminId, tradeId);
  }

  @Post("payouts/:transferId/retry")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Retry a failed payout transfer" })
  @ApiParam({ name: "transferId", description: "PayoutTransfer ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Payout retried" })
  async retryPayoutTransfer(
    @Param("transferId") transferId: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.retryPayoutTransfer(adminId, transferId);
  }

  @Get("payouts/failed")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get failed/returned payout transfers" })
  @ApiResponse({ status: HttpStatus.OK, description: "Failed payouts list" })
  async getFailedPayouts(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.getFailedPayouts(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
