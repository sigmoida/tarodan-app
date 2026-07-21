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
  ModerationEventsQueryDto,
} from "./dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminModerationController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== MODERATION QUEUE ====================

  @Get("moderation/queue")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get moderation queue items" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of items pending moderation",
  })
  async getModerationQueue(
    @Query("type") type?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.adminService.getModerationQueue({
      type,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get("moderation/stats")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get moderation statistics" })
  @ApiResponse({ status: HttpStatus.OK, description: "Moderation statistics" })
  async getModerationStats() {
    return this.adminService.getModerationStats();
  }

  @Get("moderation/ai-checks")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "AI ile denetlenmiş tüm ürünler + skorları" })
  async getAiModerationList(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.adminService.getAiModerationList({
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get("moderation/events")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Birleşik AI moderasyon günlüğü (tüm varlıklar; entityType/entityId ile süzülebilir)",
  })
  async getModerationEvents(@Query() query: ModerationEventsQueryDto) {
    return this.adminService.getModerationEvents(query);
  }

  @Post("moderation/test-image")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Tek görseli AI ile test et (skor gör)" })
  async testImageModeration(@Body("imageUrl") imageUrl: string) {
    return this.adminService.testImageModeration(imageUrl);
  }

  @Get("moderation/ai-config")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "AI eşiklerini oku (kabul/uygunsuzluk %)" })
  async getAiConfig() {
    return this.adminService.getAiConfig();
  }

  @Post("moderation/ai-config")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @RequirePermission("ai_moderation")
  @ApiOperation({ summary: "AI eşiklerini ayarla (canlı + kalıcı)" })
  async setAiConfig(
    @Body() body: { relevanceThreshold?: number; nsfwThreshold?: number },
  ) {
    return this.adminService.setAiConfig(
      body.relevanceThreshold,
      body.nsfwThreshold,
    );
  }

  @Post("moderation/:type/:id/approve")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve moderation item" })
  @ApiParam({
    name: "type",
    description: "Item type (product, message, user, review)",
  })
  @ApiParam({ name: "id", description: "Item ID" })
  async approveModerationItem(
    @Param("type") type: string,
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: { notes?: string },
  ) {
    return this.adminService.approveModerationItem(
      adminId,
      type,
      id,
      body.notes,
    );
  }

  @Post("moderation/:type/:id/reject")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject moderation item" })
  @ApiParam({
    name: "type",
    description: "Item type (product, message, user, review)",
  })
  @ApiParam({ name: "id", description: "Item ID" })
  async rejectModerationItem(
    @Param("type") type: string,
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: { reason: string; notes?: string },
  ) {
    return this.adminService.rejectModerationItem(
      adminId,
      type,
      id,
      body.reason,
      body.notes,
    );
  }

  @Post("moderation/:type/:id/flag")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Flag moderation item for review" })
  @ApiParam({
    name: "type",
    description: "Item type (product, message, user, review)",
  })
  @ApiParam({ name: "id", description: "Item ID" })
  async flagModerationItem(
    @Param("type") type: string,
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: { reason: string; priority?: string },
  ) {
    return this.adminService.flagModerationItem(
      adminId,
      type,
      id,
      body.reason,
      body.priority,
    );
  }
}
