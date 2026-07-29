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
  PreviewEmailTemplateDto,
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
export class AdminContentController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== STATIC PAGES ====================

  @Get("pages")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all static pages" })
  @ApiResponse({ status: HttpStatus.OK, description: "List of static pages" })
  async getPages() {
    return this.adminService.getPages();
  }

  @Get("pages/slug/:slug")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get static page by slug" })
  @ApiParam({ name: "slug", description: "Page slug" })
  async getPageBySlug(@Param("slug") slug: string) {
    return this.adminService.getPageBySlug(slug);
  }

  @Get("pages/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get static page by ID" })
  @ApiParam({ name: "id", description: "Page ID" })
  async getPageById(@Param("id") id: string) {
    return this.adminService.getPageById(id);
  }

  @Post("pages")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create static page" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Page created" })
  async createPage(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateStaticPageDto,
  ) {
    return this.adminService.createPage(adminId, dto);
  }

  @Patch("pages/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update static page" })
  @ApiParam({ name: "id", description: "Page ID" })
  async updatePage(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateStaticPageDto,
  ) {
    return this.adminService.updatePage(adminId, id, dto);
  }

  @Delete("pages/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete static page" })
  @ApiParam({ name: "id", description: "Page ID" })
  async deletePage(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deletePage(adminId, id);
  }

  // ==================== EMAIL TEMPLATES ====================

  @Get("email-templates")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all email templates" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of email templates",
  })
  async getEmailTemplates() {
    return this.adminService.getEmailTemplates();
  }

  @Get("email-templates/:key")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get email template by key" })
  @ApiParam({ name: "key", description: "Template key" })
  async getEmailTemplate(@Param("key") key: string) {
    return this.adminService.getEmailTemplate(key);
  }

  @Patch("email-templates/:key")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update email template" })
  @ApiParam({ name: "key", description: "Template key" })
  async updateEmailTemplate(
    @Param("key") key: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.adminService.updateEmailTemplate(adminId, key, dto);
  }

  @Post("email-templates/:key/preview")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Preview email template with sample data" })
  @ApiParam({ name: "key", description: "Template key" })
  async previewEmailTemplate(
    @Param("key") key: string,
    @Body() body: PreviewEmailTemplateDto,
  ) {
    return this.adminService.previewEmailTemplate(
      key,
      body.templateData,
      body.overrideHtml,
      body.overrideSubject,
    );
  }

  @Delete("email-templates/:key")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset email template to default (delete custom)" })
  @ApiParam({ name: "key", description: "Template key" })
  async resetEmailTemplate(
    @CurrentUser("id") adminId: string,
    @Param("key") key: string,
  ) {
    return this.adminService.resetEmailTemplate(adminId, key);
  }

  @Post("email-templates/:key/send-test")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send test email" })
  @ApiParam({ name: "key", description: "Template key" })
  async sendTestEmail(
    @Param("key") key: string,
    @Body() dto: SendTestEmailDto,
  ) {
    return this.adminService.sendTestEmail(key, dto);
  }
}
