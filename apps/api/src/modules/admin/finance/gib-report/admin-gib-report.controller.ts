import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
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
import { GibReportQueryDto } from "../../dto/gib-report.dto";
import { sendExport } from "../../../../common/export";
import { AdminGibReportService } from "./admin-gib-report.service";

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
  constructor(private readonly service: AdminGibReportService) {}

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
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Zorunlu denetim kaydı (fail-closed) hatta yazılır: `audit_logs` hiç
    // purge edilmez — kimlik DEĞERLERİ ve arama terimi değil, filtre ve satır
    // sayısı; aksi hâlde TCKN'lerin ikinci kalıcı deposu olur.
    return sendExport(res, await this.service.export(query, adminId, locale));
  }
}
