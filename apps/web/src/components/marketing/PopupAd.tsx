/** @format */

"use client";

import { Modal } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { usePopupAd } from "@/hooks/usePopupAd";
import { withSoleHotspotExpanded } from "@/lib/ads/hotspots";
import AdCreative from "./AdCreative";

/**
 * Popup afişi — yalnız ana sayfada bağlanır. Sade çerçeve (`variant="media"`):
 * başlık satırı yok, görselin sağ üstünde kapatma; Esc / arka plan da kapatır.
 * Açılış ve sıklık kuralları `usePopupAd`'de.
 *
 * Tek bölgeli görselli afişte görselin tamamı tıklanır; çok bölgede bölgeler
 * olduğu gibi. Görselsiz (metin) afiş kendi gövdesiyle, yüzey zemininde çizilir.
 */
export default function PopupAd() {
  const t = useTranslations();
  const { ad, close } = usePopupAd();
  if (!ad) return null;

  return (
    <Modal
      isOpen
      onClose={close}
      ariaLabel={ad.title}
      size="lg"
      variant="media"
      closeLabel={t("common.close")}
    >
      <AdCreative
        ad={withSoleHotspotExpanded(ad)}
        position="popup"
        sizes="(max-width: 768px) 100vw, 512px"
        className={
          ad.imageUrl
            ? "overflow-hidden rounded-lg"
            : // Kapatma düğmesi metnin üstüne binmesin.
              "overflow-hidden rounded-lg bg-surface-elevated pr-10"
        }
        onNavigate={close}
      />
    </Modal>
  );
}
