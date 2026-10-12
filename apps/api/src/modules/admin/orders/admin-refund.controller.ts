import {
  Controller,
  Get,
  Post,
  Put,
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
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import type { Locale } from "@tarodan/i18n";

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
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
  PayoutTransactionsQueryDto,
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
  RefundRequestCountsQueryDto,
  ApproveRefundRequestDto,
  RefundDecisionPreviewDto,
  RejectRefundRequestDto,
  AdminChangeMembershipDto,
} from "../dto";
import { ReqLocale } from "../../i18n";
import { sendExport } from "../../../common/export";
import { AdminRefundListService } from "./admin-refund-list.service";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminRefundController {
  constructor(
    private readonly adminService: AdminService,
    private readonly refundList: AdminRefundListService,
  ) {}

  // ==================== REFUND REQUEST ADMIN ====================

  // "İadeler" ekranı: liste / sayaçlar / Excel. Literal yollar `:id`'den ÖNCE
  // tanımlı kalmalı — aksi halde "counts" / "export" talep id'si sanılır.
  // Roller ve izin anahtarı (`refund-requests` → `refund_requests`) liste ile
  // aynı; moderator URL-segment izin kapısında elenir.

  @Get("refund-requests")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Refunds screen: refund requests and trade refund sides by tab and status bucket",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "{ data: AdminRefundRow[], meta }",
  })
  async listRefundRequests(@Query() query: RefundRequestQueryDto) {
    return this.refundList.list(query);
  }

  @Get("refund-requests/counts")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Status bucket counts of one refunds tab, honoring the filters",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminRefundCounts" })
  async countRefundRequests(@Query() query: RefundRequestCountsQueryDto) {
    return this.refundList.counts(query);
  }

  @Get("refund-requests/export")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Current refunds filter as an Excel file (trade = two rows)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "XLSX file" })
  async exportRefundRequests(
    @CurrentUser("id") adminId: string,
    @Query() query: RefundRequestQueryDto,
    @ReqLocale() locale: Locale,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Dosya alıcı/satıcı kimliği ve tutar taşır: her indirme zorunlu denetim
    // bırakır (`refund_requests_export`).
    return sendExport(
      res,
      await this.refundList.export(query, adminId, locale),
    );
  }

  @Get("refund-requests/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Get refund request detail with order/buyer/seller/tracking",
  })
  @ApiParam({ name: "id", description: "RefundRequest ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Refund request detail" })
  async getRefundRequestDetail(@Param("id") id: string) {
    return this.adminService.getRefundRequestDetail(id);
  }

  @Post("refund-requests/:id/decision-preview")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Preview immutable refund v2 financial decision" })
  async previewRefundDecision(
    @Param("id") id: string,
    @Body() dto: RefundDecisionPreviewDto,
  ) {
    return this.adminService.previewRefundDecision(
      id,
      dto.resolvedReason,
      dto.faultParty,
    );
  }

  @Post("refund-requests/:id/approve")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve a refund waiting for admin review" })
  async approveRefundRequest(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: ApproveRefundRequestDto,
  ) {
    return this.adminService.approveRefundRequest(adminId, id, dto);
  }

  @Post("refund-requests/:id/reject")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject a refund waiting for admin review" })
  async rejectRefundRequest(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: RejectRefundRequestDto,
  ) {
    return this.adminService.rejectRefundRequest(adminId, id, dto.reason);
  }

  @Post("refund-requests/:id/dispute")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "O3: Mark a refund disputed during seller inspection (pauses 24h auto-finalize)",
  })
  @ApiParam({ name: "id", description: "RefundRequest ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Refund marked disputed" })
  async markRefundDisputed(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body("note") note: string,
  ) {
    return this.adminService.markRefundDisputed(adminId, id, note);
  }

  @Post("refund-requests/:id/force-finalize")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Force-finalize a refund stuck in return_delivered (manual finalize + audit)",
  })
  @ApiParam({ name: "id", description: "RefundRequest ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Refund finalized" })
  async forceFinalizeRefund(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.forceFinalizeRefund(adminId, id);
  }

  @Post("refund-requests/:id/close")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "MONEY-H6: Force-close a stuck refund WITHOUT refunding (unfreezes hold → seller paid)",
  })
  @ApiParam({ name: "id", description: "RefundRequest ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Refund closed" })
  async closeStuckRefund(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body("reason") reason?: string,
  ) {
    return this.adminService.closeStuckRefund(adminId, id, reason);
  }

  // NOT: PATCH override-policy ve set-shipping-payer uçları KALDIRILDI —
  // `policyCode === "legacy"` şartına bağlıydılar ve her kayıt gerçek policy
  // koduyla yaratıldığı için fiilen erişilemezlerdi. Tek karar akışı:
  // decision-preview + approve (bileşen bazlı politika).
}
