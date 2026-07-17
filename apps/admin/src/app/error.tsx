"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@tarodan/ui";
import { logger } from "@/lib/logger";

/**
 * Segment-level error boundary (root). Catches route render/data errors;
 * `reset()` retries the segment. For errors in the root layout itself there
 * is a separate `global-error.tsx`.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Segment error boundary caught error", {
      error,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <p className="text-7xl font-bold text-danger-500">500</p>
      <h1 className="text-2xl font-semibold text-heading">
        Bir şeyler ters gitti
      </h1>
      <p className="max-w-md text-muted">
        Beklenmeyen bir hata oluştu. Tekrar deneyebilir ya da panele
        dönebilirsiniz.
      </p>
      {error.digest && (
        <p className="text-xs text-subtle">Hata kodu: {error.digest}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Tekrar dene</Button>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 font-medium text-heading transition-colors hover:bg-surface-alt"
        >
          Panele dön
        </Link>
      </div>
    </main>
  );
}
