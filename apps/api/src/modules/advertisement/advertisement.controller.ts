import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AdvertisementService } from "./advertisement.service";
import { AdvertisementTrackingService } from "./advertisement-tracking.service";
import { Public } from "../auth/decorators/public.decorator";
import { resolveClientIp } from "../../common/helpers/client-ip";
// Tık/gösterim kovası istemci IP'sidir (hero slaytlarıyla ortak tanım).
import { BEACON_TRACKING_THROTTLE } from "../../common/helpers/beacon-tracking";

@ApiTags("ads")
@Controller("ads")
@Public()
export class AdvertisementController {
  constructor(
    private readonly advertisementService: AdvertisementService,
    private readonly tracking: AdvertisementTrackingService,
  ) {}

  @Get("active")
  @ApiOperation({ summary: "Get active ads for display (public)" })
  @ApiQuery({
    name: "position",
    required: false,
    description: "Filter by slot: topbar, header, footer, inline, popup",
  })
  @ApiQuery({
    name: "platform",
    required: false,
    description:
      "Requesting client: web or app. Absent = app (only legacy mobile builds omit it). Returns ads targeted at that client or at all.",
  })
  @ApiQuery({
    name: "device",
    required: false,
    deprecated: true,
    description:
      "Legacy web parameter. Not a filter; when platform is absent its presence means the client is web.",
  })
  @ApiResponse({
    status: 200,
    description:
      "Live ads, at most one per position (displayOrder ASC, createdAt DESC). deviceType is derived from platform for legacy clients.",
  })
  getActive(
    @Query("position") position?: string,
    @Query("platform") platform?: string,
    @Query("device") legacyDevice?: string,
  ) {
    return this.advertisementService.getActive(
      position,
      platform,
      legacyDevice,
    );
  }

  @Get("iab-sizes")
  @ApiOperation({ summary: "Get IAB standard ad sizes" })
  @ApiResponse({ status: 200, description: "IAB sizes" })
  getIABSizes() {
    return this.advertisementService.getIABSizes();
  }

  // Gövde okunmaz: `navigator.sendBeacon` text/plain ya da boş gövdeyle
  // gönderir, ikisi de geçerli istektir.
  @Post(":id/click")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(BEACON_TRACKING_THROTTLE)
  @ApiOperation({
    summary:
      "Record ad click (public, beacon-friendly; deduped per IP + ad + hotspot for 10 s, live ads only). Image ads count only with ?hotspot=; text ads only without it.",
  })
  @ApiParam({ name: "id", description: "Ad ID" })
  @ApiQuery({
    name: "hotspot",
    required: false,
    description:
      "Clicked hotspot id (image ads). Must belong to the ad; an invalid or foreign id is ignored (still 204)",
  })
  @ApiResponse({ status: 204, description: "Accepted (counted or ignored)" })
  // `hotspot` ham bırakılır: geçersiz değer 400 değil, sessiz yok sayma —
  // kararı servis verir.
  async recordClick(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("hotspot") hotspot?: unknown,
  ) {
    await this.tracking.recordClick(
      id,
      resolveClientIp(req) ?? "unknown",
      hotspot,
    );
  }

  @Post(":id/impression")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(BEACON_TRACKING_THROTTLE)
  @ApiOperation({
    summary:
      "Record ad impression (public, beacon-friendly; deduped per IP for 30 min, live ads only)",
  })
  @ApiParam({ name: "id", description: "Ad ID" })
  @ApiResponse({ status: 204, description: "Accepted (counted or ignored)" })
  async recordImpression(@Param("id") id: string, @Req() req: Request) {
    await this.tracking.recordImpression(id, resolveClientIp(req) ?? "unknown");
  }
}
