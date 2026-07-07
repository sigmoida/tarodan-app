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

  // ==================== STATIC PAGES ====================

  @Get('pages')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all static pages' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of static pages' })
  async getPages() {
    return this.adminService.getPages();
  }

  @Get('pages/slug/:slug')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get static page by slug' })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  async getPageBySlug(@Param('slug') slug: string) {
    return this.adminService.getPageBySlug(slug);
  }

  @Get('pages/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get static page by ID' })
  @ApiParam({ name: 'id', description: 'Page ID' })
  async getPageById(@Param('id') id: string) {
    return this.adminService.getPageById(id);
  }

  @Post('pages')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create static page' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Page created' })
  async createPage(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateStaticPageDto,
  ) {
    return this.adminService.createPage(adminId, dto);
  }

  @Patch('pages/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update static page' })
  @ApiParam({ name: 'id', description: 'Page ID' })
  async updatePage(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateStaticPageDto,
  ) {
    return this.adminService.updatePage(adminId, id, dto);
  }

  @Delete('pages/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete static page' })
  @ApiParam({ name: 'id', description: 'Page ID' })
  async deletePage(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deletePage(adminId, id);
  }

  // ==================== EMAIL TEMPLATES ====================

  @Get('email-templates')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all email templates' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of email templates' })
  async getEmailTemplates() {
    return this.adminService.getEmailTemplates();
  }

  @Get('email-templates/:key')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get email template by key' })
  @ApiParam({ name: 'key', description: 'Template key' })
  async getEmailTemplate(@Param('key') key: string) {
    return this.adminService.getEmailTemplate(key);
  }

  @Patch('email-templates/:key')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update email template' })
  @ApiParam({ name: 'key', description: 'Template key' })
  async updateEmailTemplate(
    @Param('key') key: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.adminService.updateEmailTemplate(adminId, key, dto);
  }

  @Post('email-templates/:key/preview')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview email template with sample data' })
  @ApiParam({ name: 'key', description: 'Template key' })
  async previewEmailTemplate(
    @Param('key') key: string,
    @Body() body: { templateData?: Record<string, any>; overrideHtml?: string; overrideSubject?: string },
  ) {
    return this.adminService.previewEmailTemplate(key, body.templateData, body.overrideHtml, body.overrideSubject);
  }

  @Delete('email-templates/:key')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset email template to default (delete custom)' })
  @ApiParam({ name: 'key', description: 'Template key' })
  async resetEmailTemplate(
    @CurrentUser('id') adminId: string,
    @Param('key') key: string,
  ) {
    return this.adminService.resetEmailTemplate(adminId, key);
  }

  @Post('email-templates/:key/send-test')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send test email' })
  @ApiParam({ name: 'key', description: 'Template key' })
  async sendTestEmail(
    @Param('key') key: string,
    @Body() dto: SendTestEmailDto,
  ) {
    return this.adminService.sendTestEmail(key, dto);
  }

  // ==================== MESSAGE MANAGEMENT ====================

  @Get('messages')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get messages for moderation' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of messages' })
  async getMessages(
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getMessages({
      status: status as any,
      fromDate,
      toDate,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('messages/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get message details by ID' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Message details' })
  async getMessageById(@Param('id') id: string) {
    return this.adminService.getMessageById(id);
  }

  @Post('messages/:id/approve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending message' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Message approved' })
  async approveMessage(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { notes?: string },
  ) {
    return this.adminService.approveMessage(adminId, id, body.notes);
  }

  @Post('messages/:id/reject')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending message' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Message rejected' })
  async rejectMessage(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body?: { reason?: string },
  ) {
    return this.adminService.rejectMessage(adminId, id, body?.reason);
  }

  @Post('messages/:id/revert')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revert message to pending approval' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Message reverted to pending' })
  async revertMessage(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.revertMessage(adminId, id);
  }

  // ==================== SUPPORT TICKET MANAGEMENT ====================

  @Get('support-tickets')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get support tickets with filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of support tickets' })
  async getSupportTickets(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('creatorId') creatorId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getSupportTickets({
      status: status as any,
      priority: priority as any,
      category: category as any,
      assigneeId,
      creatorId,
      fromDate,
      toDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('support-tickets/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get support ticket details by ID' })
  @ApiParam({ name: 'id', description: 'Support ticket ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Support ticket details' })
  async getSupportTicketById(@Param('id') id: string) {
    return this.adminService.getSupportTicketById(id);
  }

  @Patch('support-tickets/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update support ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Support ticket updated' })
  async updateSupportTicket(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { status?: string; priority?: string; assigneeId?: string; note?: string },
  ) {
    return this.adminService.updateSupportTicket(adminId, id, {
      status: body.status as any,
      priority: body.priority as any,
      assigneeId: body.assigneeId,
      note: body.note,
    });
  }

  @Post('support-tickets/:id/reply')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reply to support ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reply sent' })
  async replyToSupportTicket(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { message: string },
  ) {
    return this.adminService.replyToSupportTicket(adminId, id, body.message);
  }

  // ==================== CATEGORY MANAGEMENT ====================

  @Get('categories')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all categories with tree structure' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of categories' })
  async getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Category created' })
  async createCategory(
    @CurrentUser('id') adminId: string,
    @Body() body: { name: string; description?: string; parentId?: string; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.createCategory(adminId, body);
  }

  @Patch('categories/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Category updated' })
  async updateCategory(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { name?: string; description?: string; parentId?: string; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.updateCategory(adminId, id, body);
  }

  @Delete('categories/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Category deleted' })
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteCategory(adminId, id);
  }

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

  // ==================== BRAND MANAGEMENT ====================

  @Get('brands')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all brands' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of brands' })
  async getBrands() {
    return this.adminService.getBrands();
  }

  @Post('brands')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create a new brand' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Brand created' })
  async createBrand(
    @CurrentUser('id') adminId: string,
    @Body() body: { name: string; logo?: string; description?: string; website?: string; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.createBrand(adminId, body);
  }

  @Patch('brands/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update brand' })
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Brand updated' })
  async updateBrand(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { name?: string; logo?: string; description?: string; website?: string; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.updateBrand(adminId, id, body);
  }

  @Delete('brands/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete brand' })
  @ApiParam({ name: 'id', description: 'Brand ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Brand deleted' })
  async deleteBrand(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteBrand(adminId, id);
  }

  // ==================== MANUFACTURER MANAGEMENT ====================

  @Get('manufacturers')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all manufacturers' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of manufacturers' })
  async getManufacturers() {
    return this.adminService.getManufacturers();
  }

  @Post('manufacturers')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create a new manufacturer' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Manufacturer created' })
  async createManufacturer(
    @CurrentUser('id') adminId: string,
    @Body() body: { name: string; logo?: string; description?: string; website?: string; country?: string; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.createManufacturer(adminId, body);
  }

  @Patch('manufacturers/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update manufacturer' })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Manufacturer updated' })
  async updateManufacturer(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { name?: string; logo?: string; description?: string; website?: string; country?: string; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.updateManufacturer(adminId, id, body);
  }

  @Delete('manufacturers/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete manufacturer' })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Manufacturer deleted' })
  async deleteManufacturer(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteManufacturer(adminId, id);
  }

  // ==================== CAR MODEL MANAGEMENT ====================

  @Get('car-models')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all car models' })
  @ApiQuery({ name: 'brandId', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of car models' })
  async getCarModels(@Query('brandId') brandId?: string) {
    return this.adminService.getCarModels(brandId);
  }

  @Post('car-models')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create a new car model' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Car model created' })
  async createCarModel(
    @CurrentUser('id') adminId: string,
    @Body() body: { brandId: string; name: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.createCarModel(adminId, body);
  }

  @Patch('car-models/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update car model' })
  @ApiParam({ name: 'id', description: 'Car Model ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Car model updated' })
  async updateCarModel(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { name?: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.updateCarModel(adminId, id, body);
  }

  @Delete('car-models/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete car model' })
  @ApiParam({ name: 'id', description: 'Car Model ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Car model deleted' })
  async deleteCarModel(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteCarModel(adminId, id);
  }

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

  // ==================== NOTIFICATION MANAGEMENT ====================

  @Get('notifications/history')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get notification history' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'channel', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Notification history' })
  async getNotificationHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getNotificationHistory({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      channel,
      status,
      userId,
      type,
      search,
      startDate,
      endDate,
    });
  }

  @Post('notifications/send')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send notification to users' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Notification sent' })
  async sendNotification(
    @CurrentUser('id') adminId: string,
    @Body() body: {
      title: string;
      body: string;
      channels: string[];
      targetType: 'all' | 'segment' | 'user_ids';
      userIds?: string[];
      segmentCriteria?: Record<string, any>;
      data?: Record<string, any>;
    },
  ) {
    return this.adminService.sendNotification(adminId, body);
  }

  @Post('notifications/schedule')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Schedule a notification' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Notification scheduled' })
  async scheduleNotification(
    @CurrentUser('id') adminId: string,
    @Body() body: {
      title: string;
      body: string;
      channels: string[];
      targetType: 'all' | 'segment' | 'user_ids';
      userIds?: string[];
      segmentCriteria?: Record<string, any>;
      scheduledFor: string;
    },
  ) {
    return this.adminService.scheduleNotification(adminId, body);
  }

  @Get('notifications/scheduled')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get scheduled notifications' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Scheduled notifications' })
  async getScheduledNotifications(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getScheduledNotifications({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
  }

  @Delete('notifications/scheduled/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel scheduled notification' })
  @ApiParam({ name: 'id', description: 'Scheduled notification ID' })
  async cancelScheduledNotification(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.cancelScheduledNotification(adminId, id);
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

  // ==================== COLLECTION MANAGEMENT ====================

  @Get('collections')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all collections with filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'isPublic', required: false })
  @ApiQuery({ name: 'isFeatured', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'name', 'likeCount', 'viewCount'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of collections' })
  async getCollections(
    @Query('search') search?: string,
    @Query('userId') userId?: string,
    @Query('isPublic') isPublic?: string,
    @Query('isFeatured') isFeatured?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'name' | 'likeCount' | 'viewCount',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.adminService.getCollections({
      search,
      userId,
      isPublic: isPublic === 'true' ? true : isPublic === 'false' ? false : undefined,
      isFeatured: isFeatured === 'true' ? true : isFeatured === 'false' ? false : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get('collections/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get collection details' })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Collection details with items' })
  async getCollectionById(@Param('id') id: string) {
    return this.adminService.getCollectionById(id);
  }

  @Post('collections')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create a new collection' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Collection created' })
  async createCollection(
    @CurrentUser('id') adminId: string,
    @Body() body: {
      name: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageUrl?: string;
      userId?: string;
    },
  ) {
    return this.adminService.createAdminCollection(adminId, body);
  }

  @Patch('collections/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update a collection' })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Collection updated' })
  async updateCollection(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageUrl?: string;
    },
  ) {
    return this.adminService.updateAdminCollection(adminId, id, body);
  }

  @Delete('collections/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a collection' })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  async deleteCollection(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteAdminCollection(adminId, id);
  }

  @Post('collections/:id/items')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add products to a collection' })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Products added' })
  async addItemsToCollection(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { productIds: string[] },
  ) {
    return this.adminService.addItemsToCollection(adminId, id, body.productIds);
  }

  @Delete('collections/:collectionId/items/:itemId')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item from a collection' })
  @ApiParam({ name: 'collectionId', description: 'Collection ID' })
  @ApiParam({ name: 'itemId', description: 'Collection Item ID' })
  async removeItemFromCollection(
    @Param('collectionId') collectionId: string,
    @Param('itemId') itemId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.removeItemFromAdminCollection(adminId, collectionId, itemId);
  }

  @Patch('collections/:id/visibility')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set collection visibility' })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  async setCollectionVisibility(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { isPublic: boolean },
  ) {
    return this.adminService.setCollectionVisibility(adminId, id, body.isPublic);
  }

  @Patch('collections/:id/featured')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set collection featured status' })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  async setCollectionFeatured(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { isFeatured: boolean },
  ) {
    return this.adminService.setCollectionFeatured(adminId, id, body.isFeatured);
  }


  // ==================== ATTRIBUTE GROUP MANAGEMENT ====================

  @Get('attribute-groups')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all attribute groups' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of attribute groups' })
  async getAttributeGroups(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAttributeGroups({
      search,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('attribute-groups/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get attribute group with its values' })
  @ApiParam({ name: 'id', description: 'Attribute Group ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Attribute group details' })
  async getAttributeGroupById(@Param('id') id: string) {
    return this.adminService.getAttributeGroupById(id);
  }

  @Post('attribute-groups')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create a new attribute group' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Attribute group created' })
  async createAttributeGroup(
    @CurrentUser('id') adminId: string,
    @Body() body: {
      name: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.adminService.createAttributeGroup(adminId, body);
  }

  @Patch('attribute-groups/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update an attribute group' })
  @ApiParam({ name: 'id', description: 'Attribute Group ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Attribute group updated' })
  async updateAttributeGroup(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: {
      name?: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.adminService.updateAttributeGroup(adminId, id, body);
  }

  @Delete('attribute-groups/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attribute group' })
  @ApiParam({ name: 'id', description: 'Attribute Group ID' })
  async deleteAttributeGroup(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteAttributeGroup(adminId, id);
  }

  // ==================== ATTRIBUTE VALUE MANAGEMENT ====================

  @Get('attributes')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all attributes with filters' })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of attributes' })
  async getAttributes(
    @Query('groupId') groupId?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAttributes({
      groupId,
      search,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('attributes')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create a new attribute value' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Attribute created' })
  async createAttribute(
    @CurrentUser('id') adminId: string,
    @Body() body: {
      groupId: string;
      value: string;
      displayValue?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.createAttribute(adminId, body);
  }

  @Patch('attributes/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update an attribute value' })
  @ApiParam({ name: 'id', description: 'Attribute ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Attribute updated' })
  async updateAttribute(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: {
      value?: string;
      displayValue?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.updateAttribute(adminId, id, body);
  }

  @Delete('attributes/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attribute value' })
  @ApiParam({ name: 'id', description: 'Attribute ID' })
  async deleteAttribute(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.deleteAttribute(adminId, id);
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
