/** @format */

"use client";

import { useEffect, type ReactNode } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Drawer } from "@tarodan/ui";

/** Panellerin gizlendiği kırılma noktası — Tailwind `lg` ile aynı olmalı. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Küçük ekran yan panellerinin ORTAK gövdesi: marka başlığı, yol değişince
 * kapanma ve masaüstüne geçince kapanma. Katalog gezinmesi, hesap gezinmesi ve
 * ilan filtreleri bunu kullanır — üçü de aynı görünsün ve aynı davransın.
 *
 * Açık/kapalı durumu DIŞARIDAN gelir: gezinme çekmecesi paylaşılan store'dan,
 * filtre paneli sayfa bağlamından beslenir. Aynı store'u paylaşsalardı
 * `/listings` sayfasında hamburger ikisini birden açardı.
 */
export default function MobileDrawer({
  isOpen,
  onClose,
  title,
  children,
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Panelin erişilebilir adı ("Menü" / "Hesap" / "Filtreler") — başlıkta görsel olarak logo durur. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  // Gezinildiğinde kapan: paneldeki bağlantılar sayfayı değiştirir ama panel
  // açık kaldığı sürece yeni sayfanın üstünü kapatır. Filtre paneli bundan
  // etkilenmez — filtreler yalnız sorgu dizesini değiştirir, yolu değil.
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Masaüstüne büyüyünce kapan: paneli açan düğme `lg:hidden` olduğu için
  // kaybolur ama açık panel ve karartma katmanı kalır, sayfa tıklanamaz olurdu.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(DESKTOP_QUERY);
    const sync = () => {
      if (media.matches) onClose();
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [onClose]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      side="left"
      title={
        /*
          Başlıkta metin yerine marka: giriş ekranlarındaki logonun aynısı
          (`tarodan-logo.jpg` — panel yüzeyi açık olduğu için başlıktaki saydam
          sürüm değil bu doğru olan), panel başlığına sığacak yükseklikte.
          `alt` boş: görselin taşıdığı ad zaten yanındaki gizli etikette ve iki
          kez okunması gezinmeyi uzatırdı.
        */
        <Link href="/" className="inline-flex items-center">
          <Image
            src="/tarodan-logo.jpg"
            alt=""
            width={130}
            height={32}
            className="h-8 w-auto rounded-lg object-contain"
          />
          <span className="sr-only">{title}</span>
        </Link>
      }
      closeLabel={t("common.close")}
      footer={footer}
    >
      {children}
    </Drawer>
  );
}
