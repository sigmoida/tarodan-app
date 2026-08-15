/** @format */

import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { defaultLocale } from "@tarodan/i18n";
import { surface } from "@tarodan/design-tokens";
import { ALLOW_INDEXING } from "@/lib/seo";

/**
 * App-wide metadata fallback. This layer sits ABOVE the `[locale]` segment, so
 * there is no request locale to read here — the copy is resolved on the default
 * locale. Every localized route overrides title/description itself, and
 * `app/[locale]/layout` sets the per-locale `og:locale`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: defaultLocale });
  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_APP_URL || "https://tarodan.com.tr",
    ),
    title: t("page.app.layout.tarodanModelArabaPazari"),
    description: t(
      "page.app.layout.diecastModelArabaKoleksiyonculariIcinGuvenli",
    ),
    // Single indexing switch (#93): flip NEXT_PUBLIC_ALLOW_INDEXING at launch.
    robots: ALLOW_INDEXING
      ? { index: true, follow: true }
      : {
          index: false,
          follow: false,
          nocache: true,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
            "max-video-preview": -1,
            "max-image-preview": "none",
            "max-snippet": -1,
          },
        },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      url: "https://tarodan.com.tr",
      siteName: t("page.app.layout.tarodan"),
      title: t("page.app.layout.tarodanModelArabaPazari"),
      description: t(
        "page.app.layout.diecastModelArabaKoleksiyonculariIcinGuvenli",
      ),
    },
    twitter: {
      card: "summary_large_image",
      title: t("page.app.layout.tarodanModelArabaPazari"),
      description: t(
        "page.app.layout.diecastModelArabaKoleksiyonculariIcinGuvenli",
      ),
    },
    icons: {
      icon: "/tarodan-favicon.png",
    },
  };
}

/**
 * `only light` tells the browser the site ships a single, light-only theme, which
 * is the documented opt-out from Android's algorithmic force-dark (Chrome's Auto
 * Dark Theme, Samsung Internet, MIUI). Without it those browsers repaint our
 * surfaces dark and invert text while leaving photos and brand colours alone —
 * the "the site looks like dark mode on my phone" reports. The moment a real dark
 * theme exists, this becomes `light dark`. `globals.css` declares the same thing
 * in CSS so the root `not-found.tsx` shell (which renders above the locale
 * layout, with its own `<html>`) is covered too.
 */
export const viewport: Viewport = {
  colorScheme: "only light",
  themeColor: surface.DEFAULT,
  /**
   * `cover`, belgeyi çentikli ekranlarda kenardan kenara yayar — başlığın turuncu
   * zemini ve sayfa yüzeyi artık yanlarda beyaz şerit bırakmıyor. Karşılığında
   * sistem şeritlerinden (durum çubuğu, ana ekran çizgisi, yatayda çentik)
   * kaçınma sorumluluğu sayfaya geçer: `env(safe-area-inset-*)` ancak bu ayar
   * açıkken sıfırdan farklı döner. Kaçınmayı `@tarodan/design-tokens`'ın
   * `px-gutter` / `pb-safe` yardımcıları yapar; `Container` ve ekrana sabitlenen
   * her katman (çekmece, çerez bandı, bildirim) onları kullanır.
   */
  viewportFit: "cover",
};

/**
 * Root layout — a pass-through required by the App Router. With locale in the
 * URL (#214) the real document shell (`<html lang>`, `<body>`, fonts, and the
 * cross-cutting i18n / OAuth / toast providers) lives in `app/[locale]/layout`,
 * because only that segment can read the active `[locale]` param. This layer
 * carries just the app-wide `metadata` (inherited by every route) and renders
 * its children bare. The root `not-found.tsx` ships its own `<html>` since it
 * renders above the locale layout.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
