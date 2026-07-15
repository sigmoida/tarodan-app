/** @format */

import { defineRouting } from "next-intl/routing";
import { locales, defaultLocale } from "@tarodan/i18n";

/**
 * The web app's i18n routing contract (#214, "locale in the URL" — Option B).
 *
 * The storefront is a public, SEO-sensitive site, so the locale lives in the
 * path rather than a cookie: the default `tr` renders WITHOUT a prefix
 * (`/products/123`) and English is served under `/en` (`/en/products/123`).
 * That `as-needed` strategy keeps the canonical Turkish URLs prefix-free (no
 * mass redirect of existing links) while still giving every English page a
 * distinct, crawlable URL for `hreflang`.
 *
 * Locales + default come from the shared `@tarodan/i18n` contract so web,
 * admin, mobile and api can never disagree on what languages exist.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});
