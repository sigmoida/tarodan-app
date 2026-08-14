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
  ParseUUIDPipe,
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
import { ElogoInvoicingService } from "../../elogo/elogo-invoicing.service";
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
import { ForceCompleteOrderDto, ExtendConfirmationDto } from "../../order/dto";
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
  ElogoInvoiceQueryDto,
  SellerUploadedInvoiceQueryDto,
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
  SetDefaultVatDto,
  SetVatOverrideDto,
  SetWithholdingRateDto,
  WithholdingReportQueryDto,
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

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminTaxController {
  constructor(
    private readonly adminService: AdminService,
    private readonly elogoInvoicing: ElogoInvoicingService,
  ) {}

  // ==================== TAX SETTINGS (Regions, Rates, Rules, Reporting) ====================

  @Get("tax/regions")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all tax regions" })
  @ApiResponse({ status: HttpStatus.OK, description: "List of tax regions" })
  async getTaxRegions() {
    return this.adminService.getTaxRegions();
  }

  @Post("tax/regions")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Create tax region" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Tax region created",
  })
  async createTaxRegion(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateTaxRegionDto,
  ) {
    return this.adminService.createTaxRegion(adminId, dto);
  }

  @Patch("tax/regions/:id")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Update tax region" })
  @ApiParam({ name: "id", description: "Tax region ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Tax region updated" })
  async updateTaxRegion(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateTaxRegionDto,
  ) {
    return this.adminService.updateTaxRegion(adminId, id, dto);
  }

  @Delete("tax/regions/:id")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete tax region" })
  @ApiParam({ name: "id", description: "Tax region ID" })
  async deleteTaxRegion(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteTaxRegion(adminId, id);
  }

  @Get("tax/rates")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get tax rates (optional filter by region)" })
  @ApiQuery({ name: "regionId", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "List of tax rates" })
  async getTaxRates(@Query("regionId") regionId?: string) {
    return this.adminService.getTaxRates(regionId);
  }

  @Post("tax/rates")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Create tax rate" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Tax rate created" })
  async createTaxRate(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateTaxRateDto,
  ) {
    return this.adminService.createTaxRate(adminId, dto);
  }

  @Patch("tax/rates/:id")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Update tax rate" })
  @ApiParam({ name: "id", description: "Tax rate ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Tax rate updated" })
  async updateTaxRate(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateTaxRateDto,
  ) {
    return this.adminService.updateTaxRate(adminId, id, dto);
  }

  @Delete("tax/rates/:id")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete tax rate" })
  @ApiParam({ name: "id", description: "Tax rate ID" })
  async deleteTaxRate(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteTaxRate(adminId, id);
  }

  @Get("tax/rules")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get tax rules (optional filter by region)" })
  @ApiQuery({ name: "regionId", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "List of tax rules" })
  async getTaxRules(@Query("regionId") regionId?: string) {
    return this.adminService.getTaxRules(regionId);
  }

  @Post("tax/rules")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Create tax rule" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Tax rule created" })
  async createTaxRule(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateTaxRuleDto,
  ) {
    return this.adminService.createTaxRule(adminId, dto);
  }

  @Patch("tax/rules/:id")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Update tax rule" })
  @ApiParam({ name: "id", description: "Tax rule ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Tax rule updated" })
  async updateTaxRule(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateTaxRuleDto,
  ) {
    return this.adminService.updateTaxRule(adminId, id, dto);
  }

  @Delete("tax/rules/:id")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete tax rule" })
  @ApiParam({ name: "id", description: "Tax rule ID" })
  async deleteTaxRule(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteTaxRule(adminId, id);
  }

  @Get("tax/report")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Tax report by period (from invoices)" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Tax report summary and breakdown",
  })
  async getTaxReport(@Query() query: TaxReportQueryDto) {
    return this.adminService.getTaxReport(query);
  }

  @Get("tax/vat")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Get simplified VAT config (default rate + category overrides)",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Default VAT rate and category overrides",
  })
  async getVatConfig() {
    return this.adminService.getVatConfig();
  }

  @Patch("tax/vat")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Set default VAT rate" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Default VAT rate updated",
  })
  async setDefaultVat(
    @CurrentUser("id") adminId: string,
    @Body() dto: SetDefaultVatDto,
  ) {
    return this.adminService.setDefaultVat(adminId, dto.rate);
  }

  @Put("tax/vat/override")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Add/update a category VAT override" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Category VAT override upserted",
  })
  async setVatOverride(
    @CurrentUser("id") adminId: string,
    @Body() dto: SetVatOverrideDto,
  ) {
    return this.adminService.setVatOverride(adminId, dto.categoryId, dto.rate);
  }

  @Delete("tax/vat/override/:id")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a category VAT override" })
  @ApiParam({ name: "id", description: "Tax rule ID" })
  async deleteVatOverride(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteVatOverride(adminId, id);
  }

  @Get("tax/withholding")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get e-commerce withholding (stopaj) rate" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Current withholding rate (%)",
  })
  async getWithholdingRate() {
    return this.adminService.getWithholdingRate();
  }

  @Patch("tax/withholding")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Set e-commerce withholding (stopaj) rate" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Withholding rate updated",
  })
  async setWithholdingRate(
    @CurrentUser("id") adminId: string,
    @Body() dto: SetWithholdingRateDto,
  ) {
    return this.adminService.setWithholdingRate(adminId, dto.rate);
  }

  @Get("tax/withholding-report")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Monthly withholding (muhtasar) report per seller" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Withholding totals per seller for the month",
  })
  async getWithholdingReport(@Query() query: WithholdingReportQueryDto) {
    return this.adminService.getWithholdingReport(query);
  }

  // ==================== ELOGO FATURA (e-Arşiv/e-Fatura) ====================

  @Get("invoices")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Kesilen + iade e-Arşiv/e-Fatura belgeleri (sayfalı, filtreli)",
  })
  async getElogoInvoices(@Query() query: ElogoInvoiceQueryDto) {
    return this.adminService.getElogoInvoices(query);
  }

  @Post("invoices/:id/retry")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Deneme bütçesi tükenmiş faturayı yeniden gönder (sayaç sıfırlanır, numara/ETTN korunur)",
  })
  async retryElogoInvoice(@Param("id", ParseUUIDPipe) id: string) {
    // Sağlayıcı arızası bittikten sonra kurtarma yolu: eskiden admin API salt
    // okunurdu ve tükenmiş faturayı yalnız DB'ye elle dokunarak kurtarmak mümkündü.
    await this.elogoInvoicing.resetInvoiceAttempts(id);
    return { success: true };
  }

  @Get("invoices/:id/pdf")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Fatura PDF (S3 presigned URL veya canlı stream)" })
  async getElogoInvoicePdf(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: any,
  ) {
    const r = await this.elogoInvoicing.getInvoiceDownload(id); // userId yok → admin
    if (r.url) {
      res.json({ url: r.url, invoiceNumber: r.invoiceNumber });
      return;
    }
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.invoiceNumber}.pdf"`,
      "Content-Length": r.buffer!.length,
    });
    res.status(HttpStatus.OK).send(r.buffer);
  }

  @Get("seller-invoices")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Kurumsal satıcıların elle yüklediği ürün faturaları (sayfalı, filtreli)",
  })
  async getSellerUploadedInvoices(
    @Query() query: SellerUploadedInvoiceQueryDto,
  ) {
    return this.adminService.getSellerUploadedInvoices(query);
  }

  @Get("seller-invoices/:id/pdf")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Satıcı faturası PDF (S3 presigned URL)" })
  async getSellerUploadedInvoicePdf(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminService.getSellerUploadedInvoicePdf(id);
  }
}
