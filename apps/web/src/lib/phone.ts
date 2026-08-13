/**
 * Phone utilities — re-exported from the shared `@tarodan/ui` single source.
 * Kept as `@/lib/phone` so existing importers don't churn; the formatters and the
 * `PhoneInput` / `FormPhone` components all live in the package, and the rules
 * themselves in `@tarodan/types`.
 */
export {
  formatPhoneNumber,
  splitPhone,
  combinePhone,
  TR_DIAL_CODE,
  TR_PHONE_E164,
  TR_MOBILE_NATIONAL,
  TR_PHONE_PLACEHOLDER,
} from "@tarodan/ui";
