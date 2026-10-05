"use client";

import { Alert, Button } from "@tarodan/ui";
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
    <Alert
      variant="warning"
      icon={<ExclamationTriangleIcon className="h-6 w-6" />}
      title={t("admin.operations.trades.compensationTitle")}
      action={
        <Button
          variant="primary"
          onClick={handle}
          isLoading={resolve.isPending}
        >
          {t("admin.operations.trades.compensationClosed")}
        </Button>
      }
    >
      <p>{t("admin.operations.trades.compensationBody", { who })}</p>
    </Alert>
  );
}
