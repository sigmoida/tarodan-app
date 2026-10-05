import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { AdminRole } from "@prisma/client";
import type { Locale } from "@tarodan/i18n";

import { AdminJwtAuthGuard } from "../../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { Roles } from "../../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { ReqLocale } from "../../../i18n";
import { AdminAuditService } from "../../ops/admin-audit.service";
import { GibReportQueryDto } from "../../dto/gib-report.dto";
import {
  AdminGibReportService,
  GIB_REPORT_EXPORT_ROW_CAP,
} from "./admin-gib-report.service";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GİB ilan / satıcı raporu — vergi idaresinin talep etmesi beklenen ilan ve
 * satıcı verisi.
 *
 * Yol `finance/...` ALTINDA DEĞİL: `RolesGuard` izni `/admin/` sonrasındaki
 * İLK segmentten çözer ve `finance` segmenti `payments` iznine bağlı; kardeş
 * literal segment + `PERMISSION_MAP["gib-report"] = ["tax"]` (`deleted-identities`
 * ile aynı kalıp). Menüde Finans grubunda, Vergi Ayarları ile aynı izinle durur.
 *
 * Toplu TCKN / vergi no taşıdığı için `@Roles` moderator'ü DIŞARIDA bırakır
 * (`users` iznini taşıyan moderator'e ham kimlik açmaz); `tax` izni varsayılan
 * olarak yalnız super_admin'dedir, başkasına rol matrisinden devredilir.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminGibReportController {
  constructor(
    private readonly service: AdminGibReportService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get("gib-report")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary: "GİB ilan / satıcı raporu (filtre, sıralama, sayfalama)",
  })
  @ApiResponse({
    status: 200,
    description: "{ data: AdminGibReportRow[], meta }",
  })
  list(@Query() query: GibReportQueryDto) {
    return this.service.list(query);
  }

  @Get("gib-report/export")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Geçerli filtrenin Excel dökümü (tam kimlik no)" })
  @ApiResponse({ status: 200, description: "XLSX file" })
  async export(
    @CurrentUser("id") adminId: string,
    @Query() query: GibReportQueryDto,
    @ReqLocale() locale: Locale,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.service.exportXlsx(query, locale);

    // Zorunlu denetim kaydı (fail-closed): uç toplu kimlik verisi dışarı
    // taşıyor. `audit_logs` hiç purge edilmez — kimlik DEĞERLERİ değil, filtre
    // ve satır sayısı yazılır; aksi hâlde TCKN'lerin ikinci kalıcı deposu olur.
    await this.audit.createRequiredAuditLog(
      adminId,
      "gib_report_export",
      "GibReport",
      "export",
      null,
      {
        filters: {
          // Arama terimi YAZILMAZ: vergi no / TCKN olabilir. Yalnız uygulanıp
          // uygulanmadığı ve uzunluğu kaydedilir.
          searchApplied: !!query.search?.trim(),
          searchLength: query.search?.trim().length ?? 0,
          status: query.status ?? null,
          sellerKind: query.sellerKind ?? null,
          identityIncomplete: query.identityIncomplete ?? null,
          startDate: query.startDate ?? null,
          endDate: query.endDate ?? null,
        },
        rowCount: file.rowCount,
        truncated: file.truncated,
      },
    );

    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    // Tavan aşıldıysa panel uyarır: dosya yalnız ilk N satırı taşır.
    if (file.truncated) {
      res.setHeader("X-Export-Truncated-At", String(GIB_REPORT_EXPORT_ROW_CAP));
    }
    res.send(file.body);
  }
}
