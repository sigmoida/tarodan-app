"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";

export function QueryErrorCard({
  onRetry,
  isRetrying = false,
  title,
  description,
}: {
  onRetry: () => void;
  isRetrying?: boolean;
  title?: ReactNode;
  description?: ReactNode;
}) {
  const t = useTranslations();

  return (
    <SectionCard>
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <ExclamationTriangleIcon className="h-12 w-12 shrink-0 text-danger-500" />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-heading">
            {title ?? t("admin.shared.suspense.errorTitle")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {description ?? t("admin.shared.suspense.errorDescription")}
          </p>
        </div>
        <Button variant="outline" onClick={onRetry} isLoading={isRetrying}>
          {t("admin.shared.suspense.retry")}
        </Button>
      </div>
    </SectionCard>
  );
}
