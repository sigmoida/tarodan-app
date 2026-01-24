import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminRoute } from '../auth/decorators/admin-route.decorator';
import { AdminRole } from '@prisma/client';
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
  ResolveDisputeDto,
  AnalyticsQueryDto,
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
} from './dto';

@ApiTags('admin')
@Controller('admin')
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== COMMISSION RULES ====================

  @Get('commission-rules')
  @Roles(AdminRole.super_admin, AdminRole.admin)
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
  @Roles(AdminRole.super_admin, AdminRole.admin)
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
  @Roles(AdminRole.super_admin, AdminRole.admin)
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

  // ==================== PRODUCT MANAGEMENT ====================

  @Get('products')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Get products with filters' })
  async getProducts(@Query() query: AdminProductQueryDto) {
    return this.adminService.getProducts(query);
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

  // ==================== ORDER MANAGEMENT ====================

  @Get('orders')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get orders with filters' })
  async getOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminService.getOrders(query);
  }

  @Get('orders/disputes')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get disputed orders' })
  async getDisputedOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminService.getDisputedOrders(query);
  }

  @Get('orders/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get single order details' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  async getOrderById(@Param('id') id: string) {
    return this.adminService.getOrderById(id);
  }

  @Patch('orders/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
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
  @Roles(AdminRole.super_admin, AdminRole.admin)
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

  // ==================== ANALYTICS & REPORTS ====================

  @Get('dashboard')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('dashboard/recent-orders')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get recent orders for dashboard' })
  async getRecentOrders(@Query('limit') limit?: string) {
    return this.adminService.getRecentOrders(limit ? parseInt(limit, 10) : 10);
  }

  @Get('dashboard/pending-actions')
  @Roles(AdminRole.super_admin, AdminRole.admin)
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
  @Roles(AdminRole.super_admin)
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
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get all payments with filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of payments' })
  async getPayments(@Query() query: AdminPaymentQueryDto) {
    return this.adminService.getPayments(query);
  }

  @Get('payments/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get payment details by ID' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment details' })
  async getPaymentById(@Param('id') id: string) {
    return this.adminService.getPaymentById(id);
  }

  @Get('payments/statistics')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get payment statistics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment statistics' })
  async getPaymentStatistics(@Query() query: PaymentStatisticsQueryDto) {
    return this.adminService.getPaymentStatistics(query);
  }

  @Get('payments/failed')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get failed payments' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of failed payments' })
  async getFailedPayments(@Query() query: AdminPaymentQueryDto) {
    return this.adminService.getFailedPayments(query);
  }

  @Post('payments/:id/manual-refund')
  @Roles(AdminRole.super_admin, AdminRole.admin)
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
  @Roles(AdminRole.super_admin, AdminRole.admin)
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

  // ==================== TRADE MANAGEMENT ====================

  @Get('trades')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get trades with filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of trades' })
  async getTrades(
    @Query('status') status?: string,
    @Query('initiatorId') initiatorId?: string,
    @Query('receiverId') receiverId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getTrades({
      status: status as any,
      initiatorId,
      receiverId,
      fromDate,
      toDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('trades/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get trade details by ID' })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Trade details' })
  async getTradeById(@Param('id') id: string) {
    return this.adminService.getTradeById(id);
  }

  @Post('trades/:id/resolve')
  @Roles(AdminRole.super_admin, AdminRole.admin)
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
    @Body() body: { reason: string },
  ) {
    return this.adminService.rejectMessage(adminId, id, body.reason);
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
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get all categories with tree structure' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of categories' })
  async getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Category created' })
  async createCategory(
    @CurrentUser('id') adminId: string,
    @Body() body: { name: string; description?: string; parentId?: string; sortOrder?: number; isActive?: boolean },
  ) {
    return this.adminService.createCategory(adminId, body);
  }

  @Patch('categories/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
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
  @Roles(AdminRole.super_admin, AdminRole.admin)
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

  // ==================== MEMBERSHIP TIER MANAGEMENT ====================

  @Get('membership-tiers')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Get all membership tiers' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of membership tiers' })
  async getMembershipTiers() {
    return this.adminService.getMembershipTiers();
  }

  @Patch('membership-tiers/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
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

  // ==================== PRODUCT DELETION (ADMIN) ====================

  @Delete('products/:id')
  @Roles(AdminRole.super_admin, AdminRole.admin)
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
}
