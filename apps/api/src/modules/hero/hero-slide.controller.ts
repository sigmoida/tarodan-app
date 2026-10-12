import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
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
import type { HeroSlideDto } from "@tarodan/types";
import { Public } from "../auth/decorators/public.decorator";
import { resolveClientIp } from "../../common/helpers/client-ip";
import { BEACON_TRACKING_THROTTLE } from "../../common/helpers/beacon-tracking";
import { HeroSlideQueryDto } from "./dto";
import { HeroSlideService } from "./hero-slide.service";
import { HeroTrackingService } from "./hero-tracking.service";
import { HERO_PUBLIC_CACHE_CONTROL } from "./helpers/hero.constants";

/**
 * Vitrin hero slaytları (web + mobil). Kaynak yalnız veritabanıdır; istemci
 * dili kendisi seçer (`pickLocalized`) — iki dil birden döner.
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
      "Live hero slides of a placement (public; active + within schedule, displayOrder ASC, both locales)",
  })
  @ApiResponse({ status: 200, description: "HeroSlideDto[]" })
  list(@Query() query: HeroSlideQueryDto): Promise<HeroSlideDto[]> {
    return this.heroSlides.listLive(query.placement);
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
  async recordImpression(@Param("id") id: string, @Req() req: Request) {
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
    @Param("id") id: string,
    @Req() req: Request,
    @Query("cta") cta?: unknown,
  ) {
    await this.tracking.recordClick(
      id,
      resolveClientIp(req) ?? "unknown",
      cta,
    );
  }
}
