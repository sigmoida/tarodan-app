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
  SellerApplicationQueryDto,
} from "../dto";
import { ReviewSellerDocumentDto } from "../../user/dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminSellerApplicationController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== SELLER APPLICATIONS ====================

  @Get("seller-applications")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "List corporate seller applications" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Seller applications list",
  })
  async getSellerApplications(@Query() query: SellerApplicationQueryDto) {
    return this.adminService.getSellerApplications(query);
  }

  @Get("seller-applications/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Corporate seller application detail (docs + IBAN + company)",
  })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Application detail" })
  async getSellerApplicationDetail(@Param("id") id: string) {
    return this.adminService.getSellerApplicationDetail(id);
  }

  @Post("seller-applications/:id/approve")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Approve a corporate seller application" })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Application approved" })
  async approveSellerApplication(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.approveSellerApplication(adminId, id);
  }

  @Post("seller-applications/:id/reject")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Reject a corporate seller application" })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Application rejected" })
  async rejectSellerApplication(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body("reason") reason: string,
  ) {
    return this.adminService.rejectSellerApplication(adminId, id, reason);
  }

  @Patch("seller-applications/:id/documents/:documentId")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Belgeyi onayla, reddet veya revizyon iste" })
  reviewSellerDocument(
    @Param("id") applicationId: string,
    @Param("documentId") documentId: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: ReviewSellerDocumentDto,
  ) {
    return this.adminService.reviewSellerDocument(
      adminId,
      applicationId,
      documentId,
      dto.status,
      dto.note,
    );
  }

  @Post("seller-applications/:id/final-approve")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Tüm belgeleri onaylanan kurumsal hesabı aç" })
  finalApproveSellerApplication(
    @Param("id") applicationId: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.finalApproveSellerApplication(
      adminId,
      applicationId,
    );
  }
}
