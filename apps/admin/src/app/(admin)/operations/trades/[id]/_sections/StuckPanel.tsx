"use client";

import { Alert, Button } from "@tarodan/ui";
import { ClockIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { fmtDateTime } from "@/lib/format";
import type { TradeDetail } from "../types";

/** Stuck partial-arrival panel — the button opens the force-cancel modal. */
export function StuckPanel({
  trade,
  show,
  onResolve,
}: {
  trade: TradeDetail;
  show: boolean;
  onResolve: () => void;
}) {
  const t = useTranslations();
  if (!show) return null;

  return (
    <Alert
      variant="warning"
      icon={<ClockIcon className="h-6 w-6" />}
      title={t("admin.operations.trades.stuckTitle")}
      action={
        <Button variant="danger" onClick={onResolve}>
          {t("admin.operations.trades.forceCancelTitle")}
        </Button>
      }
    >
      <p>
        {t("admin.operations.trades.stuckBody", {
          date: fmtDateTime(trade.firstWarehouseArrivalAt) ?? "",
        })}
      </p>
    </Alert>
  );
}
