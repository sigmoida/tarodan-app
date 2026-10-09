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
import { AD_TRACKING_THROTTLE } from "./helpers/ad-tracking.constants";
import { Public } from "../auth/decorators/public.decorator";
import {
  clientIpThrottleTracker,
  resolveClientIp,
} from "../../common/helpers/client-ip";

/**
 * Tık/gösterim kovası istemci IP'sidir: web gateway trafiği tek web sunucusu
 * IP'sinden gelir, `req.ip` kovası bütün ziyaretçileri tek kovaya kilitlerdi.
 */
const TRACKING_THROTTLE = {
  default: { ...AD_TRACKING_THROTTLE, getTracker: clientIpThrottleTracker },
};

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
    name: "device",
    required: false,
    description: "Filter by device: desktop, mobile, all",
  })
  @ApiResponse({ status: 200, description: "Live ads, displayOrder ASC" })
  getActive(
    @Query("position") position?: string,
    @Query("device") deviceType?: string,
  ) {
    return this.advertisementService.getActive(position, deviceType);
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
  @Throttle(TRACKING_THROTTLE)
  @ApiOperation({
    summary:
      "Record ad click (public, beacon-friendly; deduped per IP for 10 s, live ads only)",
  })
  @ApiParam({ name: "id", description: "Ad ID" })
  @ApiResponse({ status: 204, description: "Accepted (counted or ignored)" })
  async recordClick(@Param("id") id: string, @Req() req: Request) {
    await this.tracking.recordClick(id, resolveClientIp(req) ?? "unknown");
  }

  @Post(":id/impression")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(TRACKING_THROTTLE)
  @ApiOperation({
    summary:
      "Record ad impression (public, beacon-friendly; deduped per IP for 30 min, live ads only)",
  })
  @ApiParam({ name: "id", description: "Ad ID" })
  @ApiResponse({ status: 204, description: "Accepted (counted or ignored)" })
  async recordImpression(@Param("id") id: string, @Req() req: Request) {
    await this.tracking.recordImpression(
      id,
      resolveClientIp(req) ?? "unknown",
    );
  }
}
