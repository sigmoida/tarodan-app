import { LIVE_STATUS_VARIANT, scheduleLiveStatus, type LiveStatus } from "@/lib/live-status";
import type { Ad } from "./types";

export type AdLiveStatus = LiveStatus | "campaignEnded";

/** Rozet varyantları (yalnız Badge'in mevcut beş varyantı). */
export const AD_STATUS_VARIANT: Record<
  AdLiveStatus,
  "outline" | "success" | "warning"
> = {
  ...LIVE_STATUS_VARIANT,
  campaignEnded: "warning",
};

/**
 * Reklamın şu an gerçekten yayında olup olmadığı. Öncelik: kapalı > kampanya
 * bitti > süresi doldu > planlandı > yayında. Kampanya bağlı reklam kampanyayla
 * birlikte biter (kampanya kapalıysa ya da bitiş tarihi geçtiyse).
 */
export function adLiveStatus(
  ad: Pick<Ad, "isActive" | "startDate" | "endDate" | "discount">,
  now: Date,
): AdLiveStatus {
  if (!ad.isActive) return "inactive";
  if (ad.discount) {
    const campaignEnd = new Date(ad.discount.endDate).getTime();
    if (!ad.discount.isActive || campaignEnd < now.getTime())
      return "campaignEnded";
  }
  return scheduleLiveStatus(ad, now);
}
