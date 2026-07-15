/** @format */

import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/**
 * next-intl request config, "without i18n routing" mode: the locale is resolved
 * from the `NEXT_LOCALE` cookie (no locale prefix in the URL), defaulting to
 * `tr` — the same visible default as the legacy `LanguageProvider`. Messages
 * come from the shared `@tarodan/i18n` catalog.
 *
 * The locale switcher starts writing this cookie when call sites migrate (#213);
 * server-rendered translations + SEO (`hreflang`, path strategy) are #214. For
 * now this runs in parallel with the legacy client context (behaviour parity).
 */
export default getRequestConfig(async () => {
  const cookieLocale = cookies().get("NEXT_LOCALE")?.value;
  const locale = resolveLocale(cookieLocale);
  return { locale, messages: getMessages(locale) };
});
