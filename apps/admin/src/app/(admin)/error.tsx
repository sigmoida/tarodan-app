"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { logger } from "@/lib/logger";

/** Scoped admin-content boundary: the surrounding sidebar and topbar stay mounted. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();

  useEffect(() => {
    logger.error("Admin section error boundary caught error", {
      error,
      digest: error.digest,
    });
  }, [error]);

  return (
    <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold text-danger-500">500</p>
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
    </section>
  );
}
