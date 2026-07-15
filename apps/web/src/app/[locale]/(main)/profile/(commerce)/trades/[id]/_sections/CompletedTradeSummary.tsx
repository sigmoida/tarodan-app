/** @format */

import type { Translate } from "@/types/i18n";

import { Link } from "@/i18n/navigation";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import type { Trade } from "../_lib/types";

/** BCP-47 date-format locale for the active UI language. */
const DATE_LOCALES: Record<string, string> = { en: "en-US", tr: "tr-TR" };

export default function CompletedTradeSummary({
  trade,
  locale,
  t,
}: {
  trade: Trade;
  locale: string;
  t: Translate;
}) {
  if (trade.status !== "completed") return null;

  const fmtDate = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString(DATE_LOCALES[locale] ?? "tr-TR", {
          dateStyle: "medium",
        })
      : "—";

  return (
    <div className="card p-6 mb-6 bg-success-50 border-2 border-success-200 rounded-xl">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-success-500 flex items-center justify-center">
          <CheckCircleIcon className="w-7 h-7 text-inverted" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-success-800 mb-1">
            {t("trade.completedSummaryTitle")}
          </h2>
          <p className="text-success-700 text-sm mb-4">
            {t("trade.completedSummaryDesc")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                {t("trade.createdAt")}
              </p>
              <p className="text-sm font-semibold text-heading">
                {fmtDate(trade.createdAt)}
              </p>
            </div>
            {trade.acceptedAt && (
              <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                  {t("trade.acceptedAt")}
                </p>
                <p className="text-sm font-semibold text-heading">
                  {fmtDate(trade.acceptedAt)}
                </p>
              </div>
            )}
            {trade.completedAt && (
              <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                  {t("trade.completedAt")}
                </p>
                <p className="text-sm font-semibold text-heading">
                  {fmtDate(trade.completedAt)}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/profile/trades"
              className="inline-flex items-center gap-2 px-4 py-2 bg-success-600 hover:bg-success-700 text-inverted rounded-lg font-medium transition-colors text-sm"
            >
              {t("trade.backToTrades")}
            </Link>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface-elevated hover:bg-success-100 text-success-800 border border-success-300 rounded-lg font-medium transition-colors text-sm"
            >
              {t("trade.browseListings")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
