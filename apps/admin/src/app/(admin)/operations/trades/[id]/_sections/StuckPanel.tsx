"use client";

import { Button } from "@tarodan/ui";
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
    <div className="rounded-xl border-2 border-warning-400 bg-warning-50 p-6 shadow-sm">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-start gap-3">
          <ClockIcon className="h-8 w-8 flex-shrink-0 text-warning-700" />
          <div>
            <h2 className="text-lg font-semibold text-warning-900">
              {t("admin.operations.trades.stuckTitle")}
            </h2>
            <p className="mt-1 text-sm text-warning-800">
              {t("admin.operations.trades.stuckBody", {
                date: fmtDateTime(trade.firstWarehouseArrivalAt) ?? "",
              })}
            </p>
          </div>
        </div>
        <Button
          variant="danger"
          onClick={onResolve}
          className="sm:flex-shrink-0"
        >
          {t("admin.operations.trades.forceCancelTitle")}
        </Button>
      </div>
    </div>
  );
}
