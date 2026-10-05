/**
 * Legal identity (yasal kimlik) — the single source of truth for the rules the
 * API validators, the web/admin zod schemas and the identity gate share.
 *
 * Every member must have a legal first name, last name and Turkish national ID
 * number (TCKN) on file for state reporting. `displayName` is NOT a legal name:
 * it may be a nickname, so it is never used to fill these fields.
 *
 * Lives in `@tarodan/types` (not `@tarodan/shared`) for the same reason as
 * `phone.ts`: the API imports it at runtime, and `@tarodan/types` is the package
 * the API Dockerfile builds and copies into the runner image.
 */

/** The three fields that make a member's legal identity complete. */
export const LEGAL_IDENTITY_FIELDS = [
  "legalFirstName",
  "legalLastName",
  "nationalId",
] as const;
export type LegalIdentityField = (typeof LEGAL_IDENTITY_FIELDS)[number];

/** Catalog keys for the field labels (web gate, profile, admin detail). */
export const LEGAL_IDENTITY_FIELD_I18N_KEYS = {
  legalFirstName: "identity.legalFirstName",
  legalLastName: "identity.legalLastName",
  nationalId: "identity.nationalId",
} as const satisfies Record<LegalIdentityField, string>;

// ─── TCKN ────────────────────────────────────────────────────────────────────

/** A TCKN is always exactly this many digits. */
export const TCKN_LENGTH = 11;

/**
 * Input → comparison/storage form: digits only. Spaces, dashes and dots a user
 * pastes from a document are dropped. Nothing else is rewritten.
 */
export function normalizeTckn(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * The standard TCKN algorithm, applied to the normalized value:
 *   - exactly 11 digits, the first one non-zero;
 *   - d10 = ((d1+d3+d5+d7+d9)·7 − (d2+d4+d6+d8)) mod 10;
 *   - d11 = (d1+…+d10) mod 10.
 *
 * Foreign identity numbers are not special-cased: whatever the standard
 * algorithm accepts (e.g. a "99…" foreigner number) is accepted, and nothing
 * else is.
 */
export function isValidTckn(value: string | null | undefined): boolean {
  const tckn = normalizeTckn(value);
  if (tckn.length !== TCKN_LENGTH || tckn[0] === "0") return false;

  const d = tckn.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  // `%` keeps the sign of the dividend in JS; normalise into 0..9.
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  if (tenth !== d[9]) return false;

  const firstTen = d.slice(0, 10).reduce((sum, digit) => sum + digit, 0);
  return firstTen % 10 === d[10];
}

/**
 * Display form for the owner's own surfaces: only the last two digits show.
 * A TCKN is always 11 digits, so the fixed-width mask reveals nothing about
 * the value's length. `null` when there is no number.
 */
export function maskTckn(value: string | null | undefined): string | null {
  const tckn = normalizeTckn(value);
  if (!tckn) return null;
  return `${"•".repeat(Math.max(0, tckn.length - 2))}${tckn.slice(-2)}`;
}

// ─── Legal name ──────────────────────────────────────────────────────────────

export const LEGAL_NAME_MIN_LENGTH = 2;
export const LEGAL_NAME_MAX_LENGTH = 50;

/**
 * Letters (any script, so Turkish ç ğ ı İ ö ş ü and combining marks are in),
 * with single spaces, hyphens or apostrophes between letter runs — "Ayşe
 * Nur", "Öz-Demir", "D'Angelo". No digits, no other punctuation.
 */
const LEGAL_NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;

/** Trim and collapse inner whitespace; letter case is kept as typed. */
export function normalizeLegalName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function isValidLegalName(value: string | null | undefined): boolean {
  const name = normalizeLegalName(value);
  return (
    name.length >= LEGAL_NAME_MIN_LENGTH &&
    name.length <= LEGAL_NAME_MAX_LENGTH &&
    LEGAL_NAME_PATTERN.test(name)
  );
}

// ─── Completeness ────────────────────────────────────────────────────────────

export type LegalIdentityValues = Record<LegalIdentityField, string | null>;

/** Fields still empty on a member's record, in `LEGAL_IDENTITY_FIELDS` order. */
export function missingLegalIdentityFields(
  values: Partial<Record<LegalIdentityField, string | null | undefined>>,
): LegalIdentityField[] {
  return LEGAL_IDENTITY_FIELDS.filter((field) => !values[field]?.trim());
}

// ─── API contract ────────────────────────────────────────────────────────────

/** `GET /legal-identity/me` (and the body of a successful `POST`). */
export interface LegalIdentityStatus {
  /**
   * `false` for exempt accounts (staff, test lane): they are never asked and
   * `missing` is always empty for them.
   */
  required: boolean;
  /** Fields the member still has to provide; empty = gate closed. */
  missing: LegalIdentityField[];
  /** The member's own legal name, once set (read-only for them). */
  legalFirstName: string | null;
  legalLastName: string | null;
  /** Masked TCKN (`•••••••••12`) once set; the full number is never returned. */
  nationalIdMasked: string | null;
  /**
   * Pre-fill for the TCKN field: the valid TCKN the member already typed on
   * their own bank account. Only present while `nationalId` is missing.
   */
  suggestedNationalId: string | null;
}

/** `POST /legal-identity/me` — only the missing fields are needed. */
export interface SubmitLegalIdentityRequest {
  legalFirstName?: string;
  legalLastName?: string;
  nationalId?: string;
}

/** `PATCH /admin/users/:id/legal-identity` — admin correction, reason required. */
export interface AdminCorrectLegalIdentityRequest {
  legalFirstName?: string;
  legalLastName?: string;
  nationalId?: string;
  reason: string;
}

/** Response of the admin correction: the member's full legal identity. */
export interface AdminLegalIdentity {
  legalFirstName: string | null;
  legalLastName: string | null;
  nationalId: string | null;
}
