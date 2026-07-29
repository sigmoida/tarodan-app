/**
 * The single source of truth for supported locales across web, admin, mobile
 * and api. Every consumer imports these constants instead of re-declaring its
 * own `'tr' | 'en'` union (which is how the three hand-rolled i18n systems
 * drifted apart).
 */

/** Supported locales, in display order. Add a new locale here + its catalog. */
export const locales = ["tr", "en"] as const;

export type Locale = (typeof locales)[number];

/** Default locale used when none is resolved and as the fallback for lookups. */
export const defaultLocale: Locale = "tr";

/** Narrow an unknown value (header, storage, query param) to a `Locale`. */
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (locales as readonly string[]).includes(value)
  );
}

/** Resolve an arbitrary input to a supported `Locale`, falling back to default. */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}
