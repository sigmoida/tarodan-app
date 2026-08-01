import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/decorators/public.decorator";
import { PayoutService } from "./payout.service";
import { PaytrTransferCallbackDto } from "./dto/paytr-transfer-callback.dto";

/**
 * PayTR platform transfer SONUCU bildirimi (2. aşama).
 *
 * PayTR panelindeki "Platform Transfer Sonucu Bildirim URL" alanına
 * `https://<api-host>/api/payouts/callback/paytr-transfer` yazılır. PayTR,
 * tamamlanan transferlerin trans_id listesini POST'lar; düz "OK" yanıtı
 * görmedikçe bildirimi tekrarlar (ödeme callback'iyle aynı protokol).
 */
@ApiTags("Payouts")
@Controller("payouts")
export class PayoutCallbackController {
  private readonly logger = new Logger(PayoutCallbackController.name);

  constructor(private readonly payoutService: PayoutService) {}

  @Post("callback/paytr-transfer")
  @Public()
  // Ödeme callback'iyle aynı cömert webhook limiti (#71): sahte bildirim
  // selini keser, PayTR'nin meşru tekrarlarını düşürmez.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "PayTR platform transfer result callback (webhook)",
  })
  async paytrTransferCallback(
    @Body() dto: PaytrTransferCallbackDto,
  ): Promise<string> {
    this.logger.log("PayTR transfer result callback received");
    return this.payoutService.handleTransferResultCallback(
      dto?.trans_ids,
      dto?.hash,
    );
  }
}
