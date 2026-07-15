/** @format */

import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Tarodan Admin",
  description: "Tarodan Marketplace yönetim paneli",
};

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
