/** @format */

"use client";

import { Modal } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { usePopupAd } from "@/hooks/usePopupAd";
import AdCreative from "./AdCreative";

/**
 * Popup afişi (modal). Kapatma: X, Esc, arka plan — hepsi `Modal`'dan gelir.
 * Açılış kuralları (24 saat sınırı, başka katman yokken) `usePopupAd`'de.
 * Yalnız `(main)` düzeninde, QueryProvider içinde bağlanır.
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
      closeLabel={t("common.close")}
      bodyClassName="p-0"
    >
      <AdCreative
        ad={ad}
        position="popup"
        sizes="(max-width: 768px) 100vw, 512px"
        className="overflow-hidden rounded-lg"
        onNavigate={close}
      />
    </Modal>
  );
}
