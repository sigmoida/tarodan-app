// =============================================================================
// GAP-L03: INTERNATIONALIZATION SERVICE (#223)
//
// This service no longer holds its own translation tables. It renders messages
// from the single shared ICU catalog (`@tarodan/i18n`) that web + admin + mobile
// also consume — killing the old inline TR/EN drift. Everything is ICU
// MessageFormat, so plurals/select work server-side too.
// =============================================================================

import { Injectable } from "@nestjs/common";
import {
  type Locale,
  type MessageKey,
  type MessageValues,
  locales,
  defaultLocale,
  isLocale,
  resolveLocale,
  getMessages,
} from "@tarodan/i18n";
import { parseAcceptLanguage } from "./locale.util";
import { translateMessage, lookupNode } from "./translate";

/** Back-compat alias — the codebase's locale type is the shared `Locale`. */
export type SupportedLanguage = Locale;

@Injectable()
export class I18nService {
  /**
   * Render a catalog message (ICU) for a locale, with `{param}` interpolation.
   * Falls back to the default-locale string, then to the raw key, so a missing
   * or bad entry degrades to visible text instead of throwing in a request path.
   */
  translate(
    key: MessageKey | string,
    lang: Locale = defaultLocale,
    values?: MessageValues,
  ): string {
    return translateMessage(key, lang, values);
  }

  /** Supported locales, in display order. */
  getSupportedLanguages(): Locale[] {
    return [...locales];
  }

  getDefaultLanguage(): Locale {
    return defaultLocale;
  }

  /**
   * The shared catalog for a locale, or a namespace slice
   * (e.g. `getAllTranslations('en', 'auth')`). Served by /i18n/translations.
   */
  getAllTranslations(
    lang: Locale = defaultLocale,
    namespace?: string,
  ): unknown {
    const all = getMessages(resolveLocale(lang)) as Record<string, unknown>;
    return namespace ? (lookupNode(all, namespace) ?? {}) : all;
  }

  /** Best-effort locale from an `Accept-Language` header (q-values honored). */
  parseAcceptLanguage(acceptLanguage?: string): Locale {
    return parseAcceptLanguage(acceptLanguage);
  }

  /** Narrow an arbitrary value (query/header) to a supported locale. */
  validateLanguage(lang?: string): Locale {
    return isLocale(lang) ? lang : defaultLocale;
  }
}
