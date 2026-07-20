"use client";

import { useTranslations } from "next-intl";
import { Alert, Button } from "@tarodan/ui";
import { fmtTry } from "@/lib/format";
import {
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import {
  guidanceForStatus,
  type GuidanceVariant,
} from "../_lib/refund-guidance";

const VARIANT_ICON: Record<GuidanceVariant, React.ReactNode> = {
  info: <InformationCircleIcon className="h-6 w-6" />,
  warning: <ExclamationTriangleIcon className="h-6 w-6" />,
  success: <CheckCircleIcon className="h-6 w-6" />,
  danger: <XCircleIcon className="h-6 w-6" />,
  default: <InformationCircleIcon className="h-6 w-6" />,
};

export interface RefundNextActionPanelProps {
  status: string;
  reason: string;
  amount: number;
  canForceFinalize: boolean;
  finalizing: boolean;
  onFinalize: () => void;
}

/**
 * "What should you do now?" panel — a plain status summary per state,
 * whether action is needed, and (if so) a single primary action button.
 */
export function RefundNextActionPanel({
  status,
  reason,
  amount,
  canForceFinalize,
  finalizing,
  onFinalize,
}: RefundNextActionPanelProps) {
  const t = useTranslations();
  const guidance = guidanceForStatus(t, status);

  return (
    <div className="space-y-4">
      <Alert
        variant={guidance.variant}
        title={guidance.title}
        icon={VARIANT_ICON[guidance.variant]}
      >
        <div className="space-y-3">
          <p>{guidance.description}</p>

          {status === "refunded" && (
            <p className="font-semibold">
              {t("admin.operations.refundRequests.refundedAmountLabel", {
                amount: fmtTry(amount),
              })}
            </p>
          )}

          {canForceFinalize && (
            <Button
              variant="primary"
              onClick={onFinalize}
              isLoading={finalizing}
              disabled={finalizing}
            >
              <BanknotesIcon className="mr-1.5 h-5 w-5" />
              {t("admin.operations.refundRequests.forceFinalizeButton")}
            </Button>
          )}
        </div>
      </Alert>

      {reason === "counterfeit" && (
        <Alert
          variant="danger"
          title={t("admin.operations.refundRequests.counterfeitTitle")}
          icon={<ExclamationTriangleIcon className="h-6 w-6" />}
        >
          {t("admin.operations.refundRequests.counterfeitBody")}
        </Alert>
      )}
    </div>
  );
}
