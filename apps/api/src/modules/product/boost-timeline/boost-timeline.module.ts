import { Module } from "@nestjs/common";
import { BoostTimelineService } from "./boost-timeline.service";

/**
 * Leaf module of the listing boost timeline (`BoostTimelineService`). Payment
 * (activation) and Admin (pause, resume, extend) import it directly instead of
 * the whole `ProductModule`, which already imports `PaymentModule`; importing
 * that back would close a cycle. `PrismaModule` is global.
 */
@Module({
  providers: [BoostTimelineService],
  exports: [BoostTimelineService],
})
export class BoostTimelineModule {}
