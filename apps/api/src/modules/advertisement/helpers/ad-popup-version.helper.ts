import type { AdPopupFrequency } from "@prisma/client";
import {
  adHotspotRowData,
  type AdHotspotChange,
  type AdHotspotRowData,
} from "./ad-hotspot.helper";

/**
 * `popupVersion` ne zaman artar? Kapatılmış popup yeni sürümde yeniden açılır;
 * bu yüzden sürüm YALNIZ ziyaretçinin gördüğü şey (kreatif) gerçekten
 * değişince artar. Anahtar, sıra, tarih, platform ya da kampanya bağı
 * değişikliği — tablodaki "aktif/pasif" düğmesi dahil — popup'ı kapatmış
 * herkese yeniden göstermemeli.
 *
 * Kreatif: başlık, görsel, metin, alt metin, bağlantı, tıklanabilir alanlar
 * ve gösterim sıklığı.
 */

/** Saklı reklamın kreatif alanları; `hotspots` `sortOrder` sırasıyla. */
export interface AdCreativeSnapshot {
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  content: string | null;
  altText: string | null;
  popupFrequency: AdPopupFrequency;
  hotspots: readonly Omit<AdHotspotRowData, "sortOrder">[];
}

/**
 * Yama (alan yok = `undefined` = dokunma). `linkUrl` ve `hotspots`,
 * `resolveAdClickTargets`'ın SONUCUDUR — yazılacak olanla karşılaştırılır.
 */
export interface AdCreativePatch {
  title?: string;
  imageUrl?: string | null;
  content?: string | null;
  altText?: string | null;
  popupFrequency?: AdPopupFrequency;
  linkUrl: string | null | undefined;
  hotspots: AdHotspotChange;
}

const SCALAR_FIELDS = [
  "title",
  "imageUrl",
  "linkUrl",
  "content",
  "altText",
  "popupFrequency",
] as const;

function hotspotsChanged(
  stored: AdCreativeSnapshot["hotspots"],
  change: AdHotspotChange,
): boolean {
  if (change.kind === "keep") return false;
  if (change.kind === "clear") return stored.length > 0;
  if (change.hotspots.length !== stored.length) return true;
  return change.hotspots.some((hotspot, index) => {
    const next = adHotspotRowData(hotspot, index);
    const prev = stored[index];
    return (
      next.x !== prev.x ||
      next.y !== prev.y ||
      next.width !== prev.width ||
      next.height !== prev.height ||
      next.label !== prev.label ||
      next.linkUrl !== prev.linkUrl
    );
  });
}

/** Güncelleme kreatifi gerçekten değiştiriyor mu (aynı değeri yazmak değil). */
export function adCreativeChanged(
  stored: AdCreativeSnapshot,
  patch: AdCreativePatch,
): boolean {
  const scalarChanged = SCALAR_FIELDS.some(
    (field) => patch[field] !== undefined && patch[field] !== stored[field],
  );
  return scalarChanged || hotspotsChanged(stored.hotspots, patch.hotspots);
}
