/** @format */

import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Toaster } from "react-hot-toast";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { isLocale } from "@tarodan/i18n";
import { zIndex } from "@tarodan/design-tokens";
import { routing } from "@/i18n/routing";
import DynamicCookieConsentBanner from "@/components/DynamicCookieConsentBanner";
import GoogleAdsTag from "@/components/GoogleAdsTag";
import { GOOGLE_ADS_ID } from "@/lib/googleAds";
import "../globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

/**
 * Pre-render both locale shells at build time so `/` (tr) and `/en` are static
 * (SSG) rather than rendered per request — the SEO win this issue restores.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Per-locale Open Graph language, merged over the global metadata in the root
 * layout. `og:locale` must reflect the page's actual language (tr_TR vs en_US)
 * with the other locale listed as an alternate, so social/link previews render
 * in the right language. hreflang itself is emitted via the sitemap alternates
 * + the next-intl middleware's `Link` headers (#214c).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === "en";
  return {
    openGraph: {
      locale: isEn ? "en_US" : "tr_TR",
      alternateLocale: isEn ? ["tr_TR"] : ["en_US"],
    },
  };
}

/**
 * The real document shell for every localized route. It owns `<html lang>` (set
 * from the URL segment, so the first byte is in the right language — no flash),
 * the font, and the truly cross-cutting providers: i18n (server-resolved locale
 * + shared catalog), Google OAuth, the global toast, and the cookie banner.
 * Visual chrome and route gating stay in the route-group layouts ((main) owns
 * the storefront, (auth) the auth frame). Renders {children} bare otherwise.
 *
 * `setRequestLocale` opts the subtree into static rendering by telling next-intl
 * the locale up-front (instead of it being read lazily from headers, which would
 * force dynamic rendering). An unknown `[locale]` 404s.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={notoSans.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <GoogleOAuthProvider
            clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
          >
            {children}
            <DynamicCookieConsentBanner />
            {/*
              Pazarlama rızasına bağlı Google Ads etiketi (gtag.js). Kimlik
              build'e hiç verilmemişse ada render edilmez — istemciye ölü bir
              hidrasyon adası ve bundle yükü gitmez.
            */}
            {GOOGLE_ADS_ID ? <GoogleAdsTag adsId={GOOGLE_ADS_ID} /> : null}
            {/*
              Bildirimler ekranın alt kenarına yapışır; `bottom` varsayılan 16px
              yerine ana ekran çizgisinin payını da ekler, yoksa çentikli
              telefonlarda son bildirim çizginin altında kalıyordu. `maxWidth`
              artık sabit 360px değil: 360px'i hedefler ama dar telefonda
              görünür alana (ve yatay çentiğe) göre daralır.
            */}
            <Toaster
              position="bottom-right"
              containerStyle={{
                zIndex: zIndex.toast,
                bottom: "calc(1rem + env(safe-area-inset-bottom))",
                right: "calc(1rem + env(safe-area-inset-right))",
              }}
              toastOptions={{
                style: {
                  maxWidth:
                    "min(360px, calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right)))",
                },
              }}
            />
          </GoogleOAuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
