"use client";

import { Button } from "@tarodan/ui";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { usePrompt } from "@/provider/PromptProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type { TradeDetail } from "../types";

/** Manual-compensation panel — self-contained (owns the resolve mutation + prompt). */
export function CompensationPanel({ trade }: { trade: TradeDetail }) {
  const t = useTranslations();
  const prompt = usePrompt();
  const resolve = useAdminMutation(
    (note: string | undefined) =>
      adminApi.resolveTradeCompensation(trade.id, note || undefined),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.compensationClosedMsg"),
    },
  );

  if (!trade.compensationPendingUserId || trade.compensationResolvedAt)
    return null;

  const handle = async () => {
    const note = await prompt({
      title: t("admin.operations.trades.resolveCompensationTitle"),
      label: t("admin.operations.trades.compensationNoteLabel"),
      placeholder: t("admin.operations.trades.compensationNotePlaceholder"),
      confirmLabel: t("admin.operations.trades.resolveShort"),
      required: false,
    });
    if (note === null) return;
    resolve.mutate(note || undefined);
  };

  const who =
    trade.compensationPendingUserId === trade.initiator.id
      ? t("admin.operations.trades.offererParen", {
          name: trade.initiator.displayName,
        })
      : trade.compensationPendingUserId === trade.receiver.id
        ? t("admin.operations.trades.offerReceiverParen", {
            name: trade.receiver.displayName,
          })
        : trade.compensationPendingUserId;

  return (
    <div className="rounded-xl border-2 border-warning-400 bg-warning-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-7 w-7 flex-shrink-0 text-warning-700" />
          <div>
            <h2 className="text-base font-semibold text-warning-900">
              {t("admin.operations.trades.compensationTitle")}
            </h2>
            <p className="mt-1 text-sm text-warning-800">
              {t("admin.operations.trades.compensationBody", { who })}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={handle}
          isLoading={resolve.isPending}
          className="flex-shrink-0"
        >
          {t("admin.operations.trades.compensationClosed")}
        </Button>
      </div>
    </div>
  );
}
