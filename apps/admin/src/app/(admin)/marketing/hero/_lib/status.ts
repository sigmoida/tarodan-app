import type { ContentPlatform, HeroHomeVisibilityDto } from "@tarodan/types";
import {
  LIVE_STATUS_VARIANT,
  scheduleLiveStatus,
  type LiveStatus,
} from "@/lib/live-status";
import type { HeroSlide } from "./types";
import { heroSwitchHiddenOn } from "./visibility";

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

export interface HeroRowStatus {
  status: LiveStatus;
  /**
   * Yayında ama platform anahtarı kapalı olduğu için görünmediği yer
   * (`web`, `app`, ikisi → `all`); yoksa `null`. Yalnız ana sayfa sekmesinde.
   */
  hiddenOn: ContentPlatform | null;
  variant: "outline" | "success" | "warning";
}

/**
 * Tablodaki "Yayın durumu" rozeti. `heroLiveStatus` anlamı aynen korunur;
 * ana sayfa sekmesinde (`visibility` verilince) yayındaki slaytın platform
 * anahtarı kapalıysa "Yayında · web gizli" gibi uyarı tonuna döner — yeşil
 * "Yayında" sitede/uygulamada göründüğünü sanmaya yol açıyordu.
 */
export function heroRowStatus(
  s: Pick<
    HeroSlide,
    "isLive" | "isActive" | "startDate" | "endDate" | "platform" | "hideOnIos"
  >,
  now: Date,
  visibility?: HeroHomeVisibilityDto,
): HeroRowStatus {
  const status = heroLiveStatus(s, now);
  const hidden =
    status === "live" && visibility ? heroSwitchHiddenOn(s, visibility) : [];
  const hiddenOn: ContentPlatform | null =
    hidden.length === 0 ? null : hidden.length > 1 ? "all" : hidden[0];
  return {
    status,
    hiddenOn,
    variant: hiddenOn ? "warning" : LIVE_STATUS_VARIANT[status],
  };
}
