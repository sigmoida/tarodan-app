/** @format */

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

export interface Advertisement {
  id: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  content: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  position: AdPosition;
  deviceType: "desktop" | "mobile" | "all";
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

export type AdEvent = "impression" | "click";

/** Sayaç ucunun tarayıcıdaki adresi — vekil kökü yalnız burada bilinir. */
export function adEventUrl(id: string, event: AdEvent): string {
  return `${GATEWAY_BASE}${ADS_BASE}/${encodeURIComponent(id)}/${event}`;
}

/**
 * Sayaç gönderimi: sayfadan ayrılırken de (dış bağlantı tıklaması) kesilmez.
 * `sendBeacon` yoksa/reddederse `keepalive` fetch'e düşer. Hata yutulur —
 * ölçüm, ziyaretçi akışını asla bozmamalı.
 */
export function trackAdEvent(id: string, event: AdEvent): void {
  if (typeof window === "undefined") return;
  const url = adEventUrl(id, event);
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(url)
    ) {
      return;
    }
  } catch {
    // beacon kullanılamadı → fetch yedeği
  }
  void fetch(url, {
    method: "POST",
    keepalive: true,
    credentials: "include",
  }).catch(() => undefined);
}

export const advertisementsApi = {
  getActive: (params?: { position?: AdPosition; deviceType?: string }) =>
    api.get(`${ADS_BASE}/active`, {
      // API sorgu adı `device`; istemci tarafındaki ad değişmesin.
      params: { position: params?.position, device: params?.deviceType },
    }),
};
