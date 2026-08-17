/**
 * Splitting a stored full name into the given/family parts a carrier demands.
 *
 * Addresses store one `fullName` field, because that is what a person writes on
 * a parcel and what every screen renders. Sürat's `GonderiOlustur` requires
 * `Adi` and `Soyadi` separately, and both are mandatory — so the split has to
 * happen somewhere, and doing it in one place keeps every caller producing the
 * same pair for the same input.
 *
 * The rule is the pragmatic one: the last whitespace-separated word is the family
 * name, everything before it is the given name. That is right for Turkish names
 * and wrong for some others, but the alternative — asking every seller to re-enter
 * their name in two boxes — is a migration, not a mapping. A single-word name
 * (common for company sellers trading under one word) repeats that word in both
 * fields, because sending an empty `Soyadi` fails the carrier's validation.
 *
 * Lives in `@tarodan/types` alongside `phone.ts` and `province.ts` for the same
 * reason: the API needs it at runtime.
 */

/** A full name split into the two fields carriers ask for. */
export interface PersonName {
  firstName: string;
  lastName: string;
}

/**
 * Split `fullName` into given and family parts.
 *
 * Returns empty strings for both when there is no name to split, so callers can
 * make one emptiness check instead of guessing which half went missing.
 */
export function splitPersonName(
  fullName: string | null | undefined,
): PersonName {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return { firstName: "", lastName: "" };
  // One word has to serve as both halves — an empty Soyadi is rejected upstream.
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}
