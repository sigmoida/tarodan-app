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
  UpdateMembershipTierDto,
} from "./dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminUserController {
  constructor(
    private readonly adminService: AdminService,
    private readonly rolesGuard: RolesGuard,
  ) {}

  // ==================== USER MANAGEMENT ====================

  @Get("users")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get users with filters" })
  async getUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Post("users/:id/ban")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ban a user" })
  @ApiParam({ name: "id", description: "User ID" })
  async banUser(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: BanUserDto,
  ) {
    return this.adminService.banUser(adminId, id, dto);
  }

  @Post("users/:id/unban")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unban a user" })
  @ApiParam({ name: "id", description: "User ID" })
  async unbanUser(@Param("id") id: string, @CurrentUser("id") adminId: string) {
    return this.adminService.unbanUser(adminId, id);
  }

  @Get("users/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get user details by ID" })
  @ApiParam({ name: "id", description: "User ID" })
  async getUserById(@Param("id") id: string) {
    return this.adminService.getUserById(id);
  }

  @Post("users/:id/membership/cancel")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel a user membership (admin)" })
  @ApiParam({ name: "id", description: "User ID" })
  async adminCancelUserMembership(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.adminCancelUserMembership(adminId, id);
  }

  @Patch("users/:id/membership")
  @Roles(AdminRole.super_admin)
  @ApiOperation({
    summary: "Change a user's membership tier (admin override, no payment)",
  })
  @ApiParam({ name: "id", description: "User ID" })
  async adminChangeUserMembership(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: AdminChangeMembershipDto,
  ) {
    return this.adminService.adminChangeUserMembership(
      adminId,
      id,
      dto.tierType,
      dto.billingPeriod,
    );
  }

  // ==================== ADMIN STAFF (admin rol yönetimi) ====================
  // Atama/güncelleme/kaldırma: super_admin her zaman; admin yalnız ayar açıksa (servis enforce eder,
  // super_admin rolüne admin dokunamaz). Ayar değiştirme yalnız super_admin.

  @Get("staff")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "List admin staff with roles" })
  async listAdminStaff() {
    return this.adminService.listAdminStaff();
  }

  @Get("staff/settings")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary: "Get staff-role assignment settings (admin can assign?)",
  })
  async getStaffSettings() {
    return this.adminService.getStaffSettings();
  }

  @Patch("staff/settings")
  @Roles(AdminRole.super_admin)
  @ApiOperation({
    summary: "Toggle whether admins can assign roles (super_admin only)",
  })
  async setStaffSettings(
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateStaffSettingsDto,
  ) {
    return this.adminService.setStaffSettings(adminId, dto);
  }

  @Post("staff")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Assign an admin role to a user by email (creates account if missing)",
  })
  async assignAdminStaff(
    @CurrentUser("id") adminId: string,
    @Body() dto: AssignAdminStaffDto,
  ) {
    return this.adminService.assignAdminStaff(adminId, dto);
  }

  @Patch("staff/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Update an admin staff role/active state" })
  @ApiParam({ name: "id", description: "AdminUser ID" })
  async updateAdminStaff(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateAdminStaffDto,
  ) {
    return this.adminService.updateAdminStaff(adminId, id, dto);
  }

  @Get("staff/role-permissions")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @BypassPermissionMatrix() // İzin matrisi DB'de bozuk olsa bile bu endpoint her zaman erişilebilir olmalı
  @ApiOperation({
    summary: "Get role → permission matrix (defaults + any overrides)",
  })
  async getRolePermissions() {
    return this.adminService.getRolePermissions();
  }

  @Get("staff/role-permissions/defaults")
  @Roles(AdminRole.super_admin)
  @BypassPermissionMatrix() // matris bozuksa da "varsayılana dön" çalışabilmeli
  @ApiOperation({
    summary: "Factory default role → permission matrix (super_admin only)",
  })
  async getDefaultRolePermissions() {
    return this.adminService.getDefaultRolePermissions();
  }

  @Put("staff/role-permissions")
  @Roles(AdminRole.super_admin)
  @ApiOperation({
    summary: "Update role → permission matrix (super_admin only)",
  })
  async setRolePermissions(
    @CurrentUser("id") adminId: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    const result = await this.adminService.setRolePermissions(adminId, dto);
    this.rolesGuard.invalidateCache();
    return result;
  }

  @Delete("staff/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Revoke admin access" })
  @ApiParam({ name: "id", description: "AdminUser ID" })
  async removeAdminStaff(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.removeAdminStaff(adminId, id);
  }

  // ==================== MEMBERSHIP TIER MANAGEMENT ====================

  @Get("membership-tiers")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all membership tiers" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of membership tiers",
  })
  async getMembershipTiers() {
    return this.adminService.getMembershipTiers();
  }

  // Pricing and entitlement changes directly affect charges and authorization.
  @Patch("membership-tiers/:id")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Update membership tier" })
  @ApiParam({ name: "id", description: "Membership tier ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Membership tier updated",
  })
  async updateMembershipTier(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: UpdateMembershipTierDto,
  ) {
    return this.adminService.updateMembershipTier(adminId, id, body);
  }
}
