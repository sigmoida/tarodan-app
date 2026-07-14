import IntlMessageFormat, {
  type FormatXMLElementFn,
  type PrimitiveType,
} from "intl-messageformat";

import { defaultLocale, type Locale } from "./locale";

export type MessageValue = PrimitiveType | FormatXMLElementFn<string, string>;
export type MessageValues = Readonly<Record<string, MessageValue>>;

/** Format an ICU MessageFormat string without coupling consumers to a UI runtime. */
export function formatMessage(
  message: string,
  values?: MessageValues,
  locale: Locale = defaultLocale,
): string {
  const formatted = new IntlMessageFormat(message, locale).format(values);

  return Array.isArray(formatted) ? formatted.join("") : String(formatted);
}

/**
 * Compatibility name for call sites that currently describe `{value}` replacement
 * as interpolation. The input is still parsed as ICU MessageFormat.
 */
export function interpolate(
  message: string,
  values?: MessageValues,
  locale: Locale = defaultLocale,
): string {
  return formatMessage(message, values, locale);
}
