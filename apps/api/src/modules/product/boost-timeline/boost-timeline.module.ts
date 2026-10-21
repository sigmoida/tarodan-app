import { Module } from "@nestjs/common";
import { BoostTimelineService } from "./boost-timeline.service";
import { BoostTimelineStore } from "./boost-timeline-store.service";
import { BoostActivationService } from "./boost-activation.service";
import { BoostStaffTimelineService } from "./boost-staff-timeline.service";
import { BoostSystemPauseService } from "./boost-system-pause.service";

/**
 * Leaf module of the listing boost timeline (`BoostTimelineService`, a facade
 * over its slices). Payment (activation) and Admin (staff actions) import it
 * directly instead of the whole `ProductModule`, which
 * already imports `PaymentModule`; importing that back would close a cycle.
 * `PrismaModule` is global.
 */
@Module({
  providers: [
    BoostTimelineStore,
    BoostActivationService,
    BoostStaffTimelineService,
    BoostSystemPauseService,
    BoostTimelineService,
  ],
  exports: [BoostTimelineService],
})
export class BoostTimelineModule {}
