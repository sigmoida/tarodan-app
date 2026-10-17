/**
 * FALLBACK copies of platform policy durations — not the source of truth.
 *
 * Every business duration is now an admin-editable Durations & Rules setting
 * (registry: `@tarodan/types` TIMING_RULES; screen: admin System → Durations &
 * Rules). The live values are served by the public endpoint
 * `GET /api/timing-rules` (`PublicTimingPolicy`: value + unit per rule id).
 * Clients should read that endpoint and use these constants ONLY while it is
 * loading or unreachable.
 *
 * The numbers below equal the registry defaults (`returnWindowDays`,
 * `payoutGraceDays`); an api contract spec (timing-rules.registry.spec) fails
 * if they drift. They are NOT updated when an admin changes a value — that is
 * exactly why they must not be shown as authoritative.
 *
 * Trade escrow windows were never mirrored here; show trade dates from the
 * API values stamped on the trade.
 */

/** Fallback: return (cooling-off) window after delivery, in days. */
export const REFUND_COOLING_OFF_DAYS = 14;

/** Fallback: grace after the return window closes, before the seller payout, in days. */
export const PAYOUT_GRACE_DAYS = 1;

/**
 * Fallback: escrow payout to the seller = delivery + the return window + the
 * grace day. The real release date is stamped on the hold at delivery.
 */
export const ESCROW_RELEASE_DAYS = REFUND_COOLING_OFF_DAYS + PAYOUT_GRACE_DAYS;
