import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import type { AdminLegalIdentity } from "@tarodan/types";

import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AdminCorrectLegalIdentityDto } from "../../legal-identity/dto/legal-identity.dto";
import { AdminLegalIdentityService } from "./admin-legal-identity.service";

/**
 * Yasal kimlik düzeltmesi (kullanıcı detayı → Kimlik bilgileri). Yol `users/`
 * altında: izin segmenti `users` (PERMISSION_MAP.users) — ekran zaten o izinle
 * açılıyor. Moderatör dışarıda: düzeltme devlete bildirilen veriyi değiştirir.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminLegalIdentityController {
  constructor(private readonly service: AdminLegalIdentityService) {}

  @Patch("users/:id/legal-identity")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Üyenin yasal kimliğini düzelt (gerekçe zorunlu, denetim kaydı yazılır)",
  })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiResponse({ status: 200, description: "AdminLegalIdentity" })
  @ApiResponse({
    status: 400,
    description: "Geçersiz alan ya da değişiklik yok",
  })
  @ApiResponse({ status: 409, description: "TCKN başka bir hesapta" })
  correct(
    @CurrentUser("id") adminId: string,
    @Param("id", new ParseUUIDPipe()) userId: string,
    @Body() dto: AdminCorrectLegalIdentityDto,
  ): Promise<AdminLegalIdentity> {
    return this.service.correct(adminId, userId, dto);
  }
}
