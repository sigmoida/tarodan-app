/**
 * @tarodan/i18n — shared internationalization package.
 *
 * Scaffold (issue #209): the supported-locale contract + the ICU MessageFormat
 * primitive. The unified message catalog (#210) and the generated typed keys
 * (#211) land on top of this. Consumers wire their own library (next-intl /
 * i18next / @formatjs) against the catalog exported here.
 */
export { locales, defaultLocale, isLocale, resolveLocale } from "./locale";
export type { Locale } from "./locale";

export { formatMessage } from "./format";
export type { MessageValues } from "./format";

export { messages, getMessages } from "./catalog";
export type { Messages } from "./catalog";
