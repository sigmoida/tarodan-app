/** @format */

import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import type { Trade } from "../_lib/types";

export default function TradeMessages({ trade }: { trade: Trade }) {
  if (!(trade.initiatorMessage || trade.receiverMessage)) return null;

  return (
    <div className="card p-6 mb-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <ChatBubbleLeftRightIcon className="w-5 h-5" />
        Mesajlar
      </h3>
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
    </div>
  );
}
