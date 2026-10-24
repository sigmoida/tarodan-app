/** @format */

import type { BoostMetricCounts, MyBoostRow } from "@tarodan/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The listing page is viewable by the owner only in these states. */
export function isListingViewable(status: string): boolean {
  return status === "active" || status === "sold";
}

/** Whole days and the hours left of them, never negative. */
export function remainingParts(
  until: string | null,
  now: number,
): { days: number; hours: number } | null {
  if (!until) return null;
  const ms = Math.max(new Date(until).getTime() - now, 0);
  if (Number.isNaN(ms)) return null;
  return {
    days: Math.floor(ms / DAY_MS),
    hours: Math.floor((ms % DAY_MS) / HOUR_MS),
  };
}

/** One card of "Aktif": the running and paused boosts of one listing. */
export interface BoostGroup {
  productId: string;
  product: MyBoostRow["product"];
  /** Oldest purchase first. */
  rows: MyBoostRow[];
  paused: boolean;
  /** The reminder is the listing's: on while any row has it. */
  reminderOn: boolean;
  isBest: boolean;
  /** Counters gained since the first boost with a baseline started. */
  gain: BoostMetricCounts | null;
}

const byStart = (a: MyBoostRow, b: MyBoostRow) =>
  (a.startsAt ?? a.createdAt).localeCompare(b.startsAt ?? b.createdAt);

/**
 * Stacked boosts of one listing become one card (the listing's remaining time
 * shows once). Cards keep the order the API gave (newest boost first).
 */
export function groupBoosts(rows: readonly MyBoostRow[]): BoostGroup[] {
  const groups = new Map<string, MyBoostRow[]>();
  for (const row of rows) {
    const list = groups.get(row.productId);
    if (list) list.push(row);
    else groups.set(row.productId, [row]);
  }
  return [...groups.entries()].map(([productId, list]) => {
    const sorted = [...list].sort(byStart);
    return {
      productId,
      product: sorted[0].product,
      rows: sorted,
      paused: sorted.some((r) => r.status === "paused"),
      reminderOn: sorted.some((r) => r.autoRenew),
      isBest: sorted.some((r) => r.isBest),
      gain: sorted.find((r) => r.metrics.gain)?.metrics.gain ?? null,
    };
  });
}

/** A boost queued behind another running one of the listing (starts later). */
export function isStackedBehind(row: MyBoostRow, now: number): boolean {
  return (
    row.status === "active" &&
    !!row.startsAt &&
    new Date(row.startsAt).getTime() > now
  );
}
