/**
 * The pure arithmetic of a listing's boost timeline (no I/O), used by
 * `BoostTimelineService`.
 *
 * A listing has two queues ("lanes") of running boosts:
 *
 * - **search**: every running boost. Stacking appends a new boost behind the
 *   others, so the boosts lie end to end in `endsAt` order and the listing is
 *   boosted until the last end.
 * - **showcase**: only showcase ("Vitrin") boosts, end to end in their own
 *   `showcaseEndsAt` order. A showcase boost stacked behind a search-only one
 *   is in the showcase at once, for its own days.
 *
 * A boost's own remaining time in a lane is its end minus the later of now and
 * the end of the boost before it. Every change (pause, resume, extend, cancel)
 * takes the boosts' own times, changes the queue and lays it end to end again
 * from now. Reading a stacked boost's remaining time as "end minus now" counted
 * the earlier boosts' time again: 12 paid days could become 17.
 */

/** A running boost in one lane. */
export interface LaneBoost {
  id: string;
  /** End of the boost's stretch in this lane. */
  endsAt: Date;
  /**
   * The most time the boost can own: its bought and extended days. It caps
   * the derived own time, so rows written before the queue was kept end to
   * end (a gap or an overlap) can never yield more than was paid for.
   */
  capMs: number;
  /** Tie break for equal ends: the earlier activation runs first. */
  purchasedAt: Date | null;
}

/** A boost and its own remaining time, in queue order. */
export interface LaneEntry {
  id: string;
  ownMs: number;
}

/** One day in milliseconds (boost durations are whole days). */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Bought plus extended days, in milliseconds. */
export function boostCapMs(row: {
  durationDays: number;
  extendedDays: number;
}): number {
  return Math.max(0, row.durationDays + row.extendedDays) * DAY_MS;
}

function laneOrder(a: LaneBoost, b: LaneBoost): number {
  return (
    a.endsAt.getTime() - b.endsAt.getTime() ||
    (a.purchasedAt?.getTime() ?? 0) - (b.purchasedAt?.getTime() ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * The lane's boosts that still run at `now`, in queue order, each with its own
 * remaining time (end minus the later of now and the previous end, at most
 * its cap). Boosts whose end has passed are not in the queue.
 */
export function laneEntries(boosts: LaneBoost[], now: Date): LaneEntry[] {
  const running = boosts
    .filter((b) => b.endsAt.getTime() > now.getTime())
    .sort(laneOrder);
  let previousEnd = now.getTime();
  return running.map((boost) => {
    const end = boost.endsAt.getTime();
    const ownMs = Math.min(Math.max(0, end - previousEnd), boost.capMs);
    previousEnd = Math.max(previousEnd, end);
    return { id: boost.id, ownMs };
  });
}

/**
 * Lays the entries end to end from `now`, in the given order.
 * @returns each boost's new end and the lane's end (null when empty).
 */
export function layLane(
  entries: LaneEntry[],
  now: Date,
): { ends: Map<string, Date>; tail: Date | null } {
  const ends = new Map<string, Date>();
  let cursor = now.getTime();
  for (const entry of entries) {
    cursor += Math.max(0, entry.ownMs);
    ends.set(entry.id, new Date(cursor));
  }
  return { ends, tail: entries.length > 0 ? new Date(cursor) : null };
}

/**
 * The end of a boost's own showcase stretch, or null for a search-only boost.
 * A row written before `showcaseEndsAt` existed reads the listing's showcase
 * end (`homeShowcaseUntil`), which is what the listing shows today. Never past
 * the boost's own end: a boost that no longer runs is in no showcase.
 */
export function boostShowcaseEnd(
  row: {
    showcaseOnHome: boolean;
    showcaseEndsAt: Date | null;
    endsAt: Date | null;
  },
  listingShowcaseUntil: Date | null,
): Date | null {
  if (!row.showcaseOnHome || !row.endsAt) return null;
  const end = row.showcaseEndsAt ?? listingShowcaseUntil ?? row.endsAt;
  return end < row.endsAt ? end : row.endsAt;
}

/** Whole seconds for a paused remainder (rounded up, as the pause always did). */
export function ceilSeconds(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 1000);
}
