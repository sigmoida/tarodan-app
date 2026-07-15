/** @format */

import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ALLOW_INDEXING } from "@/lib/seo";

const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://tarodan.com",
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
    url: "https://tarodan.com",
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
    icon: "/tarodanfavicon.png",
  },
};

/**
 * Root layout — the app-wide shell only: document, global metadata, and the
 * truly cross-cutting providers (i18n + Google OAuth) plus the global toast and
 * cookie banner. Visual chrome and route gating live in the route-group layouts
 * ((main) owns the storefront; (auth) owns the auth frame). Renders {children}
 * bare — no Navbar/Footer, no marketplace providers.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // next-intl (cookie-resolved locale + shared catalog). Runs alongside the
  // legacy LanguageProvider until call sites migrate (#213); the legacy context
  // still drives visible strings for now.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={notoSans.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <GoogleOAuthProvider
            clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
          >
            {children}
            <CookieConsentBanner />
            <Toaster
              position="bottom-right"
              toastOptions={{ style: { maxWidth: "360px" } }}
            />
          </GoogleOAuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
