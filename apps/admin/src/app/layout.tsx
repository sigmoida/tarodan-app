/** @format */

import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/navigation";

const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

/** Async so the description can come from the request-resolved locale (title stays the brand name, not translated). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_APP_URL || "https://admin.tarodan.com",
    ),
    title: APP_NAME,
    description: t("admin.nav.defaultDescription"),
    robots: { index: false, follow: false },
  };
}

/**
 * Root layout. Async so it can resolve the request locale (from the NEXT_LOCALE
 * cookie) and the shared message catalog, then hand both to
 * `NextIntlClientProvider` so every client component can call `useTranslations`.
 * `<html lang>` reflects the active locale. Locale switching is a cookie write +
 * refresh (the admin has no URL routing) — see `LocaleSwitcher` in the topbar.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={notoSans.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Toaster
            position="bottom-right"
            toastOptions={{ style: { maxWidth: "360px" } }}
          />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
