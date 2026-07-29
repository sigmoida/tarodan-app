"use client";

import { useTranslations } from "next-intl";
import type { HistoryEntry, RefundRequestDetail } from "../types";
import { TechRow } from "../_components/Field";

export function RefundTechnicalDetails({
  rr,
  history,
}: {
  rr: RefundRequestDetail;
  history: HistoryEntry[];
}) {
  const t = useTranslations();
  return (
    <details className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
      <summary className="cursor-pointer select-none text-sm font-medium text-muted">
        {t("admin.operations.refundRequests.technicalDetails")}
      </summary>
      <div className="mt-4 space-y-2 text-xs">
        <TechRow
          label={t("admin.operations.refundRequests.requestId")}
          value={rr.id}
          mono
        />
        <TechRow
          label={t("admin.operations.refundRequests.returnProviderRaw")}
          value={rr.returnProvider}
          mono
        />
        <TechRow
          label={t("admin.operations.refundRequests.providerRefundId")}
          value={rr.providerRefundId}
          mono
        />
        {history.length > 0 && (
          <div>
            <div className="mb-1 font-medium text-body">
              {t("admin.operations.refundRequests.rawHistory")}
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-surface-alt p-3 text-muted">
              {JSON.stringify(history, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}
