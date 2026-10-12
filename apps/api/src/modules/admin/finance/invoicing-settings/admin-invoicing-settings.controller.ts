import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
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
import type { Locale } from "@tarodan/i18n";
import { AdminJwtAuthGuard } from "../../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { Roles } from "../../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { ReqLocale } from "../../../i18n";
import { UpdateInvoicingSettingsDto } from "./dto/update-invoicing-settings.dto";
import {
  AdminInvoicingSettingsService,
  type AdminInvoicingSettingsResponse,
  type NetsisPingReport,
} from "./admin-invoicing-settings.service";

/**
 * Faturalama Ayarları (Finans → Faturalama Ayarları): Netsis cari/seri/hizmet
 * kartı kodları, hazırlık durumu, etkin sağlayıcı ve bağlantı testi.
 *
 * Segment `invoicing` → `settings` izni (PERMISSION_MAP). Yol `finance/...`
 * ALTINDA DEĞİL: `finance` segmenti `payments` iznine bağlı.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminInvoicingSettingsController {
  constructor(private readonly service: AdminInvoicingSettingsService) {}

  @Get("invoicing/settings")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Netsis faturalama ayarları, hazırlık durumu, etkin sağlayıcı ve ücret türleri",
  })
  @ApiResponse({ status: 200, description: "AdminInvoicingSettingsResponse" })
  get(): Promise<AdminInvoicingSettingsResponse> {
    return this.service.get();
  }

  @Put("invoicing/settings")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Ayarları tek işlemde yaz (zorunlu denetim kaydı, önce/sonra değerleriyle)",
  })
  @ApiResponse({ status: 200, description: "AdminInvoicingSettingsResponse" })
  @ApiResponse({
    status: 400,
    description: "Bilinmeyen anahtar ya da geçersiz değer",
  })
  update(
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateInvoicingSettingsDto,
  ): Promise<AdminInvoicingSettingsResponse> {
    return this.service.update(adminId, dto.values);
  }

  @Post("invoicing/netsis/ping")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  // Gerçek Netsis oturumu açar: kaba kuvvet/flood'a karşı sıkı sınır.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Netsis bağlantı testi (erişim + sürüm + kimlik)" })
  @ApiResponse({ status: 200, description: "NetsisPingReport (hata ok:false)" })
  ping(@ReqLocale() locale: Locale): Promise<NetsisPingReport> {
    return this.service.ping(locale);
  }
}
