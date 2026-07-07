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
export class AdminTradeController {
  constructor(
    private readonly adminService: AdminService,
  ) { }

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
  // Gerçek PayTR para iadesi tetikler. URL segmenti "trades" olduğundan izin
  // matrisinde yanlışlıkla 'trades'e düşüyordu; moderator (diğer iade ekranlarına
  // erişemese de) iadeyi retry edebiliyordu. Tüm iade işlemleriyle tutarlı olsun
  // diye refund_requests iznine bağlandı (admin + super_admin; moderator hariç).
  @RequirePermission('refund_requests')
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

}
