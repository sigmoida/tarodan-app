import { STATUS_TONE, type TableBadgeVariant } from "@/lib/status-tone";

/** Zamanlanabilir bir kaydın (reklam, hero slaytı) yayın durumu. */
export type LiveStatus = "scheduled" | "live" | "expired" | "inactive";

/** Rozet varyantları — tablo genelindeki tek renk kuralından (`STATUS_TONE`). */
export const LIVE_STATUS_VARIANT: Record<LiveStatus, TableBadgeVariant> = {
  scheduled: STATUS_TONE.pending,
  live: STATUS_TONE.live,
  expired: STATUS_TONE.ended,
  inactive: STATUS_TONE.inactive,
};

export interface Schedulable {
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}

/** Öncelik: kapalı > süresi doldu > planlandı > yayında. */
export function scheduleLiveStatus(item: Schedulable, now: Date): LiveStatus {
  if (!item.isActive) return "inactive";
  const t = now.getTime();
  if (item.endDate && new Date(item.endDate).getTime() < t) return "expired";
  if (item.startDate && new Date(item.startDate).getTime() > t)
    return "scheduled";
  return "live";
}
