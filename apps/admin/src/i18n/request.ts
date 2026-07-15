/** @format */

import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/**
 * next-intl request config, "without i18n routing" mode: the admin is a private,
 * non-indexable dashboard, so the locale lives in the `NEXT_LOCALE` cookie (no
 * URL prefix, no SEO/hreflang concern — unlike the storefront's #214 URL
 * routing). It defaults to `tr`, the admin's original hardcoded language.
 * Messages come from the shared `@tarodan/i18n` catalog, the same source web and
 * mobile use, so admin strings can reuse `common.*` primitives and live under
 * the `admin.*` namespace.
 */
export default getRequestConfig(async () => {
  const cookieLocale = cookies().get("NEXT_LOCALE")?.value;
  const locale = resolveLocale(cookieLocale);
  return { locale, messages: getMessages(locale) };
});
