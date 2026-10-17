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

import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { sendExport } from "../../../common/export";
import { AdminDeletedIdentityService } from "./admin-deleted-identity.service";
import {
  DeletedUserIdentityExportQueryDto,
  DeletedUserIdentityQueryDto,
} from "../dto/deleted-user-identity.dto";

/**
 * Silinen hesapların kimlik arşivi (aylık resmî bildirim).
 *
 * Yol bilinçli olarak `users/...` ALTINDA DEĞİL: `RolesGuard` izni `/admin/`
 * sonrasındaki İLK segmentten çözüyor, dolayısıyla `users/deleted-identities`
 * hem `users/:id` route'una yem olurdu hem de sıralamaya bağlı kırılgan olurdu.
 * Kardeş literal segment + `PERMISSION_MAP["deleted-identities"] = ["users"]`
 * eşlemesi, `consents` ve `gib-report` ile aynı yerleşik kalıp.
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
  constructor(private readonly service: AdminDeletedIdentityService) {}

  @Get("deleted-identities")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Silinen hesapların kimlik arşivi" })
  async list(@Query() query: DeletedUserIdentityQueryDto) {
    return this.service.list(query);
  }

  @Get("deleted-identities/export")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Aylık bildirim dosyası (Excel)" })
  @ApiResponse({ status: 200, description: "XLSX file" })
  async export(
    @CurrentUser("id") adminId: string,
    @Query() query: DeletedUserIdentityExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Zorunlu denetim kaydı hatta yazılır; newValue'ya kimlik DEĞERLERİ
    // yazılmaz — `audit_logs` hiç purge edilmiyor, TCKN'leri oraya kopyalamak
    // ikinci bir kalıcı kimlik deposu yaratırdı.
    return sendExport(res, await this.service.exportPeriod(query, adminId));
  }
}
