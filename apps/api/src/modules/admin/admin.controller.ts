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
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly advertisementService: AdvertisementService,
    private readonly mediaService: MediaService,
    private readonly discountService: DiscountService,
    private readonly rolesGuard: RolesGuard,
  ) { }

  // ==================== ADVERTISEMENT MANAGEMENT ====================

  @Get('ads')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'List all advertisements' })
  @ApiQuery({ name: 'position', required: false, description: 'Filter by position' })
  @ApiQuery({ name: 'deviceType', required: false, description: 'Filter by device type' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of ads' })
  async getAds(
    @Query('position') position?: string,
    @Query('deviceType') deviceType?: string,
    @Query('isActive') isActive?: string,
  ) {
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.advertisementService.findAll(position, deviceType, active);
  }

  @Get('ads/statistics')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get advertisement statistics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Statistics summary' })
  async getAdStatistics() {
    return this.advertisementService.getStatistics();
  }

  @Get('ads/iab-sizes')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get IAB standard ad sizes' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of IAB sizes' })
  async getIABSizes() {
    return this.advertisementService.getIABSizes();
  }

  @Get('ads/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get single advertisement' })
  @ApiParam({ name: 'id', description: 'Ad ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ad details' })
  async getAd(@Param('id') id: string) {
    return this.advertisementService.findOne(id);
  }

  @Post('ads')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create advertisement' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Ad created' })
  async createAd(@Body() dto: CreateAdvertisementDto) {
    return this.advertisementService.create(dto);
  }

  @Patch('ads/reorder')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder advertisements' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ads reordered' })
  async reorderAds(@Body() dto: ReorderAdsDto) {
    return this.advertisementService.reorder(dto.ids);
  }

  @Patch('ads/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update advertisement' })
  @ApiParam({ name: 'id', description: 'Ad ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ad updated' })
  async updateAd(@Param('id') id: string, @Body() dto: UpdateAdvertisementDto) {
    return this.advertisementService.update(id, dto);
  }

  @Delete('ads/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete advertisement' })
  @ApiParam({ name: 'id', description: 'Ad ID' })
  async deleteAd(@Param('id') id: string) {
    return this.advertisementService.remove(id);
  }

  @Post('media/upload')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload image (e.g. for ad banner)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Returns { url, key }' })
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Dosya gönderilmedi');
    }
    return this.mediaService.upload(file, {
      folder: 'ads',
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxSize: 5 * 1024 * 1024, // 5MB
    });
  }

  // ==================== SHIPPING (view-only) ====================

  @Get('shipping/shipments')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get shipments' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'carrierId', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of shipments' })
  async getShipments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('carrierId') carrierId?: string,
  ) {
    return this.adminService.getShipments({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      carrierId,
    });
  }

  // ==================== LOGS MANAGEMENT ====================

  @Get('logs/errors')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get error logs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'severity', required: false, enum: ['warning', 'error', 'critical'] })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Error logs with pagination' })
  async getErrorLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('severity') severity?: string,
    @Query('source') source?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getErrorLogs({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      severity,
      source,
      userId,
      startDate,
      endDate,
      search,
    });
  }

  @Get('logs/security')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get security logs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'ipAddress', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'resolved', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Security logs with pagination' })
  async getSecurityLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
    @Query('severity') severity?: string,
    @Query('ipAddress') ipAddress?: string,
    @Query('userId') userId?: string,
    @Query('resolved') resolved?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getSecurityLogs({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      eventType,
      severity,
      ipAddress,
      userId,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      startDate,
      endDate,
      search,
    });
  }

  @Patch('logs/security/:id/resolve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @RequirePermission('logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a security issue' })
  @ApiParam({ name: 'id', description: 'Security log ID' })
  async resolveSecurityIssue(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { notes?: string },
  ) {
    return this.adminService.resolveSecurityIssue(adminId, id, body.notes);
  }

  @Post('logs/security/block-ip')
  @Roles(AdminRole.super_admin)
  @RequirePermission('logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block an IP address' })
  @ApiResponse({ status: HttpStatus.OK, description: 'IP blocked' })
  async blockIP(
    @CurrentUser('id') adminId: string,
    @Body() body: { ipAddress: string; reason?: string },
  ) {
    return this.adminService.blockIP(adminId, body.ipAddress, body.reason);
  }

  @Get('logs/emails')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get email logs' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['queued', 'sent', 'delivered', 'bounced', 'failed'] })
  @ApiQuery({ name: 'template', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email logs with pagination' })
  async getEmailLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('template') template?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getEmailLogs({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      template,
      to,
      userId,
      startDate,
      endDate,
      search,
    });
  }

  // ==================== REVIEWS & RATINGS ====================

  @Get('reviews')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all reviews' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of reviews' })
  async getReviews(@Query() query: RatingQueryDto) {
    return this.adminService.getReviews(query);
  }

  @Patch('reviews/:id/status')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update review status' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Review status updated' })
  async updateReviewStatus(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateRatingStatusDto,
  ) {
    return this.adminService.updateReviewStatus(adminId, id, dto.status);
  }

  // ==================== SELLER APPLICATIONS ====================

  @Get('seller-applications')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'List corporate seller applications' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Seller applications list' })
  async getSellerApplications(@Query() query: { page?: number; limit?: number; search?: string; status?: string }) {
    return this.adminService.getSellerApplications(query);
  }

  @Post('seller-applications/:id/approve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Approve a corporate seller application' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Application approved' })
  async approveSellerApplication(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.approveSellerApplication(adminId, id);
  }

  @Post('seller-applications/:id/reject')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Reject a corporate seller application' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Application rejected' })
  async rejectSellerApplication(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body('reason') reason: string,
  ) {
    return this.adminService.rejectSellerApplication(adminId, id, reason);
  }

  // ==================== SELLER (USER) RATINGS ====================

  @Get('user-ratings')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all seller/user ratings' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of user ratings' })
  async getUserRatings(@Query() query: { page?: number; limit?: number; search?: string; status?: string }) {
    return this.adminService.getUserRatings(query);
  }

  @Patch('user-ratings/:id/status')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update seller rating status (approve/reject)' })
  @ApiParam({ name: 'id', description: 'User Rating ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Status updated' })
  async updateUserRatingStatus(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateRatingStatusDto,
  ) {
    return this.adminService.updateUserRatingStatus(adminId, id, dto.status);
  }
}
