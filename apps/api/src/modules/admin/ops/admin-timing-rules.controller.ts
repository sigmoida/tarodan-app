import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import type { AdminTimingRulesResponse } from "@tarodan/types";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { UpdateTimingRulesDto } from "../../timing-rules/dto/update-timing-rules.dto";
import { AdminTimingRulesService } from "./admin-timing-rules.service";

/**
 * Süreler ve Kurallar (Sistem → Süreler ve Kurallar). Okuma ayar ekranıyla
 * aynı rollere açık; DEĞİŞTİRME yalnız super_admin'dir — süreler para ve
 * sipariş akışlarını yönetir. İzin matrisi segmenti `timing-rules` →
 * `settings` (PERMISSION_MAP).
 *
 * Genel `PATCH /admin/settings[/:key]` bu kaydın anahtarlarına yazmayı
 * reddeder: tek yazma yolu buradaki doğrulamalı ve denetim kayıtlı uçtur.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminTimingRulesController {
  constructor(private readonly service: AdminTimingRulesService) {}

  @Get("timing-rules")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Süreler ve Kurallar: her kaydın etkin değeri, kaynağı (ayar/env/varsayılan) ve seçili eylemi",
  })
  @ApiResponse({ status: 200, description: "AdminTimingRulesResponse" })
  list(): Promise<AdminTimingRulesResponse> {
    return this.service.list();
  }

  @Patch("timing-rules")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Bir veya birden çok süreyi/eylemi atomik olarak değiştir (super_admin, zorunlu denetim kaydı)",
  })
  @ApiResponse({ status: 200, description: "AdminTimingRulesResponse" })
  @ApiResponse({
    status: 400,
    description: "Sınır, alanlar arası kural ya da kapalı eylem ihlali",
  })
  update(
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateTimingRulesDto,
  ): Promise<AdminTimingRulesResponse> {
    return this.service.update(adminId, dto.changes);
  }
}
