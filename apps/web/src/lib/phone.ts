/**
 * Phone utilities — re-exported from the shared `@tarodan/ui` single source.
 * Kept as `@/lib/phone` so existing importers don't churn; the country-code list,
 * formatters and the `PhoneInput` / `FormPhone` components all live in the package.
 */
export {
  countryCodes,
  DEFAULT_COUNTRY_CODE,
  formatPhoneNumber,
  getFullPhoneNumber,
  hasCountryCodePrefix,
  normalizePhoneForPayload,
  getPhoneMaxLength,
  getPhonePlaceholder,
  splitPhone,
  combinePhone,
  type CountryCode,
} from "@tarodan/ui";
