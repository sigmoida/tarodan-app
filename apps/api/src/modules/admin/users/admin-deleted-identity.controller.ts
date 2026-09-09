import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AdminRole } from "@prisma/client";

import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AdminAuditService } from "../ops/admin-audit.service";
import { AdminDeletedIdentityService } from "./admin-deleted-identity.service";
import {
  DeletedUserIdentityExportQueryDto,
  DeletedUserIdentityQueryDto,
} from "../dto/deleted-user-identity.dto";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Silinen hesapların kimlik arşivi (aylık resmî bildirim).
 *
 * Yol bilinçli olarak `users/...` ALTINDA DEĞİL: `RolesGuard` izni `/admin/`
 * sonrasındaki İLK segmentten çözüyor, dolayısıyla `users/deleted-identities`
 * hem `users/:id` route'una yem olurdu hem de sıralamaya bağlı kırılgan olurdu.
 * Kardeş literal segment + `PERMISSION_MAP["deleted-identities"] = ["users"]`
 * eşlemesi, `products-export` ile aynı yerleşik kalıp.
 *
 * `@Roles` bilinçli olarak moderator'ü DIŞARIDA bırakır: `users` izin anahtarı
 * moderator'e de verili, yani ham TCKN'yi kapatan tek şey bu liste.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminDeletedIdentityController {
  constructor(
    private readonly service: AdminDeletedIdentityService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get("deleted-identities")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Silinen hesapların kimlik arşivi" })
  async list(@Query() query: DeletedUserIdentityQueryDto) {
    return this.service.list(query);
  }

  @Get("deleted-identities/export")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Aylık bildirim dosyası (Excel)" })
  async export(
    @CurrentUser("id") adminId: string,
    @Query() query: DeletedUserIdentityExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.service.exportPeriod(query);

    // Zorunlu denetim kaydı: bu uç toplu kimlik verisi dışarı taşıyor.
    // newValue'ya kimlik DEĞERLERİ yazılmaz — `audit_logs` hiç purge edilmiyor,
    // TCKN'leri oraya kopyalamak ikinci bir kalıcı kimlik deposu yaratırdı.
    await this.audit.createRequiredAuditLog(
      adminId,
      "deleted_identity_export",
      "DeletedUserIdentity",
      result.period,
      null,
      {
        period: result.period,
        wasSeller: query.wasSeller ?? null,
        rowCount: result.rowCount,
        truncated: result.truncated,
      },
    );

    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.buffer);
  }
}
