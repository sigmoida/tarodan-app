"use client";

import { Button } from "@tarodan/ui";
import {
  BuildingStorefrontIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

/** Admin review panel — approve/reject buttons open their respective modals. */
export function ReviewPanel({
  show,
  onApprove,
  onReject,
}: {
  show: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const t = useTranslations();
  if (!show) return null;

  return (
    <div className="rounded-xl border-2 border-warning-400 bg-warning-50 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <BuildingStorefrontIcon className="h-8 w-8 flex-shrink-0 text-warning-600" />
          <div>
            <h2 className="text-lg font-semibold text-warning-900">
              {t("admin.operations.trades.reviewTitle")}
            </h2>
            <p className="mt-1 text-sm text-warning-800">
              {t("admin.operations.trades.reviewBody")}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button variant="danger" onClick={onReject}>
            <XCircleIcon className="mr-1 h-5 w-5" />
            {t("admin.operations.trades.reject")}
          </Button>
          <Button variant="success" onClick={onApprove}>
            <CheckCircleIcon className="mr-1 h-5 w-5" />
            {t("common.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
