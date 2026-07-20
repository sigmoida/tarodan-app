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
  OverrideRefundPolicyDto,
  SetReturnShippingPayerDto,
} from "../refund/dto";
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
} from "./dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminRefundController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== REFUND REQUEST ADMIN ====================

  @Get("refund-requests")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "List refund requests for admin operations queue" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Paginated refund requests",
  })
  async listRefundRequests(@Query() query: RefundRequestQueryDto) {
    return this.adminService.listRefundRequests(query);
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

  // ---------- RefundRequest policy override (Faz 4B.1) ----------

  @Patch("refund-requests/:id/override-policy")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Override refund policy (4 boolean flags)",
  })
  @ApiParam({ name: "id", description: "RefundRequest ID" })
  async overrideRefundPolicy(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: OverrideRefundPolicyDto,
  ) {
    return this.adminService.overrideRefundPolicy(id, adminId, dto);
  }

  @Patch("refund-requests/:id/set-shipping-payer")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Set return shipping payer (buyer/seller/platform)",
  })
  @ApiParam({ name: "id", description: "RefundRequest ID" })
  async setReturnShippingPayer(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: SetReturnShippingPayerDto,
  ) {
    return this.adminService.setReturnShippingPayer(id, adminId, dto.payer);
  }
}
