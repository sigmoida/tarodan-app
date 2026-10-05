"use client";

import { Alert, Button } from "@tarodan/ui";
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
    <Alert
      variant="warning"
      icon={<BuildingStorefrontIcon className="h-6 w-6" />}
      title={t("admin.operations.trades.reviewTitle")}
      action={
        <div className="flex flex-wrap gap-2">
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
      }
    >
      <p>
        {underReview
          ? t("admin.operations.trades.reviewInProgress")
          : t("admin.operations.trades.reviewBody")}
      </p>
    </Alert>
  );
}
