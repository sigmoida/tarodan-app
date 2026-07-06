/** @format */

import Link from "next/link";
import { Badge, StatusBadge, tradeStatusConfig } from "@tarodan/ui";
import { getTradeStatusLabel, type Trade } from "../_lib/types";

export default function TradeDetailHeader({
  trade,
  locale,
  description,
}: {
  trade: Trade;
  locale: string;
  description: string;
}) {
  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/profile/trades"
          className="text-primary-500 hover:text-primary-600 mb-4 inline-block"
        >
          ← Takaslara Dön
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-heading">Takas Detayı</h1>
            <div className="flex items-center gap-4 mt-1">
              <p className="text-muted">Takas No: {trade.tradeNumber}</p>
              {trade.version && trade.version > 1 && (
                <Badge variant="primary" size="sm">
                  {locale === "en"
                    ? `Counter-offer #${trade.version - 1}`
                    : `Karşı Teklif #${trade.version - 1}`}
                </Badge>
              )}
            </div>
          </div>
          <StatusBadge
            status={trade.status}
            config={tradeStatusConfig}
            label={getTradeStatusLabel(trade.status, locale)}
          />
        </div>
      </div>

      {/* Status Description */}
      <div className="card p-4 mb-6 bg-primary-50 border-primary-200">
        <p className="text-sm text-primary-800">{description}</p>
        {(trade.status === "cancelled" || trade.status === "rejected") &&
          trade.cancelReason && (
            <p className="text-sm text-muted mt-2">
              <span className="font-medium">
                {locale === "en" ? "Reason: " : "Sebep: "}
              </span>
              {trade.cancelReason}
            </p>
          )}
      </div>
    </>
  );
}
