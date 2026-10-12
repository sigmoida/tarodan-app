import { scheduleLiveStatus, type LiveStatus } from "@/lib/live-status";
import type { HeroSlide } from "./types";

/**
 * Yayın durumu: sunucunun `isLive`'ı esas; canlı değilse neden pencereden
 * türetilir (pencere "yayında" dese de sunucu canlı saymıyorsa → planlandı).
 */
export function heroLiveStatus(
  s: Pick<HeroSlide, "isLive" | "isActive" | "startDate" | "endDate">,
  now: Date,
): LiveStatus {
  if (s.isLive) return "live";
  const status = scheduleLiveStatus(s, now);
  return status === "live" ? "scheduled" : status;
}
