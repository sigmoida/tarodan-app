"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { NoSymbolIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { usePermissions } from "@/context/PermissionsContext";
import { tradeCancelPanelState } from "../_lib/adminCancel";
import { AdminCancelTradeModal } from "../_modals/AdminCancelTradeModal";
import type { TradeDetail } from "../types";

/**
 * Platform (admin) takas iptali — yalnız super_admin görür (API de yalnız
 * super_admin'i kabul eder). Uygunsa düğme + modal; uygun değilse (ama takas
 * kapanmamışsa) ortak kuralın engel metni, yani hangi aksiyonun bu aşamaya ait
 * olduğu. Kapanmış takasta hiçbir şey gösterilmez.
 */
export function AdminCancelPanel({ trade }: { trade: TradeDetail }) {
  const t = useTranslations();
  const { isSuperAdmin } = usePermissions();
  const [open, setOpen] = useState(false);

  if (!isSuperAdmin) return null;
  const state = tradeCancelPanelState(trade);
  if (state.kind === "hidden") return null;

  if (state.kind === "blocked") {
    return (
      <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-sm">
        <p className="font-medium text-heading">
          {t("admin.operations.trades.adminCancel.blockedTitle")}
        </p>
        <p className="mt-1 text-muted">{t(state.messageKey)}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <NoSymbolIcon className="h-6 w-6 flex-shrink-0 text-danger-600" />
          <p className="text-sm text-muted">
            {t("admin.operations.trades.adminCancel.warning")}
          </p>
        </div>
        <Button
          variant="danger"
          onClick={() => setOpen(true)}
          className="sm:flex-shrink-0"
        >
          {t("admin.operations.trades.adminCancel.action")}
        </Button>
      </div>
      <AdminCancelTradeModal
        open={open}
        onClose={() => setOpen(false)}
        trade={trade}
      />
    </div>
  );
}
