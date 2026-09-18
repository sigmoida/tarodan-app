import type { MessageKey } from "@tarodan/i18n";

/**
 * How long the oldest item in a queue has been waiting.
 *
 * A count alone does not say whether a queue is healthy: three refunds filed an
 * hour ago and three filed in March are the same number and a completely
 * different problem. The age is what separates them.
 */
export interface QueueAge {
  unitKey: MessageKey;
  count: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `null` when nothing is waiting — the caller then prints no age at all. */
export function queueAge(
  oldestAt: string | null | undefined,
  now: Date = new Date(),
): QueueAge | null {
  if (!oldestAt) return null;

  const elapsed = now.getTime() - new Date(oldestAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;

  if (elapsed >= DAY) {
    return {
      unitKey: "admin.dashboard.age.days",
      count: Math.floor(elapsed / DAY),
    };
  }
  if (elapsed >= HOUR) {
    return {
      unitKey: "admin.dashboard.age.hours",
      count: Math.floor(elapsed / HOUR),
    };
  }
  // Under a minute still reads as "1 dk": "0 dk bekliyor" says nothing.
  return {
    unitKey: "admin.dashboard.age.minutes",
    count: Math.max(1, Math.floor(elapsed / MINUTE)),
  };
}
