/* eslint-disable @tarodan/no-hardcoded-turkish -- root error boundary renders outside the intl provider; copy stays hardcoded by design (#222) */
"use client";

import { useEffect } from "react";
import { Button } from "@tarodan/ui";
import { logger } from "@/lib/logger";
import "./globals.css";

/**
 * Kicks in when the root layout itself errors — renders its own `<html>`/`<body>`
 * tree and pulls in globals.css (otherwise tokens won't load).
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
    <html lang="tr">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
          <p className="text-7xl font-bold text-danger-500">500</p>
          <h1 className="text-2xl font-semibold text-heading">
            Bir şeyler ters gitti
          </h1>
          <p className="max-w-md text-muted">
            Uygulama beklenmeyen bir hatayla karşılaştı. Yeniden denemeyi
            deneyin.
          </p>
          {error.digest && (
            <p className="text-xs text-subtle">Hata kodu: {error.digest}</p>
          )}
          <Button className="mt-2" onClick={reset}>
            Yeniden dene
          </Button>
        </main>
      </body>
    </html>
  );
}
