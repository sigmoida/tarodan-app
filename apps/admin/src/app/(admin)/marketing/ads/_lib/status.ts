import type { Ad } from "./types";

export type AdLiveStatus =
  | "scheduled"
  | "live"
  | "expired"
  | "inactive"
  | "campaignEnded";

/** Rozet varyantları (yalnız Badge'in mevcut beş varyantı). */
export const AD_STATUS_VARIANT: Record<
  AdLiveStatus,
  "outline" | "success" | "warning"
> = {
  scheduled: "outline",
  live: "success",
  expired: "warning",
  inactive: "outline",
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
  const t = now.getTime();
  if (ad.discount) {
    const campaignEnd = new Date(ad.discount.endDate).getTime();
    if (!ad.discount.isActive || campaignEnd < t) return "campaignEnded";
  }
  if (ad.endDate && new Date(ad.endDate).getTime() < t) return "expired";
  if (ad.startDate && new Date(ad.startDate).getTime() > t) return "scheduled";
  return "live";
}
