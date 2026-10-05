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
import { AdminService } from "../admin.service";
import { AdvertisementService } from "../../advertisement/advertisement.service";
import { MediaService } from "../../media/media.service";
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
  ReorderAdsDto,
} from "../../advertisement/dto";
import { DiscountService } from "../../discount/discount.service";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
} from "../../discount/dto";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { BypassPermissionMatrix } from "../../auth/decorators/bypass-permission-matrix.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { AdminRole } from "@prisma/client";
import {
  CreateCommissionRuleDto,
  UpdateCommissionRuleDto,
  CommissionRuleResponseDto,
  UpdatePlatformSettingDto,
  PlatformSettingResponseDto,
  AdminUserQueryDto,
  AdminProductQueryDto,
  AdminOrderQueryDto,
  AdminOrderCountsQueryDto,
  AuditLogQueryDto,
  ApproveProductDto,
  RejectProductDto,
  BanUserDto,
  AssignAdminStaffDto,
  UpdateAdminStaffDto,
  UpdateStaffSettingsDto,
  SetRolePermissionsDto,
  AnalyticsQueryDto,
  UpdateOrderStatusDto,
  AdminCancelOrderDto,
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
} from "../dto";
import { AdminOrderCancelService } from "./admin-order-cancel.service";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminOrderController {
  constructor(
    private readonly adminService: AdminService,
    private readonly orderCancel: AdminOrderCancelService,
  ) {}

  // ==================== ORDER MANAGEMENT ====================

  @Get("orders")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "List order carts (groups, offer orders, offers) by tab and bucket",
  })
  @ApiResponse({
    status: 200,
    description: "{ data: AdminOrderListRow[], meta }",
  })
  async getOrders(@Query() query: AdminOrderQueryDto) {
    return this.adminService.getOrders(query);
  }

  // `orders/:id`'den ÖNCE tanımlı olmalı; yoksa "counts" bir sipariş id'si sanılır.
  @Get("orders/counts")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Bucket counts for every orders tab, honoring the list filters",
  })
  @ApiResponse({ status: 200, description: "AdminOrderCounts" })
  async getOrderCounts(@Query() query: AdminOrderCountsQueryDto) {
    return this.adminService.getOrderCounts(query);
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

  /**
   * Yönetici iptalinin önizlemesi: türü (ödenmemiş / kargo öncesi ödenmiş) ve
   * sonucu — iade tutarı ya da "ödeme alınmadı", serbest kalan stok. Tutar
   * iptalle AYNI hesap yolundan gelir; iptal edilemiyorsa iptalle aynı hata.
   */
  @Get("orders/:id/cancel-preview")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @RequirePermission("orders")
  @ApiOperation({
    summary:
      "Preview an admin cancellation: its kind, the refund or 'no payment taken', and the stock released",
  })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiResponse({ status: 200, description: "AdminOrderCancelPreview" })
  @ApiResponse({ status: 400, description: "Order cannot be cancelled" })
  async getOrderCancelPreview(@Param("id") id: string) {
    return this.orderCancel.previewCancel(id);
  }

  /**
   * Admin "Siparişi iptal et" — sipariş (sepet kalemi) başına; ödenmemiş
   * sipariş, kargo öncesi ödenmiş sipariş ve teklif siparişi için TEK uç.
   * Neden katalog kodudur (taraflara etiketi söylenir), not yalnız denetime
   * gider. Kargoya verilmiş / teslim edilmiş / tamamlanmış sipariş ve açık
   * iade talebi olan sipariş reddedilir.
   */
  @Post("orders/:id/cancel")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @RequirePermission("orders")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Cancel an unpaid or a paid not-yet-shipped order (cart or offer order) as the platform",
  })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiResponse({ status: 200, description: "AdminOrderCancelResult" })
  @ApiResponse({
    status: 400,
    description:
      "Invalid reason/note, or the order is handed to the carrier, delivered or completed",
  })
  @ApiResponse({
    status: 409,
    description:
      "Already cancelled, an open refund request, the order's kind changed since the preview, or a payment is in flight",
  })
  async cancelOrder(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: AdminCancelOrderDto,
  ) {
    return this.orderCancel.cancelOrder(adminId, id, dto);
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

  @Get("orders/:id/invoice")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get invoice data for order" })
  @ApiParam({ name: "id", description: "Order ID" })
  async getOrderInvoice(@Param("id") id: string) {
    return this.adminService.generateOrderInvoice(id);
  }
}
