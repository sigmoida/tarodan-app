import { Module } from "@nestjs/common";
import { ConsentController } from "./consent.controller";
import { ConsentService } from "./consent.service";
import { DistanceSalesConsentService } from "./distance-sales-consent.service";

/**
 * Hukuki onay kayıtları. Yaprak modül: yalnız global Prisma'ya bağlıdır;
 * auth (kayıt), order (checkout), payment (ödeme kapısı), user + marketing
 * (pazarlama izni) ve admin (okuma) onu döngüsüz import eder.
 */
@Module({
  controllers: [ConsentController],
  providers: [ConsentService, DistanceSalesConsentService],
  exports: [ConsentService, DistanceSalesConsentService],
})
export class ConsentModule {}
