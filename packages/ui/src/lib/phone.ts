/**
 * Phone utilities — country-code list + phone formatting helpers. The single
 * source of truth for the shared `PhoneInput` / `FormPhone`; apps re-export from
 * here instead of keeping local copies.
 */

export interface CountryCode {
  code: string;
  country: string;
  name: string;
}

export const countryCodes: CountryCode[] = [
  { code: "+90", country: "TR", name: "Türkiye" },
  { code: "+1", country: "US", name: "ABD/Kanada" },
  { code: "+44", country: "GB", name: "İngiltere" },
  { code: "+49", country: "DE", name: "Almanya" },
  { code: "+33", country: "FR", name: "Fransa" },
  { code: "+39", country: "IT", name: "İtalya" },
  { code: "+34", country: "ES", name: "İspanya" },
  { code: "+31", country: "NL", name: "Hollanda" },
  { code: "+32", country: "BE", name: "Belçika" },
  { code: "+41", country: "CH", name: "İsviçre" },
  { code: "+43", country: "AT", name: "Avusturya" },
  { code: "+46", country: "SE", name: "İsveç" },
  { code: "+47", country: "NO", name: "Norveç" },
  { code: "+45", country: "DK", name: "Danimarka" },
  { code: "+358", country: "FI", name: "Finlandiya" },
  { code: "+7", country: "RU", name: "Rusya" },
  { code: "+971", country: "AE", name: "BAE" },
  { code: "+966", country: "SA", name: "Suudi Arabistan" },
  { code: "+20", country: "EG", name: "Mısır" },
  { code: "+81", country: "JP", name: "Japonya" },
  { code: "+86", country: "CN", name: "Çin" },
  { code: "+82", country: "KR", name: "Güney Kore" },
  { code: "+61", country: "AU", name: "Avustralya" },
  { code: "+64", country: "NZ", name: "Yeni Zelanda" },
];

export const DEFAULT_COUNTRY_CODE = "+90";

/**
 * Formats TR numbers as XXX XXX XX XX; for other countries just strips
 * non-digits. For TR the leading "90" (autofill: +90 5XX…) and "0" (habit:
 * 05XX…) prefixes are normalized away.
 */
export function formatPhoneNumber(
  value: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string {
  let digits = value.replace(/\D/g, "");

  if (countryCode === DEFAULT_COUNTRY_CODE) {
    if (digits.startsWith("90") && digits.length > 10) digits = digits.slice(2);
    if (digits.startsWith("0")) digits = digits.slice(1);
    const limited = digits.slice(0, 10);
    if (limited.length <= 3) return limited;
    if (limited.length <= 6)
      return `${limited.slice(0, 3)} ${limited.slice(3)}`;
    if (limited.length <= 8)
      return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
  }

  return digits;
}

/** Prepends the country code (no double prefix). */
export function getFullPhoneNumber(phone: string, countryCode: string): string {
  const cleanPhone = phone.replace(/\s/g, "");
  if (cleanPhone.startsWith(countryCode)) return cleanPhone;
  return countryCode + cleanPhone;
}

/** Does the phone already carry one of the known country-code prefixes? */
export function hasCountryCodePrefix(phone: string): boolean {
  const clean = phone.replace(/\s/g, "");
  return countryCodes.some((cc) => clean.startsWith(cc.code));
}

/**
 * Normalizes a phone for a payload: strips spaces; returns as-is if it already
 * has a country code, otherwise prefixes the given one.
 */
export function normalizePhoneForPayload(
  phone: string | undefined,
  countryCode: string,
): string {
  const clean = (phone ?? "").replace(/\s/g, "");
  if (!clean) return "";
  return hasCountryCodePrefix(clean)
    ? clean
    : getFullPhoneNumber(clean, countryCode);
}

/**
 * TR → 17, others → 20. TR visible value is at most 13 chars ("5XX XXX XX XX")
 * but maxLength stays loose so an autofilled "+90 5XX XXX XX XX" reaches the
 * formatter without the browser clipping it.
 */
export function getPhoneMaxLength(countryCode: string): number {
  return countryCode === DEFAULT_COUNTRY_CODE ? 17 : 20;
}

/** Typical placeholder for the country code. */
export function getPhonePlaceholder(
  countryCode: string,
  fallback = "Telefon",
): string {
  return countryCode === DEFAULT_COUNTRY_CODE ? "5XX XXX XX XX" : fallback;
}

/**
 * Splits a stored full number ("+905321234567") into its country code and the
 * display-formatted national part. Used by `FormPhone` to hydrate a single
 * combined field back into the two-control `PhoneInput`. Longest dial-code
 * prefix wins; unknown/empty defaults to the TR code with an empty national.
 */
export function splitPhone(full: string | undefined): {
  countryCode: string;
  national: string;
} {
  const clean = (full ?? "").replace(/\s/g, "");
  if (!clean) return { countryCode: DEFAULT_COUNTRY_CODE, national: "" };
  const match = [...countryCodes]
    .sort((a, b) => b.code.length - a.code.length)
    .find((cc) => clean.startsWith(cc.code));
  const countryCode = match?.code ?? DEFAULT_COUNTRY_CODE;
  const rest = match ? clean.slice(countryCode.length) : clean;
  return { countryCode, national: formatPhoneNumber(rest, countryCode) };
}

/**
 * Combines a country code + national input into the normalized stored value
 * ("+90" + digits, no spaces), or "" when the national part has no digits (so
 * optional fields serialize to empty rather than a bare country code).
 */
export function combinePhone(countryCode: string, national: string): string {
  const digits = national.replace(/\D/g, "");
  return digits ? `${countryCode}${digits}` : "";
}
