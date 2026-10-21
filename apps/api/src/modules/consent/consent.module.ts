import { Module } from "@nestjs/common";
import { ConsentController } from "./consent.controller";
import { ConsentService } from "./consent.service";
import { DistanceSalesConsentService } from "./distance-sales-consent.service";
import { PlatformServiceConsentService } from "./platform-service-consent.service";

/**
 * Legal consent records. A leaf module: it depends only on the global Prisma,
 * so auth (registration), order (checkout), payment (payment gate), product
 * (boost purchase), user and marketing (marketing consent) and admin (reads)
 * import it without a cycle.
 */
@Module({
  controllers: [ConsentController],
  providers: [
    ConsentService,
    DistanceSalesConsentService,
    PlatformServiceConsentService,
  ],
  exports: [
    ConsentService,
    DistanceSalesConsentService,
    PlatformServiceConsentService,
  ],
})
export class ConsentModule {}
