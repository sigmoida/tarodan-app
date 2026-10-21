import type { BoostActionAccess } from "./access";
import type { BoostPurchase } from "./types";

export interface BoostDetailActions {
  pause: boolean;
  resume: boolean;
  extend: boolean;
  /** "Refund and stop": a paid boost the server still calls refundable. */
  refund: boolean;
  /** "Cancel grant": a free grant that still runs or is paused. */
  revoke: boolean;
}

/**
 * Which actions the boost detail offers. The server owns refundability
 * (`refundableAmount` is 0 for a free grant, an ended or stopped boost, or a
 * payment that is not completed), so the screen never re-derives it.
 */
export function boostDetailActions(
  purchase: Pick<BoostPurchase, "status" | "source" | "refundableAmount">,
  access: BoostActionAccess,
): BoostDetailActions {
  const running = purchase.status === "active" || purchase.status === "paused";
  return {
    pause: access.manage && purchase.status === "active",
    resume: access.manage && purchase.status === "paused",
    extend: access.manage && running,
    refund:
      access.refund &&
      purchase.source === "purchase" &&
      purchase.refundableAmount > 0,
    revoke: access.manage && purchase.source === "admin_grant" && running,
  };
}
