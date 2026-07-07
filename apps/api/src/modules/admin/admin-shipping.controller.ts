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
export class AdminShippingController {
  constructor(
    private readonly adminService: AdminService,
  ) { }

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

  @Post('shipping/shipments/:id/sync-tracking')
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: 'Bir Sürat kargosunun takip durumunu anında senkronla' })
  @ApiParam({ name: 'id', description: 'Shipment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Takip senkronlandı' })
  async syncShipmentTracking(@Param('id') id: string) {
    return this.adminService.syncShipmentTracking(id);
  }

  @Post('shipping/surat/endpoint-test')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary: 'Sürat REST endpoint testi: gönderi oluştur + takibini sorgula (DB/siparişe dokunmaz)',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Sürat create + track ham cevapları' })
  async runSuratEndpointTest() {
    return this.adminService.runSuratEndpointTest();
  }

  @Post('shipping/surat/track')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Test konsolu: referansla Sürat takip sorgusu (KargoTakipHareketDetayi)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ham takip cevabı' })
  async suratTestTrack(@Body() body: { ref: string }) {
    return this.adminService.suratTestTrack(body?.ref);
  }

  @Post('shipping/surat/cancel')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Test konsolu: referansla Sürat iptal/geri-çek (GonderiGeriCek)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'İptal cevabı' })
  async suratTestCancel(@Body() body: { ref: string }) {
    return this.adminService.suratTestCancel(body?.ref);
  }

  @Post('shipping/surat/barcode')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Test konsolu: Sürat barkod/etiket üret (OrtakBarkodOlustur)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'KargoTakipNo + ZPL etiket' })
  async suratTestBarcode() {
    return this.adminService.suratTestBarcode();
  }

  @Post('shipping/surat/sil')
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: 'Test konsolu: referansla Sürat gönderi sil (GonderiSil)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'GonderiSil cevabı' })
  async suratTestSil(@Body() body: { ref: string }) {
    return this.adminService.suratTestSil(body?.ref);
  }

}
