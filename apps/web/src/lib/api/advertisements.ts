/** @format */

import { api } from "./client";

/**
 * Banner (afiş) alanı. Admin panelinden tanımlanır; bir kampanyaya bağlıysa
 * şerit metnini kampanyadan okur ve kampanya bitince yayından kendiliğinden
 * düşer (API filtreler).
 */
export type AdPosition = "header" | "sidebar" | "footer" | "inline" | "popup";

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

export const advertisementsApi = {
  getActive: (params?: { position?: AdPosition; deviceType?: string }) =>
    api.get(`${ADS_BASE}/active`, {
      // API sorgu adı `device`; istemci tarafındaki ad değişmesin.
      params: { position: params?.position, device: params?.deviceType },
    }),
  /** Görüntülenme ve tıklama sayaçları — reklam performansının tek ölçüsü. */
  recordImpression: (id: string) => api.post(`${ADS_BASE}/${id}/impression`),
  recordClick: (id: string) => api.post(`${ADS_BASE}/${id}/click`),
};
