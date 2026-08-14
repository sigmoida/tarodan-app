"use client";

import { Button } from "@tarodan/ui";
import {
  BuildingStorefrontIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

/**
 * Depo kontrol paneli. "Kontrole al" adımı takası `admin_reviewing`e taşır:
 * kontrolün kimin elinde ve ne zaman başladığı denetim kaydına yazılır,
 * kullanıcı da takasın incelendiğini görür. Onay/red butonları kendi
 * modallarını açar.
 */
export function ReviewPanel({
  show,
  underReview,
  onStartReview,
  startingReview,
  onApprove,
  onReject,
}: {
  show: boolean;
  underReview: boolean;
  onStartReview: () => void;
  startingReview: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const t = useTranslations();
  if (!show) return null;

  return (
    <div className="rounded-xl border-2 border-warning-400 bg-warning-50 p-6 shadow-sm">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-start gap-3">
          <BuildingStorefrontIcon className="h-8 w-8 flex-shrink-0 text-warning-600" />
          <div>
            <h2 className="text-lg font-semibold text-warning-900">
              {t("admin.operations.trades.reviewTitle")}
            </h2>
            <p className="mt-1 text-sm text-warning-800">
              {underReview
                ? t("admin.operations.trades.reviewInProgress")
                : t("admin.operations.trades.reviewBody")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          {!underReview && (
            <Button
              variant="secondary"
              onClick={onStartReview}
              isLoading={startingReview}
            >
              {t("admin.operations.trades.startReview")}
            </Button>
          )}
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
