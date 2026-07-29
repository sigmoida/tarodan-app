import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { AppConfigService, AppConfigResponse } from "./app-config.service";
import { AppConfigQueryDto } from "./dto/app-config-query.dto";

@ApiTags("App Config")
@Controller("app-config")
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  /**
   * Public mobile bootstrap config — advertises the minimum supported app
   * version per platform so old clients can be force-updated (#232). Operators
   * tune the values via `PATCH /admin/settings/:key` without an app rebuild.
   *
   * Pass `?platform=ios&appVersion=1.2.0` to also get server-computed
   * `updateRequired` / `updateAvailable` booleans; omit them to read the raw
   * thresholds and compare on-device.
   */
  @Get()
  @Public()
  @ApiOperation({
    summary: "Mobil istemci sürüm / force-update konfigürasyonu",
  })
  @ApiResponse({
    status: 200,
    description:
      "Min desteklenen sürüm (+ opsiyonel updateRequired/updateAvailable)",
  })
  async getAppConfig(
    @Query() query: AppConfigQueryDto,
  ): Promise<AppConfigResponse> {
    return this.appConfigService.getAppConfig(query.platform, query.appVersion);
  }
}
