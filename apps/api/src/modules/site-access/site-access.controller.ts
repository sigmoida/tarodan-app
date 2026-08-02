import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { SiteAccessPinService } from "./site-access-pin.service";
import { VerifySiteAccessDto } from "./dto/verify-site-access.dto";

@ApiTags("site-access")
@Controller("site-access")
export class SiteAccessController {
  constructor(private readonly pinService: SiteAccessPinService) {}

  // 30/min backstop: legitimate traffic arrives via the web server's egress
  // IP, so the primary per-visitor brake is the web app's own unlock limiter.
  @Post("verify")
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify an early-access invite code (site lock)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Code accepted" })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: "Code rejected",
  })
  async verify(@Body() dto: VerifySiteAccessDto) {
    const ok = await this.pinService.verifyAndConsume(dto.code);
    if (!ok) {
      throw new UnauthorizedException("Geçersiz erişim kodu");
    }
    return { ok: true };
  }
}
