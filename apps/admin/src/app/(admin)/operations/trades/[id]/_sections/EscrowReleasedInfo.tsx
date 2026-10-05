"use client";

import { BanknotesIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { EarlyReleaseBadge } from "@/components/finance/EarlyReleaseBadge";
import { fmtDateTime } from "@/lib/format";
import type { TradeDetail } from "../types";

const latest = (dates: string[]) =>
  dates.reduce((a, b) => (new Date(b) > new Date(a) ? b : a));

/**
 * Serbest bırakılmış takas escrow'unun özeti: gerçek tarih + planlanan tarih +
 * (erken bırakıldıysa) "N gün erken". `EscrowReleasePanel` bırakma sonrası
 * kaybolur; fark bu kart sayesinde sonradan da okunur. Rol şartı yok — salt okunur.
 */
export function EscrowReleasedInfo({ trade }: { trade: TradeDetail }) {
  const t = useTranslations();

  const rows = trade.cashPayments?.length
    ? trade.cashPayments
    : trade.cashPayment
      ? [trade.cashPayment]
      : [];
  // Planlanan tarihi olan (damgalı) ve bırakılmış satırlar; iade borcu satırı
  // (damgasız) bu bilginin konusu değil.
  const released = rows.filter((row) => row.releasedAt && row.holdReleaseAt);
  if (released.length === 0) return null;

  const releasedAt = latest(released.map((row) => row.releasedAt as string));
  const plannedAt = latest(released.map((row) => row.holdReleaseAt as string));

  return (
    <div className="rounded-xl border border-border bg-surface-alt p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <BanknotesIcon className="h-7 w-7 flex-shrink-0 text-muted" />
        <div className="flex flex-col items-start gap-1">
          <h2 className="text-base font-semibold text-heading">
            {t("admin.operations.trades.escrowReleasedTitle")}
          </h2>
          <p className="text-sm text-body">
            {t("admin.operations.trades.escrowReleasedBody", {
              releasedAt: fmtDateTime(releasedAt) ?? "",
              plannedAt: fmtDateTime(plannedAt) ?? "",
            })}
          </p>
          <EarlyReleaseBadge releaseAt={plannedAt} releasedAt={releasedAt} />
        </div>
      </div>
    </div>
  );
}
