import type { OutboxService } from "../../outbox/outbox.service";
import type { SentryService } from "../../sentry/sentry.service";
import { BoostActivationService } from "./boost-activation.service";
import { BoostStaffTimelineService } from "./boost-staff-timeline.service";
import { BoostSystemPauseService } from "./boost-system-pause.service";
import { BoostTimelineStore } from "./boost-timeline-store.service";
import { BoostTimelineService } from "./boost-timeline.service";

/**
 * For specs: the real timeline facade over its real slices, wired the way
 * `BoostTimelineModule` wires them. Sentry and the outbox are optional, as in
 * the module.
 */
export function newBoostTimeline(
  deps: {
    sentry?: Partial<SentryService>;
    outbox?: Partial<OutboxService>;
  } = {},
): { timeline: BoostTimelineService; store: BoostTimelineStore } {
  const store = new BoostTimelineStore(
    deps.sentry as SentryService | undefined,
    deps.outbox as OutboxService | undefined,
  );
  const timeline = new BoostTimelineService(
    store,
    new BoostActivationService(store),
    new BoostStaffTimelineService(store),
    new BoostSystemPauseService(store),
  );
  return { timeline, store };
}
