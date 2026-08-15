"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";
import { defaultLocale, getMessages } from "@tarodan/i18n";
import ErrorState from "@/components/feedback/ErrorState";
import "./globals.css";

/**
 * Kicks in when the root layout itself errors — renders its own `<html>`/`<body>`
 * tree and pulls in globals.css (otherwise tokens won't load), then reuses the
 * shared {@link ErrorState} so recovery looks identical to every other boundary.
 *
 * This boundary sits ABOVE `app/[locale]/layout`, so the locale segment — and
 * with it the i18n provider — never rendered. It therefore mounts its own
 * provider on the default locale straight from the shared catalog: the copy
 * can't be request-localized here, but it also isn't hardcoded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang={defaultLocale}>
      <body>
        <NextIntlClientProvider
          locale={defaultLocale}
          messages={getMessages(defaultLocale)}
        >
          <AppCrashState error={error} reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function AppCrashState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();
  return (
    <ErrorState
      error={error}
      reset={reset}
      fullScreen
      description={t("error.appCrashed")}
    />
  );
}
