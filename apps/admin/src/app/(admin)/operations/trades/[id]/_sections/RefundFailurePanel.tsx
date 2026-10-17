"use client";

import toast from "react-hot-toast";
import { Alert, Button } from "@tarodan/ui";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
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
    <Alert
      variant="danger"
      title={t("admin.operations.trades.refundFailureTitle")}
      action={
        <Button variant="danger" onClick={handle} isLoading={retry.isPending}>
          <ArrowUturnLeftIcon className="mr-1 h-5 w-5" />
          {t("admin.operations.trades.retryRefund")}
        </Button>
      }
    >
      <p>{trade.refundFailureReason}</p>
      {trade.refundFailureAt && (
        <p className="mt-1 text-xs">
          {t("admin.operations.trades.lastError", {
            date: fmtDateTime(trade.refundFailureAt),
          })}
        </p>
      )}
    </Alert>
  );
}
