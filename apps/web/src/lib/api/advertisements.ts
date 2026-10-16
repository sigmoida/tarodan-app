/** @format */

import type {
  AdHotspotInput,
  AdPopupFrequency,
  ClientPlatform,
  ContentPlatform,
} from "@tarodan/types";
import { sendTrackingBeacon } from "./beacon";
import { api, GATEWAY_BASE } from "./client";

/**
 * Banner (afiş) alanı. Admin panelinden tanımlanır; bir kampanyaya bağlıysa
 * şerit metnini kampanyadan okur ve kampanya bitince yayından kendiliğinden
 * düşer (API filtreler).
 *
 * Konumlar: topbar (her sayfada üst şerit), header (başlık altı büyük afiş),
 * footer (alt bilgi üstü afiş), inline (ürün ızgarası içi), popup (modal).
 */
export type AdPosition = "topbar" | "header" | "footer" | "inline" | "popup";

/**
 * Görsel afişin tıklanabilir bölgesi. Koordinatlar görselin 0–1 oranlarıdır
 * (sol-üst köşe + en/boy); bölgeler çakışmaz ve `sortOrder` ile sıralıdır.
 */
export interface AdHotspot extends AdHotspotInput {
  id: string;
  sortOrder: number;
}

export interface Advertisement {
  id: string;
  title: string;
  imageUrl: string | null;
  /** Yalnız görselsiz (metin) afişte dolu; görselli afişte tıklama `hotspots`tan. */
  linkUrl: string | null;
  /** Eski API yanıtlarında yoksa `[]` say (bkz. `useActiveAds`). */
  hotspots: AdHotspot[];
  content: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  position: AdPosition;
  /** Hedef istemci; web yalnız `web` ve `all` olanları alır (API süzer). */
  platform: ContentPlatform;
  /**
   * Yalnız popup'ta: `until_dismissed` kapatılınca o sürüm bir daha açılmaz,
   * `every_visit` ana sayfaya her girişte açılır (bkz. `lib/ads/popupFrequency`).
   * Eski API yanıtında yoksa `until_dismissed` say (bkz. `useActiveAds`).
   */
  popupFrequency: AdPopupFrequency;
  /** Admin her güncellediğinde artar; kapatma kaydı bu sürüme bağlıdır. */
  popupVersion: number;
  /** Duyurulan kampanya — varsa şerit kodu ve adıyla gösterilir. */
  campaign: {
    id: string;
    name: string;
    code: string | null;
    target: string;
    /** Flash kampanya: şeritte geri sayım gösterilir. */
    isFlashSale?: boolean;
    endsAt?: string;
  } | null;
}

/** API'deki reklam denetleyicisinin kökü (`@Controller('ads')`). */
const ADS_BASE = "/ads";

/** Bu istemcinin `?platform=` değeri: site. */
export const AD_CLIENT_PLATFORM: ClientPlatform = "web";

export type AdEvent = "impression" | "click";

/**
 * Sayaç ucunun tarayıcıdaki adresi — vekil kökü yalnız burada bilinir.
 * `hotspotId` yalnız görsel afişte tıklanan bölgeyi belirtir.
 */
export function adEventUrl(
  id: string,
  event: AdEvent,
  hotspotId?: string,
): string {
  const base = `${GATEWAY_BASE}${ADS_BASE}/${encodeURIComponent(id)}/${event}`;
  return hotspotId ? `${base}?hotspot=${encodeURIComponent(hotspotId)}` : base;
}

/** Sayaç gönderimi — beacon/keepalive ayrıntısı `beacon.ts`te. */
export function trackAdEvent(
  id: string,
  event: AdEvent,
  hotspotId?: string,
): void {
  sendTrackingBeacon(adEventUrl(id, event, hotspotId));
}

export const advertisementsApi = {
  /**
   * Yuvanın yayındaki afişi (API yuva başına en fazla bir döner). `device`
   * geçiş dönemi içindir (bkz. `useDeviceType`): yeni API yok sayar, eski API
   * onunla süzer.
   */
  getActive: (params?: { position?: AdPosition; device?: string }) =>
    api.get(`${ADS_BASE}/active`, {
      params: {
        position: params?.position,
        platform: AD_CLIENT_PLATFORM,
        device: params?.device,
      },
    }),
};
