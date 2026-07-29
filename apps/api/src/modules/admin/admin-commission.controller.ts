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
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdvertisementService } from '../advertisement/advertisement.service';
import { MediaService } from '../media/media.service';
import { CreateAdvertisementDto, UpdateAdvertisementDto, ReorderAdsDto } from '../advertisement/dto';
import { DiscountService } from '../discount/discount.service';
import { CreateDiscountDto, UpdateDiscountDto, DiscountQueryDto } from '../discount/dto';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { BypassPermissionMatrix } from '../auth/decorators/bypass-permission-matrix.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminRoute } from '../auth/decorators/admin-route.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AdminRole } from '@prisma/client';
import { ForceCompleteOrderDto, ExtendConfirmationDto } from '../order/dto';
import { OverrideRefundPolicyDto, SetReturnShippingPayerDto } from '../refund/dto';
import {
  CreateCommissionRuleDto,
  PreviewCommissionDto,
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
} from './dto';

@ApiTags('admin')
@Controller('admin')
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminCommissionController {
  constructor(
    private readonly adminService: AdminService,
  ) { }

  // ==================== COMMISSION RULES ====================

  @Get('trade-commission-rate')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Takas nakit farkı komisyon oranı (%)' })
  async getTradeCommissionRate() {
    return this.adminService.getTradeCommissionRate();
  }

  @Patch('trade-commission-rate')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Takas komisyon oranını güncelle' })
  async setTradeCommissionRate(
    @CurrentUser('id') adminId: string,
    @Body() body: { rate: number },
  ) {
    return this.adminService.setTradeCommissionRate(adminId, Number(body.rate));
  }

  @Get('commission-rules')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all commission rules' })
  @ApiResponse({ status: HttpStatus.OK, type: [CommissionRuleResponseDto] })
  async getCommissionRules() {
    return this.adminService.getCommissionRules();
  }

  @Post('commission-rules/preview')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Preview checkout commission for an unsaved rule' })
  async previewCommission(@Body() dto: PreviewCommissionDto) {
    return this.adminService.previewCommission(dto);
  }

  @Post('commission-rules')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Create commission rule' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CommissionRuleResponseDto })
  async createCommissionRule(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateCommissionRuleDto,
  ) {
    return this.adminService.createCommissionRule(adminId, dto);
  }

  @Patch('commission-rules/:id')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Update commission rule' })
  @ApiParam({ name: 'id', description: 'Commission rule ID' })
  @ApiResponse({ status: HttpStatus.OK, type: CommissionRuleResponseDto })
  async updateCommissionRule(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateCommissionRuleDto,
  ) {
    return this.adminService.updateCommissionRule(adminId, id, dto);
  }

  @Delete('commission-rules/:id')
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete commission rule' })
  @ApiParam({ name: 'id', description: 'Commission rule ID' })
  async deleteCommissionRule(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteCommissionRule(adminId, id);
  }

  // ==================== PLATFORM SETTINGS ====================

  @Get('settings')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get all platform settings' })
  @ApiResponse({ status: HttpStatus.OK, type: [PlatformSettingResponseDto] })
  async getPlatformSettings() {
    return this.adminService.getPlatformSettings();
  }

  @Get('settings/public')
  @Public()
  @ApiOperation({ summary: 'Get public platform settings (listing limits)' })
  @ApiResponse({ status: HttpStatus.OK })
  async getPublicSettings() {
    return this.adminService.getPublicSettings();
  }

  @Patch('settings')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Update platform setting' })
  @ApiResponse({ status: HttpStatus.OK, type: PlatformSettingResponseDto })
  async updatePlatformSetting(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdatePlatformSettingDto,
  ) {
    return this.adminService.updatePlatformSetting(adminId, dto);
  }

}
