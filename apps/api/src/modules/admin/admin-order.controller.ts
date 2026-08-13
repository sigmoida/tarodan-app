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
  AddOrderTrackingDto,
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
} from "./dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminOrderController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== ORDER MANAGEMENT ====================

  @Get("orders")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get orders with filters" })
  async getOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminService.getOrders(query);
  }

  @Get("orders/disputes")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get disputed orders" })
  async getDisputedOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminService.getDisputedOrders(query);
  }

  @Get("orders/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get single order details" })
  @ApiParam({ name: "id", description: "Order ID" })
  async getOrderById(@Param("id") id: string) {
    return this.adminService.getOrderById(id);
  }

  /**
   * Grup dosyası: sipariş id'sinden grup çatısına çözülen tek payload —
   * grup + tek ödeme + paket başına kargo + sipariş başına tam finans/escrow/iade.
   */
  @Get("orders/:id/file")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get the group-umbrella file for an order" })
  @ApiParam({ name: "id", description: "Order ID" })
  async getOrderGroupFile(@Param("id") id: string) {
    return this.adminService.getOrderGroupFile(id);
  }

  @Patch("orders/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Update order status" })
  @ApiParam({ name: "id", description: "Order ID" })
  async updateOrderStatus(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.adminService.updateOrderStatus(adminId, id, dto);
  }

  @Post("orders/:id/resolve")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resolve order dispute" })
  @ApiParam({ name: "id", description: "Order ID" })
  async resolveDispute(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.adminService.resolveDispute(adminId, id, dto);
  }

  @Post("orders/:id/tracking")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Add tracking information to order" })
  @ApiParam({ name: "id", description: "Order ID" })
  async addOrderTracking(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: AddOrderTrackingDto,
  ) {
    return this.adminService.addOrderTracking(adminId, id, dto);
  }

  @Post("orders/:id/notify")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send notification about order" })
  @ApiParam({ name: "id", description: "Order ID" })
  async sendOrderNotification(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: { type: string; message?: string },
  ) {
    return this.adminService.sendOrderNotification(adminId, id, dto as any);
  }

  // ---------- 48h pencere admin müdahaleleri (Faz 3B.4) ----------

  @Post("orders/:id/force-complete")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Force-complete an awaiting_buyer_confirmation order (super_admin only)",
  })
  @ApiParam({ name: "id", description: "Order ID" })
  async forceCompleteOrder(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: ForceCompleteOrderDto,
  ) {
    return this.adminService.forceCompleteOrder(id, adminId, dto.reason);
  }

  @Post("orders/:id/extend-confirmation")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Extend the 48h buyer-confirmation deadline" })
  @ApiParam({ name: "id", description: "Order ID" })
  async extendOrderConfirmation(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: ExtendConfirmationDto,
  ) {
    return this.adminService.extendOrderConfirmation(
      id,
      adminId,
      dto.hours,
      dto.reason,
    );
  }

  @Get("orders/:id/invoice")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get invoice data for order" })
  @ApiParam({ name: "id", description: "Order ID" })
  async getOrderInvoice(@Param("id") id: string) {
    return this.adminService.generateOrderInvoice(id);
  }

  @Post("orders/:id/apply-coupon")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Apply or remove a coupon code on an order (admin override)",
  })
  @ApiParam({ name: "id", description: "Order ID" })
  async applyOrderCoupon(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: { code: string | null },
  ) {
    return this.adminService.applyOrderCoupon(id, adminId, dto.code);
  }
}
