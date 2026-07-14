/**
 * The unified message catalog (issue #210) — the single source of truth that
 * replaces the drifting web / mobile / api catalogs. Every string is ICU
 * MessageFormat; each consumer feeds these messages to its own library
 * (next-intl / i18next / @formatjs).
 *
 * Namespaces:
 *   - `common.*`            shared primitives
 *   - `<domain>.*` (bare)   storefront UI shared by web + mobile
 *   - `mobile.*`            mobile-only strings
 *   - `refund.*`/`stockout.*` shared storefront domains (promoted from mobile)
 *   - `admin.*`             admin dashboard UI — filled by #217-222
 *   - `server.*`/`email.*`  api-generated messages — filled by #223/#224
 *
 * `tr` and `en` are kept in exact key parity (enforced in CI by #211).
 */
import en from "./en.json";
import tr from "./tr.json";

import type { Locale } from "../locale";

export const messages = { tr, en } as const;

/** The message-tree shape; the typed key union (#211) is derived from this. */
export type Messages = typeof tr;

/** The messages for a locale (used by each consumer's provider setup). */
export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
