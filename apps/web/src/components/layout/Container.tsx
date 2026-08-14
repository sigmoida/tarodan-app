/** @format */

import type { ReactNode } from "react";

/**
 * The single max-width boundary for the marketplace shell. Content is full-bleed
 * until the cap below, then fixed + centered so it never stretches on ultra-wide
 * screens. Both the (main) content area and the navbar header render through this
 * so the width lives in ONE place — change it here and the whole shell follows.
 *
 * Kept dependency-free (no `@tarodan/ui` barrel import) so it stays usable from
 * Server Components like `(main)/layout.tsx` without dragging client components
 * into the server module graph.
 *
 * Yatay boşluk `px-4` değil `px-gutter` (tanımı: `@tarodan/design-tokens`
 * ön ayarı). İki iş yapar: ekranla birlikte ölçeklenir — telefonda 1rem, geniş
 * ekranda 2rem'e kadar — ve belge `viewport-fit=cover` ile yayınlandığı için
 * (bkz. `app/layout.tsx`) yatay kullanımda çentik bu değerden genişse boşluk
 * ona büyür. Çağıran taraf kendi `px-*` sınıfını GEÇMEMELİ — ikisini de iptal
 * eder.
 */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`px-gutter mx-auto w-full max-w-screen-2xl ${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
