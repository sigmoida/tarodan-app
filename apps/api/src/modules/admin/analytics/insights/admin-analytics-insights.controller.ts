import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import { ANALYTICS_TABS, isAnalyticsTab } from "@tarodan/types";
import { AdminRoute } from "../../../auth/decorators/admin-route.decorator";
import { RequirePermission } from "../../../auth/decorators/require-permission.decorator";
import { Roles } from "../../../auth/decorators/roles.decorator";
import { AdminJwtAuthGuard } from "../../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { i18nMessage } from "../../../i18n";
import { AnalyticsExportQueryDto, AnalyticsRangeQueryDto } from "../../dto";
import { AnalyticsCatalogService } from "./analytics-catalog.service";
import { AnalyticsExportService } from "./analytics-export.service";
import { AnalyticsMembershipService } from "./analytics-membership.service";
import { AnalyticsQualityService } from "./analytics-quality.service";
import { AnalyticsSalesService } from "./analytics-sales.service";
import { AnalyticsTradeService } from "./analytics-trade.service";

/**
 * Analitik ekranının uçları — SEKME BAŞINA bir tane.
 *
 * Eski ekran hangi sekmede olursanız olun beş isteği birden atıyordu; takas
 * sekmesine bakan yönetici ürün raporunun bitmesini de bekliyordu. Artık her
 * sekme yalnız kendi verisini çeker ve yanıt Redis'te önbelleklenir.
 *
 * İzin: `@RequirePermission("analytics")`. Eski uçlar yalnız ROLE bakıyordu,
 * silinen ikinci rapor modülü ise izin matrisini kullanıyordu — aynı veri iki
 * farklı kapıdan servis ediliyordu.
 */
@ApiTags("admin")
@Controller("admin/analytics")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(AdminRole.super_admin, AdminRole.admin)
@RequirePermission("analytics")
export class AdminAnalyticsInsightsController {
  constructor(
    private readonly sales: AnalyticsSalesService,
    private readonly trade: AnalyticsTradeService,
    private readonly catalog: AnalyticsCatalogService,
    private readonly quality: AnalyticsQualityService,
    private readonly membership: AnalyticsMembershipService,
    private readonly exports: AnalyticsExportService,
  ) {}

  @Get("sales")
  @ApiOperation({
    summary:
      "Satış ve gelir: GMV/sipariş trendi, ledger net geliri, kırılımlar ve gerçek satıştan liderlik tabloları",
  })
  @ApiResponse({ status: 400, description: "Invalid or too-long range" })
  getSales(@Query() query: AnalyticsRangeQueryDto) {
    return this.sales.get(query);
  }

  @Get("trade")
  @ApiOperation({
    summary:
      "Takas ve teklif: huni + çıkışlar, gerçek ortalama takas değeri, teklif→sipariş dönüşümü",
  })
  getTrade(@Query() query: AnalyticsRangeQueryDto) {
    return this.trade.get(query);
  }

  @Get("catalog")
  @ApiOperation({
    summary:
      "Katalog ve satıcı: ilan hunisi, satışa kadar geçen süre, öne çıkarma geliri ve etkisi",
  })
  getCatalog(@Query() query: AnalyticsRangeQueryDto) {
    return this.catalog.get(query);
  }

  @Get("quality")
  @ApiOperation({
    summary:
      "Kalite ve operasyon: iade/iptal oranı ve gerekçeleri, teslim süresi, ödeme başarısızlığı",
  })
  getQuality(@Query() query: AnalyticsRangeQueryDto) {
    return this.quality.get(query);
  }

  @Get("membership")
  @ApiOperation({
    summary:
      "Üyelik: yeni/yenileme/çıkış trendi, katman kırılımı, üyelik geliri",
  })
  getMembership(@Query() query: AnalyticsRangeQueryDto) {
    return this.membership.get(query);
  }

  /**
   * Dosya, sekmenin KENDİ servisinden dönen yanıttan üretilir — ekranda ne
   * yazıyorsa dosyada da o yazar.
   */
  @Get(":tab/export")
  @ApiOperation({ summary: "Aktif sekmenin verisini CSV veya XLSX indir" })
  @ApiParam({ name: "tab", enum: ANALYTICS_TABS })
  async export(
    @Param("tab") tab: string,
    @Query() query: AnalyticsExportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    if (!isAnalyticsTab(tab)) {
      throw new BadRequestException(
        i18nMessage("server.admin.analytics.unknownTab"),
      );
    }

    const { format, ...range } = query;
    const file = await this.exports.export(tab, format ?? "csv", range);

    response.setHeader("Content-Type", file.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.body);
  }
}
