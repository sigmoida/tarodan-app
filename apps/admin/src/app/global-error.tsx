"use client";

import { useEffect } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { defaultLocale, getMessages } from "@tarodan/i18n";
import { Button } from "@tarodan/ui";
import { logger } from "@/lib/logger";
import "./globals.css";

/**
 * Kicks in when the root layout itself errors — renders its own `<html>`/`<body>`
 * tree and pulls in globals.css (otherwise tokens won't load).
 *
 * This boundary renders ABOVE the admin layout, so the app's intl provider never
 * mounted. It therefore brings its own, on the default locale, straight from the
 * shared catalog: the copy can't be request-localized here, but it also isn't
 * hardcoded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Global error boundary caught error", {
      error,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang={defaultLocale}>
      <body>
        <NextIntlClientProvider
          locale={defaultLocale}
          messages={getMessages(defaultLocale)}
        >
          <GlobalErrorBody error={error} reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function GlobalErrorBody({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <p className="text-7xl font-bold text-danger-500">500</p>
      <h1 className="text-2xl font-semibold text-heading">
        {t("error.somethingWrong")}
      </h1>
      <p className="max-w-md text-muted">{t("error.appCrashed")}</p>
      {error.digest && (
        <p className="text-xs text-subtle">
          {t("error.errorCode")}: {error.digest}
        </p>
      )}
      <Button className="mt-2" onClick={reset}>
        {t("common.tryAgain")}
      </Button>
    </main>
  );
}
