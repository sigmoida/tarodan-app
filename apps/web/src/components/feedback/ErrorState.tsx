"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import { Button, EmptyState } from "@tarodan/ui";
import { logger } from "@/lib/logger";

/**
 * The single error-boundary UI, shared by every `error.tsx` / `global-error.tsx`
 * so recovery looks identical everywhere. `reset()` retries the failed segment;
 * a home link is always offered. Use `fullScreen` for root/global boundaries
 * (no chrome around them) and the default padded block for segment boundaries
 * that render inside a layout (header/footer or the profile shell stay put).
 *
 * It is also the one place a caught client render error is reported: an
 * error a boundary catches never reaches the global handlers, so without this
 * it would not reach Sentry. An error with a `digest` came from the server,
 * where `onRequestError` already reported it with its real message; in the
 * browser it is only a generic placeholder, so it is not sent again.
 *
 * `inline` is for a failed list or section load inside a page that already
 * has its own header: the `EmptyState` layout with an error icon and a retry
 * (the mobile `ErrorState`), without the "500", the page heading or the home
 * link of the boundary. `retrying` keeps the retry button busy while it runs.
 */
export default function ErrorState({
  error,
  reset,
  fullScreen = false,
  title,
  description,
  inline = false,
  retrying = false,
}: {
  error?: Error & { digest?: string };
  reset?: () => void;
  fullScreen?: boolean;
  title?: string;
  description?: string;
  inline?: boolean;
  retrying?: boolean;
}) {
  const t = useTranslations();

  useEffect(() => {
    if (error && !error.digest) {
      logger.error("Error boundary caught error", { error });
    }
  }, [error]);

  if (inline) {
    return (
      <EmptyState
        icon={<ExclamationCircleIcon className="h-7 w-7" />}
        title={title ?? t("error.somethingWrong")}
        description={description ?? t("error.somethingWrongDesc")}
        action={
          reset ? (
            <Button onClick={reset} isLoading={retrying} disabled={retrying}>
              {t("common.tryAgain")}
            </Button>
          ) : undefined
        }
      />
    );
  }

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
