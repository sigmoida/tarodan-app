"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Drawer } from "@tarodan/ui";
import { SidebarContent } from "./SidebarContent";

/** Kenar çubuğunun göründüğü kırılma noktası — Tailwind `lg` ile aynı olmalı. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Küçük ekran gezinme çekmecesi — mağaza tarafındaki `MobileDrawer` ile aynı
 * kurgu: paylaşılan `Drawer` primitifi (Radix odak tuzağı / Escape / gövde
 * kaydırma kilidi), başlıkta marka, yol değişince ve masaüstüne büyüyünce
 * otomatik kapanma.
 *
 * İçerik masaüstü kenar çubuğunun TA KENDİSİ (`SidebarContent`).
 */
export function SidebarNavDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  // Gezinildiğinde kapan: menüdeki bağlantılar sayfayı değiştirir ama panel
  // açık kaldığı sürece yeni sayfanın üstünü kapatır.
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Masaüstüne büyüyünce kapan: hamburger `lg:hidden` olduğu için kaybolur ama
  // açık panel ve karartma katmanı kalır, sayfa tıklanamaz olurdu.
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
      isOpen={open}
      onClose={onClose}
      side="left"
      closeLabel={t("common.close")}
      title={
        /* Panel yüzeyi açık olduğu için başlıktaki saydam sürüm değil, giriş
           ekranlarındaki opak marka kullanılır — mağaza çekmecesiyle aynı. */
        <Link
          href="/dashboard"
          scroll={false}
          className="inline-flex items-center"
        >
          <Image
            src="/tarodan-logo.jpg"
            alt=""
            width={130}
            height={32}
            className="h-8 w-auto rounded-lg object-contain"
          />
          <span className="sr-only">{t("nav.menu")}</span>
        </Link>
      }
      bodyClassName="flex flex-col"
    >
      <SidebarContent onNavigate={onClose} />
    </Drawer>
  );
}
