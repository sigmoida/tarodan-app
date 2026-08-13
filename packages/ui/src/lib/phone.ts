/**
 * Phone helpers for the shared `PhoneInput` / `FormPhone` controls.
 *
 * Turkey-only by design — see `@tarodan/types`'s `phone.ts` for why. The dial
 * code is fixed at `+90`, so these helpers take only the national part and there
 * is no country-code parameter to get the wrong way round.
 */

import {
  TR_DIAL_CODE,
  TR_MOBILE_NATIONAL,
  TR_PHONE_E164,
} from "@tarodan/types";

export { TR_DIAL_CODE, TR_PHONE_E164, TR_MOBILE_NATIONAL };

/** Visible mask width: "5XX XXX XX XX". */
export const TR_PHONE_MASK_LENGTH = 13;

/** Placeholder for the national part. */
export const TR_PHONE_PLACEHOLDER = "5XX XXX XX XX";

/**
 * Formats the national part as `5XX XXX XX XX`.
 *
 * Anything the user could plausibly paste — `+90 532…`, `0532…`, `90532…` — is
 * reduced to the same 10 digits first. Digits that cannot begin a Turkish mobile
 * number are dropped rather than displayed, so the field can never hold a value
 * the submit step would have to reject.
 */
export function formatPhoneNumber(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("90") && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  // A Turkish mobile always starts with 5; reject the rest as it is typed.
  if (digits && !digits.startsWith("5")) return "";

  const limited = digits.slice(0, 10);
  if (limited.length <= 3) return limited;
  if (limited.length <= 6) return `${limited.slice(0, 3)} ${limited.slice(3)}`;
  if (limited.length <= 8)
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
  return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
}

/**
 * Any accepted spelling of a Turkish mobile → the stored value (`+905XXXXXXXXX`),
 * or `""` when it isn't one.
 *
 * Takes the national part a user typed as well as an already-stored `+90…` value,
 * because saved addresses round-trip through here too. Returning `""` rather than
 * a bare dial code keeps optional fields serializing to empty, and gives callers
 * a single falsy check to gate submission on.
 */
export function combinePhone(value: string | undefined | null): string {
  const digits = formatPhoneNumber(value ?? "").replace(/\D/g, "");
  if (!TR_MOBILE_NATIONAL.test(digits)) return "";
  return `${TR_DIAL_CODE}${digits}`;
}

/**
 * Stored value → the display-formatted national part.
 *
 * `isLegacy` marks a stored number that predates this rule (registration used to
 * accept any string, so foreign numbers exist in the database). Those cannot be
 * rendered in a Turkish mask, so the field opens empty and the caller shows a
 * "please re-enter" notice — the stored value is left alone until the user
 * actually supplies a new one.
 */
export function splitPhone(full: string | undefined | null): {
  national: string;
  isLegacy: boolean;
} {
  const clean = (full ?? "").replace(/\s/g, "");
  if (!clean) return { national: "", isLegacy: false };
  if (!TR_PHONE_E164.test(clean)) return { national: "", isLegacy: true };
  return {
    national: formatPhoneNumber(clean.slice(TR_DIAL_CODE.length)),
    isLegacy: false,
  };
}
