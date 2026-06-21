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
  ResolveRefundDisputeDto,
  RefundRequestQueryDto,
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

  // ==================== COMMISSION RULES ====================

  @Get('commission-rules')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all commission rules' })
  @ApiResponse({ status: HttpStatus.OK, type: [CommissionRuleResponseDto] })
  async getCommissionRules() {
    return this.adminService.getCommissionRules();
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

  // ==================== USER MANAGEMENT ====================

  @Get('users')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get users with filters' })
  async getUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Post('users/:id/ban')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async banUser(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: BanUserDto,
  ) {
    return this.adminService.banUser(adminId, id, dto);
  }

  @Post('users/:id/unban')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unban a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async unbanUser(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.unbanUser(adminId, id);
  }

  @Get('users/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get user details by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  // ==================== ADMIN STAFF (admin rol yönetimi) ====================
  // Atama/güncelleme/kaldırma: super_admin her zaman; admin yalnız ayar açıksa (servis enforce eder,
  // super_admin rolüne admin dokunamaz). Ayar değiştirme yalnız super_admin.

  @Get('staff')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'List admin staff with roles' })
  async listAdminStaff() {
    return this.adminService.listAdminStaff();
  }

  @Get('staff/settings')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get staff-role assignment settings (admin can assign?)' })
  async getStaffSettings() {
    return this.adminService.getStaffSettings();
  }

  @Patch('staff/settings')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Toggle whether admins can assign roles (super_admin only)' })
  async setStaffSettings(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateStaffSettingsDto,
  ) {
    return this.adminService.setStaffSettings(adminId, dto);
  }

  @Post('staff')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign an admin role to a user by email (creates account if missing)' })
  async assignAdminStaff(
    @CurrentUser('id') adminId: string,
    @Body() dto: AssignAdminStaffDto,
  ) {
    return this.adminService.assignAdminStaff(adminId, dto);
  }

  @Patch('staff/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Update an admin staff role/active state' })
  @ApiParam({ name: 'id', description: 'AdminUser ID' })
  async updateAdminStaff(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateAdminStaffDto,
  ) {
    return this.adminService.updateAdminStaff(adminId, id, dto);
  }

  @Get('staff/role-permissions')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @BypassPermissionMatrix()  // İzin matrisi DB'de bozuk olsa bile bu endpoint her zaman erişilebilir olmalı
  @ApiOperation({ summary: 'Get role → permission matrix (defaults + any overrides)' })
  async getRolePermissions() {
    return this.adminService.getRolePermissions();
  }

  @Put('staff/role-permissions')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Update role → permission matrix (super_admin only)' })
  async setRolePermissions(
    @CurrentUser('id') adminId: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    const result = await this.adminService.setRolePermissions(adminId, dto);
    this.rolesGuard.invalidateCache();
    return result;
  }

  @Delete('staff/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Revoke admin access' })
  @ApiParam({ name: 'id', description: 'AdminUser ID' })
  async removeAdminStaff(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.removeAdminStaff(adminId, id);
  }

  // ==================== PRODUCT MANAGEMENT ====================

  @Get('products')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get products with filters' })
  async getProducts(@Query() query: AdminProductQueryDto) {
    return this.adminService.getProducts(query);
  }

  @Get('products/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get single product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async getProduct(@Param('id') id: string) {
    return this.adminService.getProduct(id);
  }

  @Patch('products/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update product details' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async updateProduct(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.adminService.updateProduct(adminId, id, dto);
  }

  @Get('products-export')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Export products to CSV' })
  async exportProducts(
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sellerId') sellerId?: string,
    @Res() res?: any,
  ) {
    const result = await this.adminService.exportProducts({ status, categoryId, sellerId });
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  }

  @Get('payments/refunds')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get refund history' })
  async getRefundHistory(
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getRefundHistory({
      search,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  // ==================== DISCOUNT MANAGEMENT (admin token) ====================


  @Get('discounts')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'List discounts (admin)' })
  async getDiscounts(
    @CurrentUser('id') adminId: string,
    @Query() query: DiscountQueryDto,
  ) {
    return this.discountService.findAll(query, adminId, true);
  }

  @Post('discounts')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Create discount (admin)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Discount created' })
  async createDiscount(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateDiscountDto,
  ) {
    return this.discountService.create(dto, adminId, true);
  }

  @Get('discounts/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get discount by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Discount ID' })
  async getDiscount(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.discountService.findOne(id, adminId, true);
  }

  @Patch('discounts/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update discount (admin)' })
  @ApiParam({ name: 'id', description: 'Discount ID' })
  async updateDiscount(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateDiscountDto,
  ) {
    return this.discountService.update(id, dto, adminId, true);
  }

  @Delete('discounts/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete discount (admin)' })
  @ApiParam({ name: 'id', description: 'Discount ID' })
  async deleteDiscount(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.discountService.delete(id, adminId, true);
  }

  @Post('products/:id/approve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async approveProduct(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ApproveProductDto,
  ) {
    return this.adminService.approveProduct(adminId, id, dto);
  }

  @Post('products/:id/reject')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async rejectProduct(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: RejectProductDto,
  ) {
    return this.adminService.rejectProduct(adminId, id, dto);
  }

  @Post('products/bulk-approve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk approve multiple products' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Products approved' })
  async bulkApproveProducts(
    @CurrentUser('id') adminId: string,
    @Body() body: { ids: string[]; note?: string },
  ) {
    return this.adminService.bulkApproveProducts(adminId, body.ids, body.note);
  }

  @Post('products/bulk-reject')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk reject multiple products' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Products rejected' })
  async bulkRejectProducts(
    @CurrentUser('id') adminId: string,
    @Body() body: { ids: string[]; reason: string },
  ) {
    return this.adminService.bulkRejectProducts(adminId, body.ids, body.reason);
  }

  // ==================== ORDER MANAGEMENT ====================

  @Get('orders')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get orders with filters' })
  async getOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminService.getOrders(query);
  }

  @Get('orders/disputes')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get disputed orders' })
  async getDisputedOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminService.getDisputedOrders(query);
  }

  @Get('orders/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get single order details' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async getOrderById(@Param('id') id: string) {
    return this.adminService.getOrderById(id);
  }

  @Patch('orders/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update order status' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async updateOrderStatus(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.adminService.updateOrderStatus(adminId, id, dto);
  }

  @Post('orders/:id/resolve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve order dispute' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async resolveDispute(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.adminService.resolveDispute(adminId, id, dto);
  }

  @Post('orders/:id/tracking')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add tracking information to order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async addOrderTracking(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: { trackingNumber: string; carrier: string; trackingUrl?: string },
  ) {
    return this.adminService.addOrderTracking(adminId, id, dto);
  }

  @Post('orders/:id/notify')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send notification about order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async sendOrderNotification(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: { type: string; message?: string },
  ) {
    return this.adminService.sendOrderNotification(adminId, id, dto as any);
  }

  // ---------- 48h pencere admin müdahaleleri (Faz 3B.4) ----------

  @Post('orders/:id/force-complete')
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force-complete an awaiting_buyer_confirmation order (super_admin only)',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async forceCompleteOrder(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ForceCompleteOrderDto,
  ) {
    return this.adminService.forceCompleteOrder(id, adminId, dto.reason);
  }

  @Post('orders/:id/extend-confirmation')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extend the 48h buyer-confirmation deadline' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async extendOrderConfirmation(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ExtendConfirmationDto,
  ) {
    return this.adminService.extendOrderConfirmation(
      id,
      adminId,
      dto.hours,
      dto.reason,
    );
  }

  @Get('orders/:id/invoice')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get invoice data for order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async getOrderInvoice(@Param('id') id: string) {
    return this.adminService.generateOrderInvoice(id);
  }

  @Post('orders/:id/apply-coupon')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply or remove a coupon code on an order (admin override)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async applyOrderCoupon(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: { code: string | null },
  ) {
    return this.adminService.applyOrderCoupon(id, adminId, dto.code);
  }

  // ==================== ANALYTICS & REPORTS ====================


  @Get('dashboard')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('dashboard/recent-orders')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get recent orders for dashboard' })
  async getRecentOrders(@Query('limit') limit?: string) {
    return this.adminService.getRecentOrders(limit ? parseInt(limit, 10) : 10);
  }

  @Get('dashboard/pending-actions')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get pending actions count for dashboard' })
  async getPendingActions() {
    return this.adminService.getPendingActions();
  }

  @Get('analytics/sales')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get sales analytics with date range' })
  async getSalesAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.adminService.getSalesAnalytics(query);
  }

  @Get('analytics/revenue')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get revenue analytics with date range' })
  async getRevenueAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.adminService.getRevenueAnalytics(query);
  }

  @Get('analytics/users')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get user analytics with date range' })
  async getUserAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.adminService.getUserAnalytics(query);
  }

  @Post('analytics/snapshot')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Save analytics snapshot' })
  async saveAnalyticsSnapshot() {
    return this.adminService.saveAnalyticsSnapshot();
  }

  @Get('reports/sales')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Generate sales report (JSON, CSV, or PDF)' })
  async getSalesReport(@Query() query: ReportQueryDto) {
    return this.adminService.generateSalesReport(query);
  }

  @Get('reports/commission')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get commission report by seller and category' })
  async getCommissionReport(@Query() query: ReportQueryDto) {
    return this.adminService.getCommissionReport(query);
  }

  @Get('reports/custom')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Generate custom report with flexible parameters' })
  async getCustomReport(@Query() query: ReportQueryDto) {
    return this.adminService.generateCustomReport(query);
  }

  @Get('reports/users')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Users report (CSV/PDF/JSON)' })
  async getUsersReport(@Query() query: ReportQueryDto) {
    return this.adminService.generateUsersReport(query);
  }

  @Get('reports/products')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Products report (CSV/PDF/JSON)' })
  async getProductsReport(@Query() query: ReportQueryDto) {
    return this.adminService.generateProductsReport(query);
  }

  @Get('reports/trades')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Trades report (CSV/PDF/JSON)' })
  async getTradesReport(@Query() query: ReportQueryDto) {
    return this.adminService.generateTradesReport(query);
  }

  @Get('commission/revenue')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get total commission revenue summary' })
  async getCommissionRevenue(@Query() query: AnalyticsQueryDto) {
    return this.adminService.getCommissionRevenue(query);
  }

  @Patch('settings/:key')
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: 'Update a specific platform setting by key' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  async updateSettingByKey(
    @Param('key') key: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { value: string; description?: string },
  ) {
    return this.adminService.updatePlatformSetting(adminId, {
      key,
      value: body.value,
      description: body.description,
    });
  }

  // ==================== AUDIT LOGS ====================

  @Get('audit-logs')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @RequirePermission('logs')
  @ApiOperation({ summary: 'Get audit logs' })
  async getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.adminService.getAuditLogs(query);
  }

  // ==================== MODERATION QUEUE ====================

  @Get('moderation/queue')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get moderation queue items' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of items pending moderation' })
  async getModerationQueue(
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.getModerationQueue({
      type,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get('moderation/stats')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get moderation statistics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Moderation statistics' })
  async getModerationStats() {
    return this.adminService.getModerationStats();
  }

  @Get('moderation/ai-checks')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'AI ile denetlenmiş tüm ürünler + skorları' })
  async getAiModerationList(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.getAiModerationList({
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get('moderation/events')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      'Birleşik AI moderasyon günlüğü (tüm varlıklar; entityType/entityId ile süzülebilir)',
  })
  async getModerationEvents(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('decision') decision?: string,
    @Query('kind') kind?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.getModerationEvents({
      entityType,
      entityId,
      userId,
      decision,
      kind,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Post('moderation/test-image')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Tek görseli AI ile test et (skor gör)' })
  async testImageModeration(@Body('imageUrl') imageUrl: string) {
    return this.adminService.testImageModeration(imageUrl);
  }

  @Get('moderation/ai-config')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'AI eşiklerini oku (kabul/uygunsuzluk %)' })
  async getAiConfig() {
    return this.adminService.getAiConfig();
  }

  @Post('moderation/ai-config')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @RequirePermission('ai_moderation')
  @ApiOperation({ summary: 'AI eşiklerini ayarla (canlı + kalıcı)' })
  async setAiConfig(
    @Body() body: { relevanceThreshold?: number; nsfwThreshold?: number },
  ) {
    return this.adminService.setAiConfig(
      body.relevanceThreshold,
      body.nsfwThreshold,
    );
  }

  @Post('moderation/:type/:id/approve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve moderation item' })
  @ApiParam({ name: 'type', description: 'Item type (product, message, user, review)' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  async approveModerationItem(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { notes?: string },
  ) {
    return this.adminService.approveModerationItem(adminId, type, id, body.notes);
  }

  @Post('moderation/:type/:id/reject')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject moderation item' })
  @ApiParam({ name: 'type', description: 'Item type (product, message, user, review)' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  async rejectModerationItem(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { reason: string; notes?: string },
  ) {
    return this.adminService.rejectModerationItem(adminId, type, id, body.reason, body.notes);
  }

  @Post('moderation/:type/:id/flag')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flag moderation item for review' })
  @ApiParam({ name: 'type', description: 'Item type (product, message, user, review)' })
  @ApiParam({ name: 'id', description: 'Item ID' })
  async flagModerationItem(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { reason: string; priority?: string },
  ) {
    return this.adminService.flagModerationItem(adminId, type, id, body.reason, body.priority);
  }

  // ==================== PAYMENT MANAGEMENT ====================

  @Get('payments')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all payments with filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of payments' })
  async getPayments(@Query() query: AdminPaymentQueryDto) {
    return this.adminService.getPayments(query);
  }

  @Get('payments/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get payment details by ID' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment details' })
  async getPaymentById(@Param('id') id: string) {
    return this.adminService.getPaymentById(id);
  }

  @Get('payments/statistics')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get payment statistics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment statistics' })
  async getPaymentStatistics(@Query() query: PaymentStatisticsQueryDto) {
    return this.adminService.getPaymentStatistics(query);
  }

  @Get('payments/failed')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get failed payments' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of failed payments' })
  async getFailedPayments(@Query() query: AdminPaymentQueryDto) {
    return this.adminService.getFailedPayments(query);
  }

  @Post('payments/:id/manual-refund')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manual refund by admin' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Refund processed' })
  async manualRefund(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { amount?: number; reason?: string },
  ) {
    return this.adminService.manualRefund(adminId, id, body.amount, body.reason);
  }

  @Post('payments/:id/force-cancel')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force cancel payment by admin' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment cancelled' })
  async forceCancelPayment(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { reason: string },
  ) {
    return this.adminService.forceCancelPayment(adminId, id, body.reason);
  }

  // ==================== SELLER PAYOUTS ====================

  @Get('payouts/summary')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get payout summary (pending, released, next releases)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payout summary' })
  async getPayoutsSummary() {
    return this.adminService.getPayoutsSummary();
  }

  @Get('payouts/transactions')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get payout transaction history' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of payout transactions' })
  async getPayoutsTransactions(@Query() query: PayoutTransactionsQueryDto) {
    return this.adminService.getPayoutsTransactions(query);
  }

  @Get('payouts/schedule')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get payout schedule (upcoming releases)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payout schedule' })
  async getPayoutsSchedule(
    @Query('sellerId') sellerId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getPayoutsSchedule({ sellerId, limit });
  }

  @Get('payouts/export')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Export payout transactions as CSV' })
  @ApiResponse({ status: HttpStatus.OK, description: 'CSV content and filename' })
  async getPayoutsExport(@Query() query: PayoutExportQueryDto) {
    return this.adminService.getPayoutsExport(query);
  }

  @Post('payouts/release/:orderId')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release payment hold to seller (manual)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Hold released' })
  async releasePayout(
    @Param('orderId') orderId: string,
    @CurrentUser('id') adminId: string,
    @Body('reason') reason: string,
  ) {
    return this.adminService.releasePayout(adminId, orderId, reason);
  }

  @Post('payouts/release-trade/:tradeId')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release trade cash payment hold (manual)' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Trade cash hold released' })
  async releaseTradePaymentHold(
    @Param('tradeId') tradeId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.releaseTradePaymentHold(adminId, tradeId);
  }

  @Post('payouts/:transferId/retry')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed payout transfer' })
  @ApiParam({ name: 'transferId', description: 'PayoutTransfer ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payout retried' })
  async retryPayoutTransfer(
    @Param('transferId') transferId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.retryPayoutTransfer(adminId, transferId);
  }

  @Get('payouts/failed')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get failed/returned payout transfers' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Failed payouts list' })
  async getFailedPayouts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getFailedPayouts(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

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

  // ==================== TRADE MANAGEMENT ====================

  @Get('trades')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get trades with filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of trades' })
  async getTrades(
    @Query('status') status?: string,
    @Query('initiatorId') initiatorId?: string,
    @Query('receiverId') receiverId?: string,
    @Query('userId') userId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getTrades({
      status: status as any,
      initiatorId,
      receiverId,
      userId,
      fromDate,
      toDate,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('trade-shipments')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'List trade shipments across all trades' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated trade shipments' })
  async getTradeShipments(@Query() query: TradeShipmentQueryDto) {
    return this.adminService.findTradeShipments(query);
  }

  @Get('trades/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get trade details by ID' })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Trade details' })
  async getTradeById(@Param('id') id: string) {
    return this.adminService.getTradeById(id);
  }

  @Post('trades/:id/resolve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve trade dispute or cancel trade' })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Trade resolved' })
  async resolveTrade(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { resolution: string; note?: string },
  ) {
    return this.adminService.resolveTrade(adminId, id, body);
  }

  // -------- Safe-trade (warehouse escrow) admin actions --------

  @Post('trades/:id/mark-warehouse-received')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark an incoming (to_warehouse) shipment as received at the Tarodan warehouse',
  })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Shipment marked delivered; if both legs delivered, trade transitions to at_warehouse',
  })
  async markWarehouseReceived(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: MarkShipmentDto,
  ) {
    return this.adminService.markWarehouseReceived(adminId, id, body.shipmentId);
  }

  @Post('trades/:id/approve')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve a safe-trade after both items arrived; ship items to their new owners',
  })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Trade approved; outbound shipments created and status set to shipping_to_recipients',
  })
  async approveWarehouseTrade(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: ApproveWarehouseTradeDto,
  ) {
    return this.adminService.approveWarehouseTrade(adminId, id, body);
  }

  @Post('trades/:id/reject')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reject a safe-trade after admin review; return each item to its original owner',
  })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Trade rejected; return shipments created and status set to returning',
  })
  async rejectWarehouseTrade(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: RejectWarehouseTradeDto,
  ) {
    return this.adminService.rejectWarehouseTrade(adminId, id, body);
  }

  @Post('trades/:id/mark-return-delivered')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark a return shipment as delivered to its original owner; cancel trade when both returns are complete',
  })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Return shipment marked delivered; reservations released and trade cancelled when both complete',
  })
  async markReturnDelivered(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: MarkShipmentDto,
  ) {
    return this.adminService.markReturnDelivered(adminId, id, body.shipmentId);
  }

  @Post('trades/:id/resolve-compensation')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Close a pending compensation flag after settling the user out of band',
  })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Compensation marker resolved; banner clears in admin UI',
  })
  async resolveTradeCompensation(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: { note?: string },
  ) {
    return this.adminService.resolveTradeCompensation(adminId, id, body?.note);
  }

  @Post('trades/:id/retry-refund')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Retry a previously failed PayTR refund for a trade in returning/cancelled/disputed state',
  })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Refund retried; failure flags cleared on success or updated on repeated failure',
  })
  async retryTradeRefund(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.retryTradeRefund(adminId, id);
  }

  @Post('trades/:id/mark-return-lost')
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Declare a return shipment lost; finalizes the trade when both returns are resolved and flags compensation',
  })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Return shipment marked lost; trade cancelled with compensation flag if all returns resolved',
  })
  async markTradeReturnLost(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: MarkReturnLostDto,
  ) {
    return this.adminService.markReturnShipmentLost(adminId, id, body);
  }

  @Post('trades/:id/force-cancel-stuck')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Force-cancel a warehouse-bound trade where one item arrived but the other is stuck',
  })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Counterpart shipment cancelled in carrier, arrived item returned (optional), trade set to returning',
  })
  async forceCancelStuckTrade(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: ForceCancelStuckDto,
  ) {
    return this.adminService.forceCancelStuckWarehouseTrade(adminId, id, body);
  }

  // ==================== REFUND REQUEST ADMIN ====================

  @Get('refund-requests')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'List refund requests for admin operations queue' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated refund requests' })
  async listRefundRequests(@Query() query: RefundRequestQueryDto) {
    return this.adminService.listRefundRequests({
      status: query.status,
      userSearch: query.userSearch,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('refund-requests/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get refund request detail with order/buyer/seller/tracking' })
  @ApiParam({ name: 'id', description: 'RefundRequest ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Refund request detail' })
  async getRefundRequestDetail(@Param('id') id: string) {
    return this.adminService.getRefundRequestDetail(id);
  }

  @Post('refund-requests/:id/resolve-dispute')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve a disputed refund: approve (open return) or reject (close)',
  })
  @ApiParam({ name: 'id', description: 'RefundRequest ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Dispute resolved' })
  async resolveRefundDispute(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: ResolveRefundDisputeDto,
  ) {
    return this.adminService.resolveRefundDispute(adminId, id, body);
  }

  @Post('refund-requests/:id/force-finalize')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Force-finalize a refund stuck in return_delivered (manual finalize + audit)',
  })
  @ApiParam({ name: 'id', description: 'RefundRequest ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Refund finalized' })
  async forceFinalizeRefund(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.forceFinalizeRefund(adminId, id);
  }

  // ---------- RefundRequest policy override (Faz 4B.1) ----------

  @Patch('refund-requests/:id/override-policy')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Override refund policy (4 boolean flags)',
  })
  @ApiParam({ name: 'id', description: 'RefundRequest ID' })
  async overrideRefundPolicy(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: OverrideRefundPolicyDto,
  ) {
    return this.adminService.overrideRefundPolicy(id, adminId, dto);
  }

  @Patch('refund-requests/:id/set-shipping-payer')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set return shipping payer (buyer/seller/platform)' })
  @ApiParam({ name: 'id', description: 'RefundRequest ID' })
  async setReturnShippingPayer(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: SetReturnShippingPayerDto,
  ) {
    return this.adminService.setReturnShippingPayer(id, adminId, dto.payer);
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getMessages({
      status: status as any,
      fromDate,
      toDate,
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

  // ==================== MEMBERSHIP TIER MANAGEMENT ====================

  @Get('membership-tiers')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get all membership tiers' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of membership tiers' })
  async getMembershipTiers() {
    return this.adminService.getMembershipTiers();
  }

  @Patch('membership-tiers/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Update membership tier' })
  @ApiParam({ name: 'id', description: 'Membership tier ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Membership tier updated' })
  async updateMembershipTier(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() body: {
      name?: string;
      description?: string;
      monthlyPrice?: number;
      yearlyPrice?: number;
      maxFreeListings?: number;
      maxTotalListings?: number;
      maxImagesPerListing?: number;
      canCreateCollections?: boolean;
      canTrade?: boolean;
      isAdFree?: boolean;
      featuredListingSlots?: number;
      commissionDiscount?: number;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.adminService.updateMembershipTier(adminId, id, body);
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

  // ==================== PRODUCT DELETION (ADMIN) ====================

  @Delete('products/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product (admin only)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Product deleted' })
  async deleteProduct(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Query('hardDelete') hardDelete?: string,
  ) {
    return this.adminService.deleteProduct(adminId, id, hardDelete === 'true');
  }

  @Post('products/:id/restore')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a soft-deleted product (admin only)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Product restored' })
  async restoreProduct(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.restoreProduct(adminId, id);
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
