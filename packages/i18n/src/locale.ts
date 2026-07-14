export const locales = ["tr", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "tr";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && locales.some((locale) => locale === value)
  );
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) {
    return defaultLocale;
  }

  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return isLocale(language) ? language : defaultLocale;
}
