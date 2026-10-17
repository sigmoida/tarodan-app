import { REFERENCE_PREFIX } from "../helpers/code-prefixes";

/**
 * The identifiers a log message can name an entity by. One list, read by both
 * the Sentry grouping fingerprint (which masks them so one kind of failure is
 * one issue) and the repeat-report key (which keeps them so the same failure
 * of a *different* entity is reported again).
 *
 * A message names its entity in one of these forms:
 * - a UUID (every Prisma id);
 * - a transaction reference (`PKG-WQMTZDB5TT`, `ORD-K7X9M2QF3N`, and the
 *   dash-less payout `PYTK7X9M2QF3N`), prefixes from `code-prefixes.ts`;
 * - a GIB invoice number (`TRD2026000000473`: three letters + 13 digits, the
 *   prefix is configurable) or an internal invoice number (`SPR-202607-000001`);
 * - an entity code (`B010001`, `K010042`, `U010001`);
 * - a `key=value` / `key: value` pair whose key ends in `id`, `no`, `ref` or
 *   `code` (`id=...`, `orderId: ...`, `no=...`).
 */
const DASHED_PREFIXES = Object.values(REFERENCE_PREFIX)
  .filter((prefix) => prefix !== REFERENCE_PREFIX.payoutTransfer)
  .join("|");

const IDENTIFIER_SOURCES = [
  "\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b",
  `\\b(?:${DASHED_PREFIXES})-[A-Z0-9]{4,}\\b`,
  // Dash-less payout reference: must contain a digit, or "PYTHON" would match.
  `\\b${REFERENCE_PREFIX.payoutTransfer}(?=[A-Z0-9]*\\d)[A-Z0-9]{6,}\\b`,
  "\\b[A-Z]{3}\\d{13}\\b",
  "\\b[A-Z]{3}-\\d{6}-\\d{6}\\b",
  "\\b[BKU]\\d{6,}\\b",
];

/** A `key=value` pair naming an entity; the value is capture group 1. */
const KEYED_IDENTIFIER =
  /\b[A-Za-z]*(?:[iI][dD]|[nN]o|[rR]ef|[cC]ode)\s*[=:]\s*([A-Za-z0-9][\w-]*)/g;

function identifierPattern(): RegExp {
  return new RegExp(IDENTIFIER_SOURCES.join("|"), "g");
}

/** Replaces every identifier in `message` with `placeholder`. Pure. */
export function maskIdentifiers(message: string, placeholder: string): string {
  return message.replace(identifierPattern(), placeholder);
}

/**
 * The distinct identifiers a message names, sorted, so the same set listed in
 * a different order reads the same.
 */
export function extractIdentifiers(message: string): string[] {
  const found = new Set<string>(message.match(identifierPattern()) ?? []);
  for (const match of message.matchAll(KEYED_IDENTIFIER)) {
    found.add(match[1]);
  }
  return [...found].sort();
}
