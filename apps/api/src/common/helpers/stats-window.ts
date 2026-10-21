/**
 * A half-open time window `[since, until)` for batch aggregates. Batch jobs
 * anchor `until` to one instant taken at job start, so every query of a run
 * sees the same window and a re-run over unchanged data is idempotent.
 */
export interface StatsWindow {
  since: Date;
  until: Date;
}

/** The window of `days` days that ends at `until`. */
export function statsWindowEndingAt(until: Date, days: number): StatsWindow {
  return { since: new Date(until.getTime() - days * 86_400_000), until };
}
