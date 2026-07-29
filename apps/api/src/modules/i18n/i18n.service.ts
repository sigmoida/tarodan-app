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
  type Messages,
  locales,
  defaultLocale,
  isLocale,
  resolveLocale,
  formatMessage,
  getMessages,
} from "@tarodan/i18n";
import { parseAcceptLanguage } from "./locale.util";

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
    const locale = resolveLocale(lang);
    const message =
      this.lookup(getMessages(locale), key) ??
      this.lookup(getMessages(defaultLocale), key) ??
      key;
    return formatMessage(message, values, locale);
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
    return namespace ? (this.lookupNode(all, namespace) ?? {}) : all;
  }

  /** Best-effort locale from an `Accept-Language` header (q-values honored). */
  parseAcceptLanguage(acceptLanguage?: string): Locale {
    return parseAcceptLanguage(acceptLanguage);
  }

  /** Narrow an arbitrary value (query/header) to a supported locale. */
  validateLanguage(lang?: string): Locale {
    return isLocale(lang) ? lang : defaultLocale;
  }

  // -- internal dot-path lookup into the nested catalog --------------------

  private lookup(tree: Messages, key: string): string | undefined {
    const node = this.lookupNode(tree as Record<string, unknown>, key);
    return typeof node === "string" ? node : undefined;
  }

  private lookupNode(tree: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((node, part) => {
      if (
        node &&
        typeof node === "object" &&
        part in (node as Record<string, unknown>)
      ) {
        return (node as Record<string, unknown>)[part];
      }
      return undefined;
    }, tree);
  }
}
