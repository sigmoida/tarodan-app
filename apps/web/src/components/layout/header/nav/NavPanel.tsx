/** @format */

import type { ReactNode } from "react";

/**
 * Shared dropdown card shell for the header nav mega-panels (categories, scales).
 * One source of truth for the panel surface + border + radius + padding so both
 * panels stay identical.
 *
 * Yükseklik sınırı bir emniyet kemeridir: paneller katalog verisinden beslenir,
 * yani içerik büyüdükçe panel de büyür. Sınırsız bırakıldığında panel ekranın
 * altına taşıyor ve alt kısmı hiçbir şekilde erişilemiyordu — bu yüzden içerik
 * her koşulda görüntü alanına sığar, taşarsa panelin kendi içinde kaydırılır.
 */
export default function NavPanel({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-[calc(100vh-10rem)] w-full overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-elevated p-4 shadow-elevated">
      {children}
    </div>
  );
}
