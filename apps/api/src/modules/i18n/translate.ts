// =============================================================================
// PURE CATALOG RENDERING
//
// `I18nService.translate` used to own the catalog lookup outright, which made
// it unreachable outside Nest's DI graph. Log lines and other non-request paths
// (cron sweeps, outbox workers) need the same rendering without injecting a
// service, so the lookup lives here and the service delegates to it — one
// definition of "how a catalog key becomes text".
// =============================================================================

import {
  type Locale,
  type MessageKey,
  type MessageValues,
  type Messages,
  defaultLocale,
  resolveLocale,
  formatMessage,
  getMessages,
} from "@tarodan/i18n";

/**
 * Render a catalog message (ICU) for a locale. Falls back to the default-locale
 * string, then to the raw key, so a missing or bad entry degrades to visible
 * text instead of throwing in a request path.
 */
export function translateMessage(
  key: MessageKey | string,
  lang: Locale = defaultLocale,
  values?: MessageValues,
): string {
  const locale = resolveLocale(lang);
  const message =
    lookup(getMessages(locale), key) ??
    lookup(getMessages(defaultLocale), key) ??
    key;
  return formatMessage(message, values, locale);
}

function lookup(tree: Messages, key: string): string | undefined {
  const node = lookupNode(tree as Record<string, unknown>, key);
  return typeof node === "string" ? node : undefined;
}

/** Dot-path lookup into the nested catalog (`server.payment.orderNotFound`). */
export function lookupNode(
  tree: Record<string, unknown>,
  path: string,
): unknown {
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
