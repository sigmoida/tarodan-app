import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import type { PaginatedResult } from "../../../../common/list";
import { AdminJwtAuthGuard } from "../../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { Roles } from "../../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { NetsisSyncQueryDto, RetryNetsisSyncDto } from "./dto/netsis-sync.dto";
import {
  AdminNetsisSyncService,
  type AdminNetsisSyncRow,
} from "./admin-netsis-sync.service";

/**
 * Netsis muhasebe senkron kayıtları (tahsilat / hakediş / satıcı ödemesi /
 * alıcı iadesi aktarımları). Şimdilik yalnız API — ekran sonra.
 *
 * Segment `invoicing` → `settings` izni (PERMISSION_MAP), Faturalama Ayarları
 * ile aynı yetki.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminNetsisSyncController {
  constructor(private readonly service: AdminNetsisSyncService) {}

  @Get("invoicing/netsis-sync")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Netsis muhasebe senkron kayıtları (sayfalı; tür, durum ve tarih filtresi)",
  })
  @ApiResponse({ status: 200, description: "PaginatedResult<AdminNetsisSyncRow>" })
  list(
    @Query() query: NetsisSyncQueryDto,
  ): Promise<PaginatedResult<AdminNetsisSyncRow>> {
    return this.service.list(query);
  }

  @Post("invoicing/netsis-sync/:id/retry")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Kaydı yeniden kuyruğa al (bütçe sıfırlanır) ya da netsisRef ile elle eşleştir; zorunlu denetim kaydı",
  })
  @ApiResponse({ status: 200, description: "AdminNetsisSyncRow" })
  @ApiResponse({ status: 404, description: "Kayıt yok" })
  @ApiResponse({
    status: 409,
    description: "Zaten yazılmış ya da şu an işleniyor",
  })
  retry(
    @CurrentUser("id") adminId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RetryNetsisSyncDto,
  ): Promise<AdminNetsisSyncRow> {
    return this.service.retry(adminId, id, dto.netsisRef);
  }
}
