import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import {
  HERO_DEFAULT_CLIENT_PLATFORM,
  type HeroSlideDto,
} from "@tarodan/types";
import { Public } from "../auth/decorators/public.decorator";
import { resolveClientIp } from "../../common/helpers/client-ip";
import { BEACON_TRACKING_THROTTLE } from "../../common/helpers/beacon-tracking";
import { HeroSlideQueryDto } from "./dto";
import { HeroSlideService } from "./hero-slide.service";
import { HeroTrackingService } from "./hero-tracking.service";
import { HERO_PUBLIC_CACHE_CONTROL } from "./helpers/hero.constants";
import { UuidParam } from "../../common/pipes/uuid-param.decorator";

/**
 * Vitrin hero slaytları (web + mobil). Kaynak yalnız veritabanıdır; istemci
 * dili kendisi seçer (`pickLocalized`) — iki dil birden döner. İstemci
 * kendini `?platform=web|app` ile tanıtır.
 */
@ApiTags("hero")
@Controller("hero-slides")
@Public()
export class HeroSlideController {
  constructor(
    private readonly heroSlides: HeroSlideService,
    private readonly tracking: HeroTrackingService,
  ) {}

  @Get()
  @Header("Cache-Control", HERO_PUBLIC_CACHE_CONTROL)
  @ApiOperation({
    summary:
      "Live hero slides of a placement for one client (public; active + within schedule, platform ∈ {platform, all}, displayOrder ASC, both locales). placement=home returns [] while that client's hero_home_enabled_* switch is off.",
  })
  @ApiResponse({ status: 200, description: "HeroSlideDto[]" })
  list(@Query() query: HeroSlideQueryDto): Promise<HeroSlideDto[]> {
    // Parametresiz istek yalnız eski mobil sürümlerden gelir.
    return this.heroSlides.listLive(
      query.placement,
      query.platform ?? HERO_DEFAULT_CLIENT_PLATFORM,
    );
  }

  // Gövde okunmaz: `navigator.sendBeacon` text/plain ya da boş gövdeyle
  // gönderir, ikisi de geçerli istektir.
  @Post(":id/impression")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(BEACON_TRACKING_THROTTLE)
  @ApiOperation({
    summary:
      "Record a hero slide impression (public, beacon-friendly; deduped per IP + slide for 30 min, live slides only)",
  })
  @ApiParam({ name: "id", description: "Hero slide ID" })
  @ApiResponse({ status: 204, description: "Accepted (counted or ignored)" })
  async recordImpression(@UuidParam("id") id: string, @Req() req: Request) {
    await this.tracking.recordImpression(id, resolveClientIp(req) ?? "unknown");
  }

  @Post(":id/click")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(BEACON_TRACKING_THROTTLE)
  @ApiOperation({
    summary:
      "Record a hero slide click (public, beacon-friendly; deduped per IP + slide + CTA for 10 s, live slides only). Without ?cta= counts a click on the slide itself.",
  })
  @ApiParam({ name: "id", description: "Hero slide ID" })
  @ApiQuery({
    name: "cta",
    required: false,
    enum: ["1", "2"],
    description:
      "Clicked button. Must exist on the slide; any other value is ignored (still 204)",
  })
  @ApiResponse({ status: 204, description: "Accepted (counted or ignored)" })
  // `cta` ham bırakılır: geçersiz değer 400 değil, sessiz yok sayma — kararı
  // servis verir.
  async recordClick(
    @UuidParam("id") id: string,
    @Req() req: Request,
    @Query("cta") cta?: unknown,
  ) {
    await this.tracking.recordClick(id, resolveClientIp(req) ?? "unknown", cta);
  }
}
