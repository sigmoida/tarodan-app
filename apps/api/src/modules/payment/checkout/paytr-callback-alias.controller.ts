import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { PaymentService } from "../payment.service";
import { Public } from "../../auth/decorators/public.decorator";
import { PayTRCallbackDto } from "../dto";

/**
 * PayTR "Bildirim URL" alias'ı: POST /callback (global /api prefix'i DIŞINDA — main.ts
 * setGlobalPrefix exclude ile). PayTR panelindeki Bildirim URL .../callback ile bittiğinde
 * (tam path düzenlenemediğinde) bu uç devreye girer ve isteği AYNI handler'a
 * (handlePayTRCallback) iletir — kanonik /api/payments/callback/paytr ile birebir aynı
 * mantık; hiçbir doğrulama/işlem atlanmaz. Her iki yol da çalışmaya devam eder.
 */
@ApiExcludeController()
@Controller()
export class PaytrCallbackAliasController {
  private readonly logger = new Logger(PaytrCallbackAliasController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Post("callback")
  @Public()
  // Same generous webhook cap as the canonical callback route (#71).
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async paytrCallbackAlias(@Body() dto: PayTRCallbackDto) {
    this.logger.log(
      `PayTR callback (alias /callback) merchant_oid=${dto?.merchant_oid}`,
    );
    return this.paymentService.handlePayTRCallback(dto);
  }
}
