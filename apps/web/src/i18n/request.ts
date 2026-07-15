/** @format */

import { getRequestConfig } from "next-intl/server";
import { getMessages, resolveLocale } from "@tarodan/i18n";
import { routing } from "./routing";

/**
 * next-intl request config, "with i18n routing" mode (#214): the locale is the
 * `[locale]` URL segment, surfaced here as `requestLocale` (the middleware
 * resolves it from the path — `/en/...` → `en`, prefix-free → `tr`). We narrow
 * it through the shared `resolveLocale` so an unknown/absent value falls back to
 * the default `tr` instead of throwing. Messages come from the shared
 * `@tarodan/i18n` catalog.
 *
 * Replaces the #212 cookie/no-routing setup: server components now render in the
 * correct language on first paint (SSR/SSG), which is what unlocks `hreflang`,
 * `<html lang>` and static generation for SEO routes.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = resolveLocale(requested ?? routing.defaultLocale);
  return { locale, messages: getMessages(locale) };
});
