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
export class AdminTaxController {
  constructor(
    private readonly adminService: AdminService,
  ) { }

  // ==================== TAX SETTINGS (Regions, Rates, Rules, Reporting) ====================

  @Get('tax/regions')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all tax regions' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of tax regions' })
  async getTaxRegions() {
    return this.adminService.getTaxRegions();
  }

  @Post('tax/regions')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Create tax region' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tax region created' })
  async createTaxRegion(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateTaxRegionDto,
  ) {
    return this.adminService.createTaxRegion(adminId, dto);
  }

  @Patch('tax/regions/:id')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Update tax region' })
  @ApiParam({ name: 'id', description: 'Tax region ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tax region updated' })
  async updateTaxRegion(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateTaxRegionDto,
  ) {
    return this.adminService.updateTaxRegion(adminId, id, dto);
  }

  @Delete('tax/regions/:id')
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete tax region' })
  @ApiParam({ name: 'id', description: 'Tax region ID' })
  async deleteTaxRegion(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteTaxRegion(adminId, id);
  }

  @Get('tax/rates')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get tax rates (optional filter by region)' })
  @ApiQuery({ name: 'regionId', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of tax rates' })
  async getTaxRates(@Query('regionId') regionId?: string) {
    return this.adminService.getTaxRates(regionId);
  }

  @Post('tax/rates')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Create tax rate' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tax rate created' })
  async createTaxRate(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateTaxRateDto,
  ) {
    return this.adminService.createTaxRate(adminId, dto);
  }

  @Patch('tax/rates/:id')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Update tax rate' })
  @ApiParam({ name: 'id', description: 'Tax rate ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tax rate updated' })
  async updateTaxRate(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateTaxRateDto,
  ) {
    return this.adminService.updateTaxRate(adminId, id, dto);
  }

  @Delete('tax/rates/:id')
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete tax rate' })
  @ApiParam({ name: 'id', description: 'Tax rate ID' })
  async deleteTaxRate(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteTaxRate(adminId, id);
  }

  @Get('tax/rules')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get tax rules (optional filter by region)' })
  @ApiQuery({ name: 'regionId', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of tax rules' })
  async getTaxRules(@Query('regionId') regionId?: string) {
    return this.adminService.getTaxRules(regionId);
  }

  @Post('tax/rules')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Create tax rule' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tax rule created' })
  async createTaxRule(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateTaxRuleDto,
  ) {
    return this.adminService.createTaxRule(adminId, dto);
  }

  @Patch('tax/rules/:id')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Update tax rule' })
  @ApiParam({ name: 'id', description: 'Tax rule ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tax rule updated' })
  async updateTaxRule(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateTaxRuleDto,
  ) {
    return this.adminService.updateTaxRule(adminId, id, dto);
  }

  @Delete('tax/rules/:id')
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete tax rule' })
  @ApiParam({ name: 'id', description: 'Tax rule ID' })
  async deleteTaxRule(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteTaxRule(adminId, id);
  }

  @Get('tax/report')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Tax report by period (from invoices)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tax report summary and breakdown' })
  async getTaxReport(@Query() query: TaxReportQueryDto) {
    return this.adminService.getTaxReport(query);
  }

}
