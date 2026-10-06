import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminRole } from "@prisma/client";
import type {
  MailAccountTestResult,
  MailAreaState,
  MailRoutingState,
  MailSenderAccountView,
} from "@tarodan/types";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import {
  CreateMailSenderAccountDto,
  TestMailSenderAccountDto,
  UpdateMailAreaDto,
  UpdateMailSenderAccountDto,
} from "../../mail-routing/dto/mail-routing.dto";
import { AdminMailRoutingService } from "./admin-mail-routing.service";

/**
 * Mail Yönlendirme (Sistem → Mail Yönlendirme): gönderici kutuları, alan
 * atamaları, iç bildirim alıcıları ve olay ayarları. Okuma dahil TAMAMI
 * super_admin'e açık — ekran posta kutusu kimliklerini ve personel adreslerini
 * gösterir. İzin matrisi segmenti `mail-routing` → `settings`.
 * Ayrıntı: docs/MAIL_ROUTING.md.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminMailRoutingController {
  constructor(private readonly service: AdminMailRoutingService) {}

  @Get("mail-routing")
  @Roles(AdminRole.super_admin)
  @ApiOperation({
    summary:
      "Mail Yönlendirme durumu: varsayılan kimlik, gönderici kutuları (şifresiz) ve alanlar",
  })
  @ApiResponse({ status: 200, description: "MailRoutingState" })
  getState(): Promise<MailRoutingState> {
    return this.service.getState();
  }

  @Post("mail-routing/accounts")
  @Roles(AdminRole.super_admin)
  @ApiOperation({
    summary: "Gönderici kutu ekle (şifre zorunlu, şifreli saklanır)",
  })
  @ApiResponse({ status: 201, description: "MailSenderAccountView" })
  @ApiResponse({ status: 409, description: "Adres zaten kayıtlı" })
  createAccount(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateMailSenderAccountDto,
  ): Promise<MailSenderAccountView> {
    return this.service.createAccount(adminId, dto);
  }

  @Patch("mail-routing/accounts/:id")
  @Roles(AdminRole.super_admin)
  @ApiOperation({
    summary: "Gönderici kutuyu güncelle (şifre verilmezse korunur)",
  })
  @ApiResponse({ status: 200, description: "MailSenderAccountView" })
  updateAccount(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: UpdateMailSenderAccountDto,
  ): Promise<MailSenderAccountView> {
    return this.service.updateAccount(adminId, id, dto);
  }

  @Delete("mail-routing/accounts/:id")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Gönderici kutuyu sil" })
  @ApiResponse({ status: 204, description: "Silindi" })
  @ApiResponse({ status: 409, description: "Bir alan bu kutuyu kullanıyor" })
  deleteAccount(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
  ): Promise<void> {
    return this.service.deleteAccount(adminId, id);
  }

  @Post("mail-routing/accounts/:id/test")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  // Gerçek SMTP oturumu açar: kaba kuvvet/flood'a karşı sıkı sınır.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Kutunun kendi oturumuyla gerçek test e-postası gönder; sonuç kutuya yazılır",
  })
  @ApiResponse({ status: 200, description: "MailAccountTestResult" })
  testAccount(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: TestMailSenderAccountDto,
  ): Promise<MailAccountTestResult> {
    return this.service.testAccount(adminId, id, dto.to);
  }

  @Patch("mail-routing/areas/:areaId")
  @Roles(AdminRole.super_admin)
  @ApiOperation({
    summary:
      "Alanın gönderici kutusu, görünen adı, Reply-To'su, iç alıcıları ve olay ayarları",
  })
  @ApiResponse({ status: 200, description: "MailAreaState" })
  updateArea(
    @CurrentUser("id") adminId: string,
    @Param("areaId") areaId: string,
    @Body() dto: UpdateMailAreaDto,
  ): Promise<MailAreaState> {
    return this.service.updateArea(adminId, areaId, dto);
  }
}
