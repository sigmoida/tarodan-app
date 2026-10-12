/** Zamanlanabilir bir kaydın (reklam, hero slaytı) yayın durumu. */
export type LiveStatus = "scheduled" | "live" | "expired" | "inactive";

/** Rozet varyantları (yalnız Badge'in mevcut beş varyantı). */
export const LIVE_STATUS_VARIANT: Record<
  LiveStatus,
  "outline" | "success" | "warning"
> = {
  scheduled: "outline",
  live: "success",
  expired: "warning",
  inactive: "outline",
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
