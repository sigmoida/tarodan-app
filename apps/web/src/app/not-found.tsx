/** @format */

import { Noto_Sans } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

/**
 * Root 404 — renders for URLs that never reach a `[locale]` segment (paths the
 * i18n middleware doesn't rewrite, e.g. excluded prefixes). It sits ABOVE the
 * locale layout, so there is no `<html>`/i18n context here: it ships its own
 * minimal document in the default locale (tr). Localized `notFound()` calls
 * inside the app hit `app/[locale]/not-found.tsx` instead (with full chrome and
 * translations).
 */
export default function RootNotFound() {
  return (
    <html lang="tr">
      <body className={notoSans.className}>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
          <p className="text-7xl font-bold text-primary-600">404</p>
          <h1 className="text-2xl font-semibold text-heading">
            Sayfa bulunamadı
          </h1>
          <p className="max-w-md text-muted">
            Aradığınız sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir.
          </p>
          <a
            href="/"
            className="mt-2 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 font-medium text-inverted transition-colors hover:bg-primary-700"
          >
            Ana sayfaya dön
          </a>
        </main>
      </body>
    </html>
  );
}
