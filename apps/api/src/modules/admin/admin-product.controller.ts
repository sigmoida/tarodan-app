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
  OverrideRefundPolicyDto,
  SetReturnShippingPayerDto,
} from "../refund/dto";
import {
  CreateCommissionRuleDto,
  UpdateCommissionRuleDto,
  CommissionRuleResponseDto,
  UpdatePlatformSettingDto,
  PlatformSettingResponseDto,
  AdminUserQueryDto,
  AdminProductQueryDto,
  AdminOrderQueryDto,
  AdminRefundHistoryQueryDto,
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
} from "./dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminProductController {
  constructor(
    private readonly adminService: AdminService,
    private readonly discountService: DiscountService,
  ) {}

  // ==================== PRODUCT MANAGEMENT ====================

  @Get("products")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get products with filters" })
  async getProducts(@Query() query: AdminProductQueryDto) {
    return this.adminService.getProducts(query);
  }

  @Get("products/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get single product" })
  @ApiParam({ name: "id", description: "Product ID" })
  async getProduct(@Param("id") id: string) {
    return this.adminService.getProduct(id);
  }

  @Patch("products/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update product details" })
  @ApiParam({ name: "id", description: "Product ID" })
  async updateProduct(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.adminService.updateProduct(adminId, id, dto);
  }

  @Get("products-export")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Export products to CSV" })
  async exportProducts(
    @Query("status") status?: string,
    @Query("categoryId") categoryId?: string,
    @Query("sellerId") sellerId?: string,
    @Res() res?: any,
  ) {
    const result = await this.adminService.exportProducts({
      status,
      categoryId,
      sellerId,
    });
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.content);
  }

  @Get("payments/refunds")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get refund history" })
  async getRefundHistory(@Query() query: AdminRefundHistoryQueryDto) {
    return this.adminService.getRefundHistory(query);
  }

  // ==================== DISCOUNT MANAGEMENT (admin token) ====================

  @Get("discounts")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "List discounts (admin)" })
  async getDiscounts(
    @CurrentUser("id") adminId: string,
    @Query() query: DiscountQueryDto,
  ) {
    return this.discountService.findAll(query, adminId, true);
  }

  @Post("discounts")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create discount (admin)" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Discount created" })
  async createDiscount(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateDiscountDto,
  ) {
    return this.discountService.create(dto, adminId, true);
  }

  @Get("discounts/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get discount by ID (admin)" })
  @ApiParam({ name: "id", description: "Discount ID" })
  async getDiscount(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.discountService.findOne(id, adminId, true);
  }

  @Patch("discounts/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update discount (admin)" })
  @ApiParam({ name: "id", description: "Discount ID" })
  async updateDiscount(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateDiscountDto,
  ) {
    return this.discountService.update(id, dto, adminId, true);
  }

  @Delete("discounts/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete discount (admin)" })
  @ApiParam({ name: "id", description: "Discount ID" })
  async deleteDiscount(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.discountService.delete(id, adminId, true);
  }

  @Post("products/:id/approve")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve a pending product" })
  @ApiParam({ name: "id", description: "Product ID" })
  async approveProduct(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: ApproveProductDto,
  ) {
    return this.adminService.approveProduct(adminId, id, dto);
  }

  @Post("products/:id/reject")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject a product" })
  @ApiParam({ name: "id", description: "Product ID" })
  async rejectProduct(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: RejectProductDto,
  ) {
    return this.adminService.rejectProduct(adminId, id, dto);
  }

  @Post("products/bulk-approve")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bulk approve multiple products" })
  @ApiResponse({ status: HttpStatus.OK, description: "Products approved" })
  async bulkApproveProducts(
    @CurrentUser("id") adminId: string,
    @Body() body: { ids: string[]; note?: string },
  ) {
    return this.adminService.bulkApproveProducts(adminId, body.ids, body.note);
  }

  @Post("products/bulk-reject")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Bulk reject multiple products" })
  @ApiResponse({ status: HttpStatus.OK, description: "Products rejected" })
  async bulkRejectProducts(
    @CurrentUser("id") adminId: string,
    @Body() body: { ids: string[]; reason: string },
  ) {
    return this.adminService.bulkRejectProducts(adminId, body.ids, body.reason);
  }

  // ==================== PRODUCT DELETION (ADMIN) ====================

  @Delete("products/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete product (admin only)" })
  @ApiParam({ name: "id", description: "Product ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Product deleted" })
  async deleteProduct(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Query("hardDelete") hardDelete?: string,
  ) {
    return this.adminService.deleteProduct(adminId, id, hardDelete === "true");
  }

  @Post("products/:id/restore")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Restore a soft-deleted product (admin only)" })
  @ApiParam({ name: "id", description: "Product ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Product restored" })
  async restoreProduct(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.restoreProduct(adminId, id);
  }
}
