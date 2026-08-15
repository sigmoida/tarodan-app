"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@tarodan/ui";

/**
 * The single error-boundary UI, shared by every `error.tsx` / `global-error.tsx`
 * so recovery looks identical everywhere. `reset()` retries the failed segment;
 * a home link is always offered. Use `fullScreen` for root/global boundaries
 * (no chrome around them) and the default padded block for segment boundaries
 * that render inside a layout (header/footer or the profile shell stay put).
 */
export default function ErrorState({
  error,
  reset,
  fullScreen = false,
  title,
  description,
}: {
  error?: Error & { digest?: string };
  reset?: () => void;
  fullScreen?: boolean;
  title?: string;
  description?: string;
}) {
  const t = useTranslations();

  useEffect(() => {
    if (error && process.env.NODE_ENV === "development") console.error(error);
  }, [error]);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${
        fullScreen ? "min-h-dvh bg-surface" : "py-20"
      }`}
    >
      <p className="text-6xl font-bold text-danger-500">500</p>
      <h1 className="text-2xl font-semibold text-heading">
        {title ?? t("error.somethingWrong")}
      </h1>
      <p className="max-w-md text-muted">
        {description ?? t("error.unexpectedRetryOrHome")}
      </p>
      {error?.digest && (
        <p className="text-xs text-subtle">
          {t("error.errorCode")}: {error.digest}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {reset && <Button onClick={reset}>{t("common.tryAgain")}</Button>}
        <Button asChild variant="outline">
          <Link href="/">{t("error.goHomeShort")}</Link>
        </Button>
      </div>
    </div>
  );
}
