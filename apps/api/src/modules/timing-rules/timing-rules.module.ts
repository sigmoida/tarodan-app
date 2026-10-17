import { Module } from "@nestjs/common";
import { TimingRulesController } from "./timing-rules.controller";
import { TimingRulesService } from "./timing-rules.service";

/**
 * Süreler ve Kurallar. Yaprak modül: yalnız global Prisma ve Config'e
 * bağlıdır. Süre OKUYAN servisler bu modülü import etmez — saf okuma katmanı
 * `common/timing-rules`tedir; bu modül yalnız admin yazma yüzeyini (admin
 * modülü import eder) ve herkese açık okuma ucunu taşır.
 */
@Module({
  controllers: [TimingRulesController],
  providers: [TimingRulesService],
  exports: [TimingRulesService],
})
export class TimingRulesModule {}
