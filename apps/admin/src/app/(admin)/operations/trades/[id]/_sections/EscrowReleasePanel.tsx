"use client";

import { Button } from "@tarodan/ui";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useSession } from "@/context/SessionContext";
import { usePrompt } from "@/provider/PromptProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type { TradeDetail } from "../types";

/**
 * Tamamlanmış takasın nakit-fark escrow'u: hold süresini ve elle serbest
 * bırakma aksiyonunu gösterir. Süre dolmadan tıklanırsa ERKEN bırakmadır
 * (backend `force` ile gider; teslim/iade guard'ları orada aynen geçerli,
 * iade borcu taşıyan damgasız satırlara asla dokunulmaz). Uç super_admin
 * olduğundan panel yalnız o role görünür.
 */
export function EscrowReleasePanel({ trade }: { trade: TradeDetail }) {
  const t = useTranslations();
  const { user } = useSession();
  const prompt = usePrompt();
  const release = useAdminMutation(
    ({ reason, early }: { reason: string; early: boolean }) =>
      adminApi.releaseTradeHold(trade.id, reason, early),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.escrowReleasedMsg"),
    },
  );

  if (user?.role !== "super_admin" || trade.status !== "completed") return null;

  const rows = trade.cashPayments?.length
    ? trade.cashPayments
    : trade.cashPayment
      ? [trade.cashPayment]
      : [];
  const releasable = rows.filter(
    (row) =>
      row.status === "completed" &&
      !row.releasedAt &&
      !row.refundedAt &&
      row.holdReleaseAt,
  );
  if (releasable.length === 0) return null;

  const holdReleaseAt = releasable
    .map((row) => new Date(row.holdReleaseAt as string))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const early = holdReleaseAt.getTime() > Date.now();

  const handle = async () => {
    const reason = await prompt({
      title: early
        ? t("admin.operations.trades.escrowReleaseEarlyTitle")
        : t("admin.operations.trades.escrowReleaseTitle"),
      label: t("admin.operations.trades.escrowReleaseReasonLabel"),
      placeholder: t("admin.operations.trades.escrowReleaseReasonPlaceholder"),
      confirmLabel: t("admin.operations.trades.escrowReleaseConfirm"),
      required: true,
    });
    if (reason === null) return;
    release.mutate({ reason, early });
  };

  return (
    <div className="rounded-xl border border-info-200 bg-info-50 p-4 shadow-sm">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-start gap-3">
          <BanknotesIcon className="h-7 w-7 flex-shrink-0 text-info-700" />
          <div>
            <h2 className="text-base font-semibold text-info-900">
              {t("admin.operations.trades.escrowPanelTitle")}
            </h2>
            <p className="mt-1 text-sm text-info-800">
              {early
                ? t("admin.operations.trades.escrowPanelBodyEarly", {
                    date: fmtDateTime(holdReleaseAt),
                  })
                : t("admin.operations.trades.escrowPanelBodyDue", {
                    date: fmtDateTime(holdReleaseAt),
                  })}
            </p>
          </div>
        </div>
        <Button
          variant={early ? "outline" : "secondary"}
          size="sm"
          onClick={handle}
          isLoading={release.isPending}
        >
          {early
            ? t("admin.operations.trades.escrowReleaseEarlyTitle")
            : t("admin.operations.trades.escrowReleaseTitle")}
        </Button>
      </div>
    </div>
  );
}
