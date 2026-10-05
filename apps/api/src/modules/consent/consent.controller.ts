import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { PendingConsentsResponse } from "@tarodan/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { clientIpThrottleTracker } from "../../common/helpers/client-ip";
import { ConsentService } from "./consent.service";
import { AcceptConsentsDto, CookieConsentDto } from "./dto/consent.dto";

/**
 * Üyenin ve ziyaretçinin onay uçları. Belge sürümü ve kanıt (IP, kullanıcı
 * ajanı) sunucuda damgalanır; istemci yalnız "kabul ettim" der.
 */
@ApiTags("consents")
@Controller("consents")
export class ConsentController {
  constructor(private readonly consents: ConsentService) {}

  @Get("me/pending")
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Yeniden-onay kapısı: üyenin onaylaması gereken zorunlu belgeler " +
      "(boş liste = kapı açık)",
  })
  @ApiResponse({ status: 200, description: "PendingConsentsResponse" })
  async pending(
    @CurrentUser("id") userId: string,
  ): Promise<PendingConsentsResponse> {
    return { pending: await this.consents.getPending(userId) };
  }

  @Post("me/accept")
  @ApiBearerAuth()
  // Kova istemci IP'si: web gateway'inin bütün trafiği tek bir web sunucusu
  // IP'sinden gelir, `req.ip` kovası tüm web üyelerini birbirine kilitlerdi.
  @Throttle({
    default: { limit: 10, ttl: 60000, getTracker: clientIpThrottleTracker },
  })
  @ApiOperation({
    summary: "Bekleyen zorunlu belgeleri onayla; kalan bekleyenleri döner",
  })
  @ApiResponse({ status: 201, description: "PendingConsentsResponse" })
  @ApiResponse({ status: 400, description: "Onaylanamaz belge anahtarı" })
  async accept(
    @CurrentUser("id") userId: string,
    @Body() dto: AcceptConsentsDto,
  ): Promise<PendingConsentsResponse> {
    return {
      pending: await this.consents.acceptPending(userId, dto.documents),
    };
  }

  /**
   * Çerez tercihi. Herkese açık (giriş yapmamış ziyaretçi de kaydedilir);
   * oturum varsa kayıt üyeye de bağlanır. Anonim uç tabloyu sınırsız
   * büyütemesin diye sıkı hız sınırı: kova istemci IP'sidir — gateway
   * trafiği tek web sunucusu IP'sinde toplanmaz (`clientIpThrottleTracker`).
   */
  @Post("cookies")
  @Public()
  @Throttle({
    default: { limit: 10, ttl: 60000, getTracker: clientIpThrottleTracker },
  })
  @ApiOperation({ summary: "Çerez tercihini kaydet (anonim ya da üye)" })
  @ApiResponse({ status: 201, description: "{ success: true }" })
  async recordCookies(
    @Body() dto: CookieConsentDto,
    @CurrentUser("id") userId?: string,
  ): Promise<{ success: true }> {
    await this.consents.recordCookiePreferences({
      visitorId: dto.visitorId,
      userId: userId ?? null,
      preferences: dto.preferences,
    });
    return { success: true };
  }
}
