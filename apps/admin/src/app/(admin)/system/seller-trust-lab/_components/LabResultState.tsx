"use client";

import { useTranslations } from "next-intl";
import { Alert, Button, Skeleton } from "@tarodan/ui";
import {
  extractErrorMessage,
  isForbiddenError,
  isThrottledError,
  isUnprocessableError,
} from "@/lib/error";

/** Result area while a call is in flight (the run button is disabled too). */
export function LabLoading() {
  const t = useTranslations();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("admin.system.sellerTrustLab.states.loading")}
      className="space-y-3"
    >
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/**
 * Error of a lab call: throttled (429) and forbidden (403) have their own
 * text; anything else shows the server message with a retry. The form above
 * keeps its values, so a retry is one click.
 */
export function LabError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const t = useTranslations();

  if (isForbiddenError(error)) {
    return (
      <Alert variant="danger">
        {t("admin.system.sellerTrustLab.states.forbidden")}
      </Alert>
    );
  }

  // A refused request (e.g. a population over the row cap) names the fix itself.
  if (isUnprocessableError(error)) {
    return <Alert variant="warning">{extractErrorMessage(error, "")}</Alert>;
  }

  const throttled = isThrottledError(error);
  return (
    <Alert
      variant="danger"
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("admin.system.sellerTrustLab.states.retry")}
        </Button>
      }
    >
      {throttled
        ? t("admin.system.sellerTrustLab.states.throttled")
        : t("admin.system.sellerTrustLab.states.error", {
            message: extractErrorMessage(error, ""),
          })}
    </Alert>
  );
}
