import { LEGAL_IDENTITY_FIELDS, isValidTckn } from "@tarodan/types";

/**
 * Redaction for logs and telemetry on the client apps (web, admin). The rule
 * (tarodan-ops: docs/observability.md) is "ids only": no tokens, passwords,
 * TCKN, IBAN, card data, phone numbers, addresses or e-mail addresses.
 *
 * Two layers, because a value can leak either way:
 *  - by KEY: any field whose normalised name is sensitive is replaced, whatever
 *    its value (`{ phone: "..." }`, `{ addressLine1: "..." }`);
 *  - by SHAPE: strings are searched for values that are recognisable on their
 *    own (a Luhn-valid card number, a TR IBAN, a TR mobile number, an e-mail)
 *    and for sensitive query parameters in URLs (`?token=...`), so a value
 *    embedded in a message or a URL is caught too.
 *
 * The API has its own, older copy in `apps/api/src/common/security/
 * redact-sensitive.ts` (same algorithm, narrower key list); consolidating it
 * onto this module is a hub backlog item.
 */

export const REDACTED = "[REDACTED]";

/** Lower case, alphanumerics only: `Phone_Number`, `phone-number` -> `phonenumber`. */
const normalizeKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Exact (normalised) key names that are always redacted. */
const SENSITIVE_KEYS = new Set<string>([
  // Legal identity (TCKN and legal name) — one source in @tarodan/types.
  ...LEGAL_IDENTITY_FIELDS.map(normalizeKey),
  "tckimlikno",
  "tckn",
  "tcno",
  "identitynumber",
  "taxid",
  "taxnumber",
  "vergino",
  // Bank and card data.
  "iban",
  "card",
  "creditcard",
  "cardnumber",
  "pan",
  "cvv",
  "cvc",
  "cardholdername",
  "ccowner",
  "expiry",
  "expirymonth",
  "expiryyear",
  "pin",
  "otp",
  // Contact data.
  "email",
  "emailaddress",
  "phone",
  "phonenumber",
  "mobilephone",
  "gsm",
  "tel",
  "telephone",
  "address",
  "addressline",
  "addressline1",
  "addressline2",
  "fulladdress",
  "openaddress",
  "street",
  "postalcode",
  "zipcode",
  // Client IP (personal data under KVKK). The proxy headers carry it on every
  // server request, also with `sendDefaultPii: false`; `ipAddress` and
  // `remoteAddress` are caught by the "address" part below.
  "ip",
  "clientip",
  "remoteip",
  "remoteaddr",
  "forwarded",
  "xforwardedfor",
  "xrealip",
  "xclientip",
  "xclusterclientip",
  "cfconnectingip",
  "trueclientip",
  "fastlyclientip",
  // Sign in with Apple / OAuth codes.
  "authorizationcode",
  "apikey",
  "signingkey",
]);

/**
 * Substrings that make any key sensitive, whatever it is combined with:
 * `accessToken`, `x-api-secret`, `set-cookie`, `newPassword`,
 * `suggestedNationalId`, `nationalIdMasked`, `bankIban`, ...
 */
const SENSITIVE_KEY_PARTS = [
  "password",
  "token",
  "secret",
  "cookie",
  "authorization",
  "nationalid",
  "kimlik",
  "tckn",
  "identitynumber",
  "taxid",
  "iban",
  "cardnumber",
  "cvv",
];

/**
 * Contact-data substrings: `shippingAddress`, `guestPhone`, `ipAddress`,
 * `contactEmail`, ... A key that ends in an id (`addressId`, `phoneIds`)
 * names a record, not the value, and stays readable.
 */
const CONTACT_KEY_PARTS = ["address", "phone", "email", "gsm"];
const ID_SUFFIX = /ids?$/;

/** Query parameters that carry credentials even though the name is generic. */
const SENSITIVE_QUERY_KEYS = new Set<string>([
  "key",
  "sig",
  "signature",
  "code",
  "state",
]);

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))) {
    return true;
  }
  return (
    !ID_SUFFIX.test(normalized) &&
    CONTACT_KEY_PARTS.some((part) => normalized.includes(part))
  );
}

export function isSensitiveQueryKey(key: string): boolean {
  return isSensitiveKey(key) || SENSITIVE_QUERY_KEYS.has(normalizeKey(key));
}

function passesLuhn(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

/** TR IBAN: `TR` + 24 digits, optionally grouped by spaces. */
const IBAN_PATTERN = /\bTR\d{2}(?:\s?\d){22}\b/gi;
/** TR mobile: `+90 5xx ...` or `05xx ...`, optionally spaced or dashed. */
const TR_MOBILE_PATTERN =
  /(?:\+90[\s-]?|\b0)5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CARD_CANDIDATE_PATTERN = /\d(?:[ -]?\d){12,18}/g;
/** An 11-digit run on its own; masked only when the TCKN checksum holds. */
const TCKN_CANDIDATE_PATTERN = /(?<!\d)\d{11}(?!\d)/g;

/**
 * Masks sensitive query parameters in a URL, or in any text that embeds one
 * (an error message, a breadcrumb). Works on the raw text, so an invalid URL
 * never throws; the path and the other parameters stay readable.
 */
export function redactUrlQuery(value: string): string {
  return value.replace(
    /([?&])([^=&#\s]+)=([^&#\s]*)/g,
    (match, sep: string, key: string) =>
      isSensitiveQueryKey(key) ? `${sep}${key}=${REDACTED}` : match,
  );
}

/** Removes self-identifying values (TCKN, card, IBAN, phone, e-mail) from free text. */
export function redactString(value: string): string {
  // IBAN first: its 24 digits can contain a Luhn-valid run that the card
  // pass would otherwise cut out of the middle, leaving the rest readable.
  return redactUrlQuery(value)
    .replace(IBAN_PATTERN, REDACTED)
    .replace(CARD_CANDIDATE_PATTERN, (candidate) =>
      passesLuhn(candidate) ? REDACTED : candidate,
    )
    .replace(TR_MOBILE_PATTERN, REDACTED)
    .replace(TCKN_CANDIDATE_PATTERN, (candidate) =>
      isValidTckn(candidate) ? REDACTED : candidate,
    )
    .replace(EMAIL_PATTERN, REDACTED);
}

const MAX_DEPTH = 10;

/**
 * Returns a redacted copy: sensitive keys are replaced at any depth and every
 * string goes through {@link redactString}. Never mutates the input.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactSensitive(nested, depth + 1),
    ]),
  );
}
