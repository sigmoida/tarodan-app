import { fmtDate } from "@/lib/format";
import type { AdCampaign } from "./types";

/** `/admin/discounts` yanıtı: sayfalı `{ data }` ya da düz dizi. */
export function unwrapCampaigns(raw: unknown): AdCampaign[] {
  if (Array.isArray(raw)) return raw as AdCampaign[];
  const data = (raw as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as AdCampaign[]) : [];
}

/**
 * Reklama bağlanabilecek kampanyalar: aktif ve henüz bitmemiş (yayında ya da
 * yaklaşan). Düzenlenen reklamın hâlihazırda bağlı kampanyası (`currentId`)
 * bitmiş olsa da listede kalır; yoksa seçili değer boş görünür ve kayıtta
 * sessizce silinirdi.
 */
export function selectableCampaigns(
  campaigns: AdCampaign[],
  now: Date,
  currentId?: string | null,
): AdCampaign[] {
  return campaigns.filter(
    (c) =>
      c.id === currentId ||
      (c.isActive && new Date(c.endDate).getTime() >= now.getTime()),
  );
}

/** Seçenek etiketi: `Ad (01.07.2026 – 31.07.2026)`. */
export const campaignLabel = (c: AdCampaign): string =>
  `${c.name} (${fmtDate(c.startDate) ?? "—"} – ${fmtDate(c.endDate) ?? "—"})`;
