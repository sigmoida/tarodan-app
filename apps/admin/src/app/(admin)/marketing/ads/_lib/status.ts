import { clientPlatformsOf } from "@tarodan/types";
import {
  LIVE_STATUS_VARIANT,
  scheduleLiveStatus,
  type LiveStatus,
} from "@/lib/live-status";
import { STATUS_TONE, type TableBadgeVariant } from "@/lib/status-tone";
import type { Ad } from "./types";

/**
 * `shadowed`: yayında ama vitrinde görünmüyor — aynı yuvada (pozisyon +
 * platform) önce gelen başka bir reklam yayında (API `shadowedOn`).
 */
export type AdLiveStatus = LiveStatus | "campaignEnded" | "shadowed";

/** Rozet varyantları — tablo genelindeki tek renk kuralından (`STATUS_TONE`). */
export const AD_STATUS_VARIANT: Record<AdLiveStatus, TableBadgeVariant> = {
  ...LIVE_STATUS_VARIANT,
  campaignEnded: STATUS_TONE.ended,
  shadowed: STATUS_TONE.ended,
};

/**
 * Reklamın şu an gerçekten yayında olup olmadığı. Öncelik: kapalı > kampanya
 * bitti > süresi doldu > planlandı > yayında. Kampanya bağlı reklam kampanyayla
 * birlikte biter (kampanya kapalıysa ya da bitiş tarihi geçtiyse). Yayında
 * olup aynı yuvada başka reklam yüzünden görünmeyen reklam `shadowed`.
 */
export function adLiveStatus(
  ad: Pick<
    Ad,
    "isActive" | "startDate" | "endDate" | "discount" | "shadowedOn"
  >,
  now: Date,
): AdLiveStatus {
  if (!ad.isActive) return "inactive";
  if (ad.discount) {
    const campaignEnd = new Date(ad.discount.endDate).getTime();
    if (!ad.discount.isActive || campaignEnd < now.getTime())
      return "campaignEnded";
  }
  const schedule = scheduleLiveStatus(ad, now);
  return schedule === "live" && ad.shadowedOn?.length ? "shadowed" : schedule;
}

/**
 * Gölgenin kapsamı (rozet metni): reklam hedeflediği her istemcide gizliyse
 * `all`, yalnız birinde gizliyse o istemci (`web` / `app`).
 */
export function adShadowScope(
  ad: Pick<Ad, "platform" | "shadowedOn">,
): "all" | "web" | "app" {
  const hidden = ad.shadowedOn ?? [];
  const targets = clientPlatformsOf(ad.platform);
  if (hidden.length === 0 || targets.every((p) => hidden.includes(p)))
    return "all";
  return hidden[0];
}
