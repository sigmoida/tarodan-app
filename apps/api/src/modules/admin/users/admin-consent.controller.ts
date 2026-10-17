import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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

import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { ReqLocale } from "../../i18n";
import { ConsentRecordQueryDto } from "../dto/consent-record.dto";
import { sendExport } from "../../../common/export";
import { AdminConsentService } from "./admin-consent.service";

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
  constructor(private readonly service: AdminConsentService) {}

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
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Zorunlu denetim kaydı hatta: uç toplu kişisel veri dışarı taşıyor.
    // Değerler ve arama TERİMİ değil, filtreler ve satır sayısı yazılır.
    return sendExport(res, await this.service.export(query, adminId, locale));
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
