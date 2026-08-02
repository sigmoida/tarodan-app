"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { locales, type Locale } from "@tarodan/i18n";
import { Select } from "@tarodan/ui";

// Endonyms + flags — a language's own name isn't translated, so these stay local
// (mirrors the storefront switcher).
// eslint-disable-next-line @tarodan/no-hardcoded-turkish -- endonyms: each language names itself
const LOCALE_NAMES: Record<Locale, string> = { tr: "Türkçe", en: "English" };
const LOCALE_FLAGS: Record<Locale, string> = { tr: "🇹🇷", en: "🇬🇧" };

/**
 * Sidebar language switcher. The admin has no locale in the URL, so switching is
 * a `NEXT_LOCALE` cookie write + `router.refresh()`: the request config re-reads
 * the cookie and the server re-renders every RSC (and re-hydrates clients) in the
 * new language. Options are the shared `@tarodan/i18n` locales.
 */
export function LocaleSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const change = (next: Locale) => {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <Select
      value={locale}
      onChange={(e) => change(e.target.value as Locale)}
      selectSize="sm"
      aria-label={t("language")}
      className="w-full"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_FLAGS[l]} {LOCALE_NAMES[l]}
        </option>
      ))}
    </Select>
  );
}
