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
import { AdminShippingTariffService } from "./admin-shipping-tariff.service";
import {
  CreateShippingTariffDto,
  UpdateShippingTariffDto,
  PreviewShippingTariffDto,
} from "./dto/shipping-tariff.dto";
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
  AdminShipmentQueryDto,
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
export class AdminShippingController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tariffs: AdminShippingTariffService,
  ) {}

  // ==================== SHIPPING TARIFFS (typed pricing) ====================
  // Replaces editing shipping via the generic, unvalidated /admin/settings endpoint.

  @Get("shipping/tariffs")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "List shipping tariffs" })
  @ApiResponse({ status: HttpStatus.OK, description: "Tariffs" })
  async listTariffs(@Query("provider") provider?: string) {
    return this.tariffs.list(provider);
  }

  @Get("shipping/tariffs/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Get a shipping tariff" })
  @ApiParam({ name: "id", description: "Tariff ID" })
  async getTariff(@Param("id") id: string) {
    return this.tariffs.getById(id);
  }

  @Post("shipping/tariffs")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Create a draft shipping tariff" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Draft tariff" })
  async createTariff(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateShippingTariffDto,
  ) {
    return this.tariffs.create(dto, adminId);
  }

  @Patch("shipping/tariffs/:id")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Update a draft shipping tariff" })
  @ApiParam({ name: "id", description: "Tariff ID" })
  async updateTariff(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateShippingTariffDto,
  ) {
    return this.tariffs.update(id, dto, adminId);
  }

  @Post("shipping/tariffs/:id/activate")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Activate a tariff (archives the current active one atomically)",
  })
  @ApiParam({ name: "id", description: "Tariff ID" })
  async activateTariff(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.tariffs.activate(id, adminId);
  }

  @Post("shipping/tariffs/:id/preview")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Preview a tariff's outbound shipping for sample subtotals",
  })
  @ApiParam({ name: "id", description: "Tariff ID" })
  async previewTariff(
    @Param("id") id: string,
    @Body() dto: PreviewShippingTariffDto,
  ) {
    return this.tariffs.preview(id, dto.subtotals);
  }

  // ==================== SHIPPING (view-only) ====================

  @Get("shipping/shipments")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get shipments" })
  @ApiResponse({ status: HttpStatus.OK, description: "List of shipments" })
  async getShipments(@Query() query: AdminShipmentQueryDto) {
    return this.adminService.getShipments(query);
  }

  @Post("shipping/shipments/:id/sync-tracking")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Bir Sürat kargosunun takip durumunu anında senkronla",
  })
  @ApiParam({ name: "id", description: "Shipment ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Takip senkronlandı" })
  async syncShipmentTracking(@Param("id") id: string) {
    return this.adminService.syncShipmentTracking(id);
  }

  @Post("shipping/surat/endpoint-test")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Sürat REST endpoint testi: gönderi oluştur + takibini sorgula (DB/siparişe dokunmaz)",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Sürat create + track ham cevapları",
  })
  async runSuratEndpointTest() {
    return this.adminService.runSuratEndpointTest();
  }

  @Post("shipping/surat/track")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Test konsolu: referansla Sürat takip sorgusu (KargoTakipHareketDetayi)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Ham takip cevabı" })
  async suratTestTrack(@Body() body: { ref: string }) {
    return this.adminService.suratTestTrack(body?.ref);
  }

  @Post("shipping/surat/cancel")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary: "Test konsolu: referansla Sürat iptal/geri-çek (GonderiGeriCek)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "İptal cevabı" })
  async suratTestCancel(@Body() body: { ref: string }) {
    return this.adminService.suratTestCancel(body?.ref);
  }

  @Post("shipping/surat/barcode")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary: "Test konsolu: Sürat barkod/etiket üret (OrtakBarkodOlustur)",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "KargoTakipNo + ZPL etiket",
  })
  async suratTestBarcode() {
    return this.adminService.suratTestBarcode();
  }

  @Post("shipping/surat/sil")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary: "Test konsolu: referansla Sürat gönderi sil (GonderiSil)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "GonderiSil cevabı" })
  async suratTestSil(@Body() body: { ref: string }) {
    return this.adminService.suratTestSil(body?.ref);
  }
}
