/**
 * Phone rules — the single source of truth shared by the API validators, the web
 * zod schemas and the `PhoneInput` control in `@tarodan/ui`.
 *
 * Tarodan is Turkey-only: `Address` carries no country, cities come from a closed
 * 81-province list, Sürat is a domestic carrier and PayTR settles in TRY. A phone
 * number that is not a Turkish mobile has no path through checkout, so it is
 * rejected at every entry point rather than accepted and corrupted downstream.
 *
 * This lives in `@tarodan/types` (not `@tarodan/shared`) because the API imports
 * it at runtime: `@tarodan/types` is an API dependency that the Dockerfile both
 * builds and copies into the runner image, whereas `@tarodan/shared` is a
 * devDependency there and would resolve to MODULE_NOT_FOUND at boot.
 */

/** The only dial code the platform accepts. */
export const TR_DIAL_CODE = "+90";

/** Stored and transmitted form: `+90` + a 10-digit mobile number starting with 5. */
export const TR_PHONE_E164 = /^\+905\d{9}$/;

/** The 10 digits a user actually types, before the dial code is prepended. */
export const TR_MOBILE_NATIONAL = /^5\d{9}$/;

/** True when `value` is a stored-form Turkish mobile number. */
export function isValidTrPhone(value: string | null | undefined): boolean {
  return typeof value === "string" && TR_PHONE_E164.test(value);
}
