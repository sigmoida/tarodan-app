"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { logger } from "@/lib/logger";

/**
 * Segment-level error boundary (root). Catches route render/data errors;
 * `reset()` retries the segment. For errors in the root layout itself there
 * is a separate `global-error.tsx`.
 *
 * Safe to use `useTranslations` here: this boundary sits INSIDE the root
 * layout (`app/layout.tsx`), which mounts `NextIntlClientProvider` around
 * `{children}` — the boundary only replaces the erroring subtree, so the
 * provider stays mounted. Errors thrown by the root layout itself (before the
 * provider exists) are caught by `global-error.tsx` instead, which has no such
 * context and stays hardcoded.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();

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
        {t("admin.shared.errors.title")}
      </h1>
      <p className="max-w-md text-muted">
        {t("admin.shared.errors.description")}
      </p>
      {error.digest && (
        <p className="text-xs text-subtle">
          {t("admin.shared.errors.errorCode", { code: error.digest })}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>{t("admin.shared.errors.retry")}</Button>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 font-medium text-heading transition-colors hover:bg-surface-alt"
        >
          {t("admin.shared.errors.backToPanel")}
        </Link>
      </div>
    </main>
  );
}
