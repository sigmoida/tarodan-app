"use client";

import toast from "react-hot-toast";
import { Button } from "@tarodan/ui";
import {
  ArrowUturnLeftIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type { TradeDetail } from "../types";

/** PayTR refund-failure panel — self-contained (owns the retry mutation + confirm). */
export function RefundFailurePanel({ trade }: { trade: TradeDetail }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const retry = useAdminMutation(() => adminApi.retryTradeRefund(trade.id), {
    invalidates: ["trades"],
    errorMessage: t("admin.operations.trades.refundRetryFailed"),
    onSuccess: (res) => {
      const d = (res as any)?.data?.data ?? (res as any)?.data;
      if (d?.refunded) toast.success(t("admin.operations.trades.refundResent"));
      else if (d?.skippedReason)
        toast.success(
          t("admin.operations.trades.refundSkipped", {
            reason: d.skippedReason,
          }),
        );
      else toast.success(t("admin.operations.trades.refundDone"));
    },
  });

  if (!trade.refundFailureReason) return null;

  const handle = async () => {
    await confirm({
      description: t("admin.operations.trades.confirmRetryRefund"),
      destructive: true,
      onConfirm: () => retry.mutateAsync(),
    });
  };

  return (
    <div className="rounded-xl border-2 border-danger-400 bg-danger-50 p-6 shadow-sm">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-8 w-8 flex-shrink-0 text-danger-600" />
          <div>
            <h2 className="text-lg font-semibold text-danger-900">
              {t("admin.operations.trades.refundFailureTitle")}
            </h2>
            <p className="mt-1 text-sm text-danger-800">
              {trade.refundFailureReason}
            </p>
            {trade.refundFailureAt && (
              <p className="mt-1 text-xs text-danger-700">
                {t("admin.operations.trades.lastError", {
                  date: new Date(trade.refundFailureAt).toLocaleString("tr-TR"),
                })}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="danger"
          onClick={handle}
          isLoading={retry.isPending}
          className="sm:flex-shrink-0"
        >
          <ArrowUturnLeftIcon className="mr-1 h-5 w-5" />
          {t("admin.operations.trades.retryRefund")}
        </Button>
      </div>
    </div>
  );
}
