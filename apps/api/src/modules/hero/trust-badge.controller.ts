import { Controller, Get, Header } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { TrustBadgeDto } from "@tarodan/types";
import { Public } from "../auth/decorators/public.decorator";
import { TrustBadgeService } from "./trust-badge.service";
import { HERO_PUBLIC_CACHE_CONTROL } from "./helpers/hero.constants";

/** Ana sayfa güven rozetleri (web + mobil). */
@ApiTags("hero")
@Controller("trust-badges")
@Public()
export class TrustBadgeController {
  constructor(private readonly trustBadges: TrustBadgeService) {}

  @Get()
  @Header("Cache-Control", HERO_PUBLIC_CACHE_CONTROL)
  @ApiOperation({
    summary:
      "Active trust badges (public; displayOrder ASC, both locales, timing tokens such as {returnWindowDays} filled in)",
  })
  @ApiResponse({ status: 200, description: "TrustBadgeDto[]" })
  list(): Promise<TrustBadgeDto[]> {
    return this.trustBadges.listLive();
  }
}
