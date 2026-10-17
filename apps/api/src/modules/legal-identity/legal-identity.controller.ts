import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { LegalIdentityStatus } from "@tarodan/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { clientIpThrottleTracker } from "../../common/helpers/client-ip";
import { ExposesLegalIdentity } from "../../common/interceptors/strip-sensitive-fields.interceptor";
import { LegalIdentityService } from "./legal-identity.service";
import { SubmitLegalIdentityDto } from "./dto/legal-identity.dto";

/**
 * Üyenin KENDİ yasal kimliği. Yanıt yalnız sahibine gider (`@ExposesLegalIdentity`
 * olmadan genel yanıt süzgeci ad/soyadı düşürür); TCKN yalnız maskeli döner.
 */
@ApiTags("legal-identity")
@Controller("legal-identity")
@ApiBearerAuth()
export class LegalIdentityController {
  constructor(private readonly legalIdentity: LegalIdentityService) {}

  @Get("me")
  @ExposesLegalIdentity()
  @ApiOperation({
    summary:
      "Kimlik kapısı: eksik yasal kimlik alanları (boş `missing` = kapı " +
      "kapalı; personel ve test hesabında `required: false`)",
  })
  @ApiResponse({ status: 200, description: "LegalIdentityStatus" })
  status(@CurrentUser("id") userId: string): Promise<LegalIdentityStatus> {
    return this.legalIdentity.getStatus(userId);
  }

  @Post("me")
  @ExposesLegalIdentity()
  // Kova istemci IP'si (gateway trafiği tek web sunucusu IP'sinde toplanmaz).
  // Uzun pencereli üye + IP bütçesi serviste (`consumeLookupBudget`).
  @Throttle({
    default: { limit: 5, ttl: 60000, getTracker: clientIpThrottleTracker },
  })
  @ApiOperation({
    summary:
      "Eksik yasal kimlik alanlarını kaydet. Dolu alan değiştirilemez " +
      "(düzeltme yalnız admin).",
  })
  @ApiResponse({ status: 201, description: "LegalIdentityStatus" })
  @ApiResponse({ status: 400, description: "Geçersiz ya da eksik alan" })
  @ApiResponse({
    status: 409,
    description:
      "Dolu alan değiştirilmek istendi ya da TCKN kullanılamıyor (başka " +
      "hesap hakkında bilgi verilmez)",
  })
  @ApiResponse({ status: 429, description: "Deneme sınırı aşıldı" })
  submit(
    @CurrentUser("id") userId: string,
    @Body() dto: SubmitLegalIdentityDto,
  ): Promise<LegalIdentityStatus> {
    return this.legalIdentity.submit(userId, dto);
  }
}
