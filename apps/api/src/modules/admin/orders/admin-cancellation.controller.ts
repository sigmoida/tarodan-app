import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import type { Locale } from "@tarodan/i18n";
import type { Response } from "express";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { ReqLocale } from "../../i18n";
import {
  AdminCancellationCountsQueryDto,
  AdminCancellationQueryDto,
} from "../dto";
import {
  AdminCancellationService,
  CANCELLATION_EXPORT_ROW_CAP,
} from "./admin-cancellation.service";

/**
 * "İptal & İade" ekranının İptaller sekmesi. Roller ve izin anahtarı iade
 * talepleri listesiyle aynıdır (`cancellations` → `refund_requests`, bkz.
 * `PERMISSION_MAP`): ikisi tek ekranın iki sekmesi.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminCancellationController {
  constructor(private readonly cancellations: AdminCancellationService) {}

  @Get("cancellations")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "List cancelled carts, offer orders and trades by tab and actor sub-tab",
  })
  @ApiResponse({
    status: 200,
    description: "{ data: AdminCancellationRow[], meta }",
  })
  list(@Query() query: AdminCancellationQueryDto) {
    return this.cancellations.list(query);
  }

  @Get("cancellations/counts")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Sub-tab counts for every cancellations tab, honoring the filters",
  })
  @ApiResponse({ status: 200, description: "AdminCancellationCounts" })
  counts(@Query() query: AdminCancellationCountsQueryDto) {
    return this.cancellations.counts(query);
  }

  @Get("cancellations/export")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Current cancellations filter as an Excel file (one row per line)",
  })
  @ApiResponse({ status: 200, description: "XLSX file" })
  async export(
    @Query() query: AdminCancellationQueryDto,
    @ReqLocale() locale: Locale,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.cancellations.exportXlsx(query, locale);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    // Tavan aşıldıysa panel uyarır: dosya yalnız ilk N satırı taşır.
    if (file.truncated) {
      res.setHeader(
        "X-Export-Truncated-At",
        String(CANCELLATION_EXPORT_ROW_CAP),
      );
    }
    res.send(file.body);
  }
}
