/**
 * Admin (platform) cancellation of orders, offer orders and trades.
 *
 * One catalog of reasons shared by the api (validation + audit), the admin
 * panel (the select in the cancel dialog) and the notifications sent to the
 * parties. The CODE is what the buyer and seller are told; the admin's free
 * note is internal and is never shown to them.
 */
export const ADMIN_CANCEL_REASON_CODES = [
  "stock_error",
  "suspicious_activity",
  "user_request",
  "listing_violation",
  "duplicate_transaction",
  "other",
] as const;

export type AdminCancelReasonCode = (typeof ADMIN_CANCEL_REASON_CODES)[number];

export function isAdminCancelReasonCode(
  value: unknown,
): value is AdminCancelReasonCode {
  return (
    typeof value === "string" &&
    (ADMIN_CANCEL_REASON_CODES as readonly string[]).includes(value)
  );
}

/** Catalog key of the label shown to admins and to the affected parties. */
export const ADMIN_CANCEL_REASON_I18N_KEYS = {
  stock_error: "adminCancel.reasons.stock_error",
  suspicious_activity: "adminCancel.reasons.suspicious_activity",
  user_request: "adminCancel.reasons.user_request",
  listing_violation: "adminCancel.reasons.listing_violation",
  duplicate_transaction: "adminCancel.reasons.duplicate_transaction",
  other: "adminCancel.reasons.other",
} as const satisfies Record<AdminCancelReasonCode, string>;

/** Internal note length limit (admin-only, stored in the audit log). */
export const ADMIN_CANCEL_NOTE_MAX = 500;

/** What kind of record an admin cancellation targets. */
export const ADMIN_CANCEL_TARGETS = ["order", "trade"] as const;
export type AdminCancelTarget = (typeof ADMIN_CANCEL_TARGETS)[number];

/** Body of every admin cancel endpoint. */
export interface AdminCancelRequest {
  reasonCode: AdminCancelReasonCode;
  /** Required when `reasonCode` is "other"; optional otherwise. */
  note?: string;
}
