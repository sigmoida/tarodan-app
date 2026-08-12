/**
 * Client-side mirrors of platform policy constants.
 *
 * SOURCE OF TRUTH is the backend: `apps/api` refund.service `COOLING_OFF_DAYS`
 * (return window) and the payment-hold (escrow) release settings. These mirrors
 * exist so web/admin/mobile don't keep drifting hardcoded copies — update them
 * together with the backend when the policy changes.
 */

/** Return (cooling-off) window after delivery, in days. */
export const REFUND_COOLING_OFF_DAYS = 14;

/**
 * Escrow payout to the seller: delivery + the return window + 1 grace day.
 * Mirrors the backend payment-hold release schedule.
 */
export const ESCROW_RELEASE_DAYS = 15;
