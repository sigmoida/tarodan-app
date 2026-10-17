import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { PublicTimingPolicy } from "@tarodan/types";
import { Public } from "../auth/decorators/public.decorator";
import { TimingRulesService } from "./timing-rules.service";

/**
 * Ön yüzlerin (web, mobil) gösterdiği politika süreleri — iade penceresi,
 * teklif geçerliliği, ilan ömrü, hazırlık süresi… Değerler admin'in Süreler ve
 * Kurallar ekranından gelir; istemciler sabit kopya tutmak yerine buradan
 * okur. Alarm eşikleri ve ödeme zaman aşımları gibi iç değerler DÖNMEZ
 * (`PUBLIC_TIMING_RULE_IDS`).
 */
@ApiTags("Timing Rules")
@Controller("timing-rules")
export class TimingRulesController {
  constructor(private readonly timingRules: TimingRulesService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: "Herkese açık politika süreleri (değer + birim, kayıt kimliğiyle)",
  })
  @ApiResponse({ status: 200, description: "PublicTimingPolicy" })
  getPublicPolicy(): Promise<PublicTimingPolicy> {
    return this.timingRules.publicPolicy();
  }
}
