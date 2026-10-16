"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { isEmbedPath } from "@/lib/embed";

/**
 * Kök `[locale]/layout`ın TÜM sayfalar için çizdiği katmanları (çerez bandı,
 * Ads etiketi) mobil WebView'in `/app/**` sayfalarında çizmez. Kök düzen sunucu
 * bileşeni; yolu `headers()` ile okumak tüm siteyi dinamik render'a düşürürdü,
 * bu yüzden karar istemcide, yola bakarak verilir (`usePathname` locale'siz yol
 * döner). Çocuklar gizlenirken UNMOUNT edilir — Ads etiketi hiç kurulmaz.
 */
export default function HideInEmbed({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isEmbedPath(pathname)) return null;
  return <>{children}</>;
}
