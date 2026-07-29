// Request-locale resolution (#223). Pure helpers so the interceptor, the
// @ReqLocale() decorator, and the exception filter (#224) all resolve the same
// way without a circular dependency on I18nService.

import { type Locale, defaultLocale, isLocale } from "@tarodan/i18n";

/** A user shape carrying an optional language preference (added later). */
interface LocaleAwareUser {
  preferredLanguage?: string | null;
}

/** A request as far as locale resolution cares. */
interface LocaleAwareRequest {
  user?: LocaleAwareUser | null;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Best-effort locale from an `Accept-Language` header, honoring q-values and
 * matching on the primary subtag (`tr-TR` → `tr`). Falls back to the default.
 */
export function parseAcceptLanguage(acceptLanguage?: string): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      const primary = tag.trim().toLowerCase().split("-")[0];
      const quality = q !== undefined ? parseFloat(q) : 1;
      return { tag: primary, q: Number.isNaN(quality) ? 0 : quality };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    if (isLocale(tag)) return tag;
  }
  return defaultLocale;
}

/**
 * Resolve the effective locale for a request, in precedence order:
 *   authenticated user's preferredLanguage → Accept-Language → default ('tr').
 */
export function resolveRequestLocale(req: LocaleAwareRequest): Locale {
  const pref = req?.user?.preferredLanguage;
  if (isLocale(pref)) return pref;

  const header = req?.headers?.["accept-language"];
  return parseAcceptLanguage(Array.isArray(header) ? header[0] : header);
}
