/** @format */

import SectionCard from "@/components/ui/SectionCard";
import type { Trade } from "../_lib/types";

export default function TradeMessages({ trade }: { trade: Trade }) {
  if (!(trade.initiatorMessage || trade.receiverMessage)) return null;

  return (
    <SectionCard title="Mesajlar" className="mb-6">
      <div className="space-y-4">
        {trade.initiatorMessage && (
          <div>
            <p className="text-sm font-medium text-body mb-1">
              {trade.initiatorName}:
            </p>
            <p className="text-muted">{trade.initiatorMessage}</p>
          </div>
        )}
        {trade.receiverMessage && (
          <div>
            <p className="text-sm font-medium text-body mb-1">
              {trade.receiverName}:
            </p>
            <p className="text-muted">{trade.receiverMessage}</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
