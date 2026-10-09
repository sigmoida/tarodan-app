import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../auth/decorators/public.decorator";
import { UatRefreshReportDto } from "../dto/uat-refresh.dto";
import { UatRefreshService } from "./uat-refresh.service";

/** Workflow'un gönderdiği koşuya özel token başlığı. */
export const UAT_REFRESH_TOKEN_HEADER = "x-uat-refresh-token";

/**
 * `staging-refresh-from-prod.yml` → API aşama raporu (makineden makineye).
 *
 * Admin JWT'si yoktur: kimlik, API'nin dispatch sırasında ürettiği ve yalnız
 * SHA-256'sını sakladığı koşuya özel token'dır (`x-uat-refresh-token`). Çerez
 * taşımadığı için CSRF guard'ı devreye girmez. Canlıda uç 404 döner.
 */
@ApiTags("internal")
@Controller("internal/uat-refresh")
export class UatRefreshReportController {
  constructor(private readonly service: UatRefreshService) {}

  @Post(":runId/report")
  @Public()
  // Workflow bir koşuda birkaç kez rapor eder; tahmin denemesini sınırlar.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Staging yenileme workflow'unun aşama raporu" })
  @ApiResponse({ status: 200, description: "Güncellenen koşu" })
  @ApiResponse({ status: 403, description: "Koşu yok ya da token geçersiz" })
  @ApiResponse({ status: 409, description: "Koşu zaten bitmiş" })
  report(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Headers(UAT_REFRESH_TOKEN_HEADER) token: string | undefined,
    @Body() dto: UatRefreshReportDto,
  ) {
    return this.service.report(runId, token, dto);
  }
}
