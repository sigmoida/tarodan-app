import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
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

import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { ReqLocale } from "../../i18n";
import { AdminAuditService } from "../ops/admin-audit.service";
import { ConsentRecordQueryDto } from "../dto/consent-record.dto";
import {
  AdminConsentService,
  CONSENT_EXPORT_ROW_CAP,
} from "./admin-consent.service";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Onay Kayıtları — kullanıcıların verdiği hukuki onayların ispat ekranı.
 *
 * Yol `users/...` ALTINDA DEĞİL: `RolesGuard` izni `/admin/` sonrasındaki İLK
 * segmentten çözer; `users/consents` hem `users/:id`e yem olurdu hem de
 * sıralamaya bağlı kırılgan olurdu. Kardeş literal segment +
 * `PERMISSION_MAP.consents = ["users"]` — `deleted-identities` ile aynı kalıp.
 *
 * Döküm, listeyi görebilen her rol için açıktır (liste zaten aynı veriyi
 * sayfa sayfa gösteriyor) ama toplu kişisel veri (IP, e-posta) taşıdığı için
 * her indirme zorunlu denetim kaydı bırakır.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminConsentController {
  constructor(
    private readonly service: AdminConsentService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get("consents")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Onay kayıtları (filtre, sıralama, sayfalama)" })
  @ApiResponse({
    status: 200,
    description: "{ data: AdminConsentRecordRow[], meta }",
  })
  list(@Query() query: ConsentRecordQueryDto) {
    return this.service.list(query);
  }

  @Get("consents/export")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Geçerli filtrenin Excel dökümü" })
  @ApiResponse({ status: 200, description: "XLSX file" })
  async export(
    @CurrentUser("id") adminId: string,
    @Query() query: ConsentRecordQueryDto,
    @ReqLocale() locale: Locale,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.service.exportXlsx(query, locale);

    // Zorunlu denetim kaydı: uç toplu kişisel veri dışarı taşıyor. Değerler
    // değil, filtre ve satır sayısı yazılır.
    await this.audit.createRequiredAuditLog(
      adminId,
      "consent_records_export",
      "ConsentRecord",
      "export",
      null,
      {
        filters: {
          search: query.search ?? null,
          document: query.document ?? null,
          action: query.action ?? null,
          source: query.source ?? null,
          subjectType: query.subjectType ?? null,
          userId: query.userId ?? null,
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
      res.setHeader("X-Export-Truncated-At", String(CONSENT_EXPORT_ROW_CAP));
    }
    res.send(file.body);
  }

  @Get("consents/status/:userId")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Üyenin belge başına en son onayı ve yeniden-onay bekleyip beklemediği",
  })
  @ApiResponse({
    status: 200,
    description: "{ documents: ConsentDocumentStatus[] }",
  })
  status(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.service.status(userId);
  }
}
