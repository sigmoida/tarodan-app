/** @format */

import type { Metadata } from "next";
import { ALLOW_INDEXING } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://tarodan.com.tr",
  ),
  title: "Tarodan - Model Araba Pazarı",
  description:
    "Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu",
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
    siteName: "Tarodan",
    title: "Tarodan - Model Araba Pazarı",
    description:
      "Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tarodan - Model Araba Pazarı",
    description:
      "Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu",
  },
  icons: {
    icon: "/tarodan-favicon.png",
  },
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
