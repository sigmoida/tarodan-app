import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRole } from "@prisma/client";
import { AdminMediaService } from "./admin-media.service";

/**
 * Faz 3 — Admin Medya tarayıcısı (read-only): bucket klasör düzeni UI'dan
 * takip edilir. Yazma/silme bilinçli olarak yok (v2).
 */
@ApiTags("Admin - Media")
@ApiBearerAuth()
@Controller("admin/media")
// Global JwtAuthGuard'ı atla: o normal kullanıcı cookie'sini ister, admin
// oturumunda yalnız admin_token var — dekoratörsüz her istek 401 yiyordu.
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
export class AdminMediaController {
  constructor(private readonly adminMedia: AdminMediaService) {}

  @Get("browse")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Browse the media bucket (folders + files + owning record per file)",
  })
  async browse(@Query("prefix") prefix?: string) {
    return this.adminMedia.browse(prefix ?? "");
  }
}
