/**
 * Client-side mirrors of platform policy constants.
 *
 * SOURCE OF TRUTH is the backend: `apps/api` `PAYMENT_CONFIG_KEYS`
 * (RETURN_WINDOW_DAYS / PAYOUT_GRACE_DAYS, env-backed). These mirrors exist so
 * web/admin/mobile don't keep drifting hardcoded copies — every client-side day
 * count comes from THIS module, and it is updated together with the backend
 * defaults when the policy changes.
 *
 * Trade escrow windows are NOT here: they are platform settings the admin can
 * change at runtime (`trade_confirmation_deadline_days`, `payment_hold_days`),
 * so a client-side mirror would be a lie. Show trade dates from API values.
 */

/** Return (cooling-off) window after delivery, in days. */
export const REFUND_COOLING_OFF_DAYS = 14;

/** Grace after the return window closes, before the seller payout, in days. */
export const PAYOUT_GRACE_DAYS = 1;

/**
 * Escrow payout to the seller: delivery + the return window + the grace day.
 * Mirrors the backend payment-hold release schedule.
 */
export const ESCROW_RELEASE_DAYS = REFUND_COOLING_OFF_DAYS + PAYOUT_GRACE_DAYS;
